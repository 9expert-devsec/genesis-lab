'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Eye, EyeOff, ChevronUp, ChevronDown, ChevronRight, Copy, Trash2, Plus, Ban,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { slotsOf, MAX_SECTION_DEPTH } from '@/lib/pageBuilder/containerSlots';
import { labelOf, sectionSummary, sectionRendersEmpty, sectionChildCounts } from '@/lib/pageBuilder/sectionLabels';
import { iconOf } from '@/lib/pageBuilder/sectionIcons';
import { countDescendants } from '@/lib/pageBuilder/sectionDescendants';
import { newSection } from '@/lib/pageBuilder/newSection';
import { useEditor } from './EditorProvider';
import { depthOfPath, getAt, parentSectionPath, pathToKey } from './pagePath';
import { useTreeDrag } from './useTreeDrag';
import { SectionPicker } from './SectionPicker';

/**
 * Structure panel — the page tree, and every structural action on it.
 *
 * Reads the tree straight from the reducer and dispatches; it holds no state of
 * its own, so what you see is what will save. Rows are addressed by PATH, never
 * id (ids are not unique across the tree — see pagePath.js).
 *
 * The depth cap is MARKED here but NOT enforced here. Nothing in this panel can
 * create depth: MOVE_SECTION is sibling-scoped and DUPLICATE_SECTION inserts as
 * a sibling, so both keep a node at its current depth. Only the add-section
 * picker (item 4) can push a node deeper, so the picker owns the refusal —
 * splitting enforcement across two places is how one half rots. What this panel
 * owes the author is that the limit is legible BEFORE they build into it, which
 * is what the cap badge is.
 */

const SLOT_LABELS = { children: null, left: 'ซ้าย', right: 'ขวา' };

/**
 * The child count for a container row, as text — or null for anything else.
 *
 * ── THE SLOT SPLIT IS THE HONEST PART ──────────────────────────────────────
 * `sectionChildCounts` refuses to sum across slots, and this refuses to hide
 * the split: a single-slot container reads "6 section", but a two_column reads
 * "ซ้าย 4 · ขวา 2", because summing those into "6" would describe one list of
 * six sitting where two lists actually are — contradicting the two labelled
 * slot lists this panel draws directly underneath the row.
 *
 * Reuses SLOT_LABELS, which is already the one place a slot's name is written
 * down. A slot whose label is null (`children`) has no name worth printing —
 * it is the only slot — so the bare count stands for it.
 */
function childCountLabel(section) {
  const counts = sectionChildCounts(section);
  if (!counts) return null;
  if (counts.length === 1) return `${counts[0].count} section`;
  return counts.map(({ slot, count }) => `${SLOT_LABELS[slot] ?? slot} ${count}`).join(' · ');
}

const StructureContext = createContext(null);
const useStructure = () => useContext(StructureContext);

/**
 * ── THE HIT AREA REACHES 24px, AND WIDTH IS WHAT PAID FOR IT ───────────────
 * Round 17 measured this button at 22px square — under the 24px floor — and
 * declined to fix it, on the grounds that the only currency available inside a
 * 260px column was the row label's 85px, and buying a hit area out of a label
 * that already truncates is not a fix.
 *
 * Round 28 widened the column to the designed 276px. The 16px that bought is
 * what this spends: the glyph goes 14 → 16px, which with the SAME `p-1` puts
 * the target at exactly 24. The padding is deliberately untouched — it IS the
 * hit area, and test/render/panelPolish asserts every action still carries it.
 */
function IconButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'rounded-9e-sm p-1 text-9e-slate-dp-50 transition-colors',
        'hover:bg-[var(--surface-hover)] hover:text-9e-navy dark:hover:text-white',
        'disabled:pointer-events-none disabled:opacity-30',
        danger && 'hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40'
      )}
    >
      {children}
    </button>
  );
}

/**
 * A container sitting at the cap. Any child added here would be depth
 * MAX_SECTION_DEPTH + 1, which SectionRenderer drops — silently, in production.
 * Saying so on the row means item 4's refusal is never a surprise.
 */
/**
 * A section that currently renders nothing on the page. Explains why the canvas
 * has no counterpart for this row, at the row — see sectionRendersEmpty.
 */
function EmptyBadge() {
  return (
    <span
      title="section นี้ยังว่าง จึงไม่แสดงผลบนหน้าเว็บ"
      className="shrink-0 rounded-full border border-[var(--surface-border)] px-1.5 py-0.5 text-[10px] text-9e-slate-dp-50"
    >
      ว่าง
    </span>
  );
}

function CapBadge() {
  return (
    <span
      title={`ชั้นซ้อนลึกสุดแล้ว (${MAX_SECTION_DEPTH}) — เพิ่ม section ซ้อนข้างในไม่ได้`}
      className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
    >
      ลึกสุด
    </span>
  );
}

/**
 * Delete confirmation — EVERY delete, not only containers.
 *
 * ── WHY THE FRICTION, AND WHEN IT MAY BE RELAXED (round 1) ────────────────
 * There is NO UNDO anywhere in this editor: editorReducer.js keeps no history,
 * and autosave writes the tree shortly after the dispatch. So a single stray
 * click on a 3.5×3.5 icon is a permanent loss of authored work, and for a
 * container it silently takes every descendant with it.
 *
 * The confirm is therefore deliberate friction standing in for the undo that
 * does not exist yet. ROUND 1 is where undo (a history stack in
 * editorReducer.js) is expected to land; whoever writes it should come back
 * here and decide whether this can be relaxed to containers-only — or dropped
 * for leaves entirely — because at that point the loss becomes recoverable and
 * the friction stops paying for itself. Until then it applies to everything,
 * on purpose: "only containers are dangerous" is false when nothing can be
 * taken back.
 *
 * ── Radix Dialog, NOT window.confirm and NOT AlertDialog ──────────────────
 * Same primitive and same shape as SectionPicker (focus trap / Escape / aria
 * are what a hand-rolled modal gets subtly wrong). @radix-ui/react-alert-dialog
 * is not a dependency of this repo and this is not worth adding one for —
 * Dialog gives the same trap; what AlertDialog would add on top is the default
 * focus placement, which is set explicitly below.
 *
 * ── The destructive button is NOT autofocused ─────────────────────────────
 * Radix focuses the first tabbable child on open. That would put focus on a
 * button where Enter — the key someone rattling through the keyboard is most
 * likely to hit next — destroys the section, turning the confirm into a second
 * click rather than a decision. Focus goes to ยกเลิก instead, and Escape (the
 * Dialog's own) cancels.
 */
function ConfirmDeleteDialog({ pending, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const nested = pending ? countDescendants(pending.section) : 0;

  return (
    <Dialog.Root open={Boolean(pending)} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => { e.preventDefault(); cancelRef.current?.focus(); }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(30rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl'
          )}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">
                ลบ “{labelOf(pending?.section?.type)}” ?
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-9e-slate-dp-50">
                {nested > 0
                  ? `section ที่ซ้อนอยู่ข้างในอีก ${nested} รายการจะถูกลบไปพร้อมกันทั้งหมด`
                  : 'section นี้จะถูกลบออกจากหน้า'}
              </Dialog.Description>
              {/* Says why it asks at all — the same reason the block comment
                  above gives, in the author's language. */}
              <p className="mt-2 text-xs text-9e-slate-dp-50">
                ตัวแก้ไขยังไม่มีปุ่มเลิกทำ — ลบแล้วกู้คืนไม่ได้
              </p>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                ref={cancelRef}
                type="button"
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-9e-navy dark:text-white hover:bg-[var(--surface-hover)]"
              >
                ยกเลิก
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-9e-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              ลบ
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SectionNode({ section, path, siblingCount }) {
  const { dispatch, selection } = useEditor();
  const {
    getDragSourceProps, getDropTargetProps, isDragging, isDropTarget,
    requestDelete, isExpanded, toggleExpanded,
  } = useStructure();

  const index = path[path.length - 1];
  const slots = slotsOf(section?.type);
  // A container is any type with slots — the same test the cap badge and the
  // child count already use, so "has a disclosure control" and "has children
  // to count" can never disagree.
  const isContainer = Boolean(slots);
  const open = isContainer && isExpanded(section, path);
  const hidden = section?.enabled === false;
  const selected = selection?.length === path.length && selection.every((k, i) => path[i] === k);
  const atCap = Boolean(slots) && depthOfPath(path) >= MAX_SECTION_DEPTH;
  const summary = sectionSummary(section);
  // A section that renders nothing has a row here but no counterpart on the
  // canvas (which shows what publishes). Marked so that gap reads as "this is
  // empty" rather than "the canvas is broken". Not shown for a hidden section —
  // the strikethrough already explains that one, and both at once is noise.
  const willBeEmpty = !hidden && sectionRendersEmpty(section);

  const TypeIcon = iconOf(section?.type);
  const typeLabel = labelOf(section?.type);
  // The author's own name wins when they gave one; the round-16 fallback —
  // summary, else type label — stands in when they did not. Trimmed, because a
  // name of nothing but spaces is a field the author cleared, not a name.
  const name = typeof section?.name === 'string' ? section.name.trim() : '';
  const primary = name || summary || typeLabel;
  // Line 2 is assembled from the parts line 1 did NOT already say. The type
  // label appears here only when line 1 is something else; the child count
  // only for containers, which is what sectionChildCounts returns null for
  // everything else to guarantee — a row with no slots must show no count
  // rather than "0", which would describe a heading as an empty container.
  //
  // The final equality check closes the one case the part-by-part rule cannot
  // reach: an author is free to type a name that reads exactly like the
  // assembled second line, and dropping the duplicate is cheaper than
  // forbidding the name.
  const assembled = [
    primary === typeLabel ? null : typeLabel,
    childCountLabel(section),
  ].filter(Boolean).join(' · ');
  const secondary = assembled === primary ? '' : assembled;

  const move = (to) => dispatch({ type: 'MOVE_SECTION', path, to });

  return (
    /**
     * ── ROUND 40: THE `<li>` IS THE DROP TARGET, AND THE CARD IS NOT ────────
     * The `<li>` holds the card AND, when the container is open, its drawer —
     * they are siblings, not parent and child. Round 29 named the consequence
     * and it is why this had to move: an indicator drawn on the CARD renders at
     * the top of a 54px box that may be sitting above 300px of drawer, so it
     * points at a boundary the drop would not land on. Measured on the round-29
     * fixture: one open container's `<li>` is 1308px tall against its card's 54.
     *
     * The indicator is therefore on the element whose top edge IS the insertion
     * point for the whole subtree.
     *
     * `position: relative` because the indicator is an inset element rather than
     * a border: a border-top here would shift every row below it by 2px on
     * hover, which is the jitter round 31 removed from the tab strip.
     */
    <li
      {...getDropTargetProps(path)}
      className={cn('relative', isDropTarget(path) && 'before:absolute before:inset-x-0 before:-top-1'
        + ' before:h-0.5 before:rounded-full before:bg-9e-action before:content-[""]')}
    >
      {/* The row is the drag source and drop target, NOT a control: selection
          is the label button below. A role="button" here would nest the eye and
          menu buttons inside a button, which is invalid and costs keyboard
          access to the very actions the row exists for.

          ── ROUND 40: THE ROW IS A CARD ─────────────────────────────────────
          Round 29's step 4. The design draws a bordered, padded, two-line card
          with a filled tile and a selected state carrying a gradient, a border
          and an inset left bar. What follows is that shape resolved onto this
          repo's scales and tokens — see the tile's own note for the two
          geometry values that could not be taken literally.

          `items-start`, not `items-center`: the text block is two lines and the
          controls align to the FIRST one, or a card whose subtitle wraps drops
          its buttons half a line and the column of controls stops being a
          column.

          The selected state carries three signals because the design does, and
          each survives a different failure: the left bar is visible when the
          card is clipped at its leading edge, the border when a background is
          overridden, the tint when neither is. All three resolve to the CI
          action token — no colour is taken from the design (rounds 28/30/39). */}
      <div
        {...getDragSourceProps(path)}
        className={cn(
          // ── C's TRADE, AND IT IS THE PADDING THAT GAVE WAY ────────────────
          // The design draws px 8 gap 6. Both were built and MEASURED at 276px:
          // a nested row's label button went from 14.38px to 2.38px, because
          // the extra 4px of padding and 2px on each of five gaps come out of
          // the one flexible child. So the card keeps gap-1 (4px) and px-1.5
          // (6px) — the values the row already had — and everything else the
          // design gives: the tile, the border, the radius, the two-line block,
          // the three-signal selected state and 8px between cards.
          //
          // What did NOT give way, per round 29's verdict and this round's rule:
          // all four action buttons, the eye, and the 24px hit-area floor.
          'group relative flex items-start gap-1 rounded-9e-sm border px-1.5 py-1.5 text-xs',
          'cursor-grab active:cursor-grabbing',
          selected
            ? 'border-9e-action/40 bg-gradient-to-r from-9e-action/10 to-transparent'
            : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]',
          isDragging(path) && 'opacity-40'
        )}
      >
        {/* The inset left bar. An element rather than a border, because the
            card already spends its border on the selected outline. */}
        {selected && (
          <span
            data-testid="row-selected-bar"
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-9e-action"
            aria-hidden
          />
        )}
        {/* ── ONE LEADING COLUMN, 24px WIDE, TWO THINGS IN IT ────────────────
            A container gets the disclosure control; a leaf gets round 17's type
            icon, centred in a box of the same size so the two line up down the
            list. A tree whose disclosers and whose icons start at different
            offsets reads as two lists interleaved.

            WHY THE CONTAINER GIVES UP ITS TYPE ICON, AND WHY THAT COSTS NOTHING.
            A container row ALWAYS states its type in text. When it has no name
            and no summary, line 1 is the type label itself; when it has either,
            childCountLabel forces a second line and the type label is the first
            thing on it — that is what the assembly a few lines up guarantees.
            So the glyph is the one place a container's type is said twice, and
            the disclosure control is the one thing a container has that a leaf
            does not. Swapping them where they are needed spends no width.

            WHY THERE IS NO DRAG HANDLE HERE, MEASURED. Chrome at the shipped
            276px: the label button is 76px on a top-level row and 24.4px on a
            nested one, because the action cluster and the visibility toggle
            take 120px and are in flow on every row at every depth whether or
            not they are visible. A handle costs 18px with its gap; retiring the
            position number repays 11.5. A nested row would be left under 8px of
            label, which is not a label. Round 29 reached the same arithmetic
            from the other side and concluded there is room for a handle AND the
            cluster on a 54px CARD with a two-line text block — which is its
            step 4, not this. The blocker to name for whoever takes that on is
            the 120px of always-in-flow controls, not the handle.

            Widening this column from 14px to 24px is what the position number
            paid for: 11.5px retired against 10px spent, so every row's label is
            1.5px wider than it was rather than narrower. */}
        {isContainer ? (
          <IconButton
            label={open ? 'ยุบ section ที่ซ้อนอยู่' : 'ขยายเพื่อดู section ที่ซ้อนอยู่'}
            onClick={() => toggleExpanded(section, path)}
          >
            <ChevronRight
              className={cn('h-4 w-4 transition-transform', open && 'rotate-90')}
              aria-hidden
            />
          </IconButton>
        ) : (
          /**
           * ── THE TILE, AND THE TWO NUMBERS THAT COULD NOT BE TAKEN ──────────
           * The design draws 29×29 at radius 7 with an 18px glyph. This is 24×24
           * at radius 8 with a 14px glyph, and both departures are the standing
           * rule rather than a compromise:
           *
           *   · 29 and 7 are on no scale this repo has. Round 17 established
           *     there are radius tokens (8/12/16/24) and NO custom spacing
           *     scale, and moved these panels onto Tailwind's stock steps rather
           *     than minting one. `rounded-9e-sm` IS 8px — one off the drawn 7,
           *     and the token wins for the same reason it won in round 28.
           *   · 24 is also the width every other leading slot in this list has
           *     had since round 32, and the disclosure control a container gets
           *     instead is 24. A tile of 29 would put the tiles and the chevrons
           *     on different left edges down the list, which is the "two lists
           *     interleaved" reading the shared column was built to prevent.
           *
           * MEASURED COST, and it is why 24 rather than 29 mattered: at 276px a
           * nested row's label button is 14.38px wide TODAY. Five more pixels of
           * tile takes it to nine. See the round report.
           *
           * A container still gets the disclosure control and no tile — round
           * 32's ruling, unchanged: a container always states its type in text,
           * so the glyph is the one place it would say it twice.
           */
          <span
            data-testid="row-tile"
            className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-9e-sm',
              selected ? 'bg-9e-action/15 text-9e-action' : 'bg-[var(--surface-muted)] text-9e-slate-dp-50'
            )}
          >
            <TypeIcon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}

        <button
          type="button"
          aria-current={selected ? 'true' : undefined}
          onClick={() => dispatch({ type: 'SELECT', path })}
          className={cn('min-w-0 flex-1 text-left', hidden && 'line-through opacity-50')}
        >
          {/* ── LINE 1: WHAT THIS SECTION IS, AS SPECIFICALLY AS THE DATA ALLOWS
              The author's NAME leads when there is one. The envelope has always
              declared that field; until the settings panel grew an input for it
              the value was written by nothing, which is why this line used to
              start at the summary and the note here said so.

              When the name is blank the fallback is unchanged — the summary
              when the type produces one (the heading's own text, the CTA's
              label, the image's alt), and the type label otherwise. The type
              label then moves to line 2, but ONLY when it is not already what
              line 1 said, so no row ever prints its type twice.

              ── WHAT THE POSITION NUMBER USED TO CARRY, AND WHAT NOW DOES NOT
              A leading number stood here from round 16 to round 32, for a
              reason this note used to state: sections with no name and no
              summary have no distinguishing data at all, and the number was
              what separated them. Round 17 gave the author a name field, which
              answers it for any section someone has named.

              IT DOES NOT ANSWER IT FOR THE UNNAMED. Measured rather than
              assumed: three adjacent unnamed rich_text sections render four
              distinct rows with the number and TWO without — all three read the
              bare word ข้อความ with no second line, and nothing on the row
              tells them apart. That is a real cost of retiring the number and
              it is not absorbed here: what should carry it instead is the
              canvas, which already knows which section is selected and could
              scroll to it, and a name the settings panel could offer to fill in
              from the section's own content. Neither is this round's.

              What line 1 still does is unchanged. The author's NAME leads when
              there is one; the summary stands in when the type produces one
              (the heading's own text, the CTA's label, the image's alt); the
              type label otherwise, in which case it does not repeat on line 2. */}
          <span
            data-testid="row-primary"
            className={cn(
              'block truncate font-medium',
              selected ? 'text-9e-navy dark:text-white' : 'text-9e-navy/80 dark:text-white/80'
            )}
          >
            {primary}
          </span>
          {/* The indent this line carried was the width of the number it used
              to hang under. With the number gone it hangs under nothing. */}
          {secondary && (
            <span data-testid="row-secondary" className="block truncate text-[10px] text-9e-slate-dp-50">
              {secondary}
            </span>
          )}
          {hidden && <span className="sr-only"> (ซ่อนอยู่)</span>}
        </button>

        {willBeEmpty && <EmptyBadge />}
        {atCap && <CapBadge />}

        <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label="ขึ้น" disabled={index === 0} onClick={() => move(index - 1)}>
            <ChevronUp className="h-4 w-4" />
          </IconButton>
          <IconButton label="ลง" disabled={index === siblingCount - 1} onClick={() => move(index + 1)}>
            <ChevronDown className="h-4 w-4" />
          </IconButton>
          <IconButton label="ทำซ้ำ" onClick={() => dispatch({ type: 'DUPLICATE_SECTION', path })}>
            <Copy className="h-4 w-4" />
          </IconButton>
          {/* Asks; it does NOT dispatch. REMOVE_SECTION is reached only from
              the confirm dialog below — see requestDelete / ConfirmDeleteDialog. */}
          <IconButton label="ลบ" danger onClick={() => requestDelete(path, section)}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </span>

        {/* Visibility rides the normal dirty/autosave path like every other
            edit — it is NOT an instant server write. The top bar's unsaved
            indicator and the beforeunload guard are what make that honest. */}
        <IconButton
          label={hidden ? 'แสดง section นี้' : 'ซ่อน section นี้'}
          onClick={() => dispatch({ type: 'TOGGLE_SECTION', path })}
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </IconButton>
      </div>

      {/* Only when open. A collapsed container renders no slot header, no
          child rows and no nested AddRow — the whole subtree is absent from
          the DOM rather than hidden with a class, so a collapsed page costs
          what it looks like it costs. The child COUNT round 16 puts on line 2
          is what keeps a closed container from being opaque: it says how many
          are in there without opening it. */}
      {open && slots?.map((slot) => {
        const kids = Array.isArray(section?.content?.[slot]) ? section.content[slot] : [];
        const slotLabel = SLOT_LABELS[slot];
        return (
          <div key={slot} className="ml-3 border-l border-[var(--surface-border)] pl-1.5">
            {/* ── ROUND 40: THE DRAWER HEADER AND ITS COUNT BADGE ────────────
                Round 29 lists a `COMPONENTS` header with a count badge. Both
                are here, with two departures from what it draws:

                THE WORD IS THE SLOT'S OWN, NOT "COMPONENTS". A single-slot
                container has no slot name to show and gets the generic word;
                `two_column` has two slots and each keeps its own name, because
                a drawer headed COMPONENTS twice would say nothing about which
                column an author is looking at. SLOT_LABELS is still the one
                place a slot is named — this reads it rather than restating it.

                THE BADGE COUNTS THIS SLOT AND NEVER SUMS. Round 16 built
                sectionChildCounts per-slot and refused to sum across slots for
                exactly this shape; a `two_column` holding 2 and 2 shows 2 on
                each drawer, never 4 anywhere. The number here is the length of
                the slot the drawer is drawing, so it cannot sum by
                construction — there is no second slot in scope to add.

                THE SIZE IS THE SCALE'S, NOT THE DESIGN'S 8px. Round 17 ruled
                there is no type token family here and moved these panels onto
                Tailwind's stock scale, whose smallest step is 12px. Round 28's
                pin allows exactly THREE off-scale sizes in this file and gives
                the reason: each sits where the row's label measurably has no
                width to give. Neither of these does — the drawer header owns a
                full line with nothing competing — so the exception does not
                apply and both take text-xs. The pin stays at three. */}
            <p className="flex items-center gap-1.5 px-1.5 pb-0.5 pt-2">
              <span
                data-testid="slot-header"
                className="text-xs font-bold uppercase tracking-wide text-9e-slate-dp-50/70"
              >
                {slotLabel ?? 'Components'}
              </span>
              <span
                data-testid="slot-count"
                className="rounded-full border border-[var(--surface-border)] px-1.5 text-xs text-9e-slate-dp-50"
              >
                {kids.length}
              </span>
            </p>
            <SectionList sections={kids} basePath={[...path, 'content', slot]} />
          </div>
        );
      })}
    </li>
  );
}

/**
 * The insertion point for ONE list — the top-level list or a container slot.
 * `basePath` IS the parentPath an ADD_SECTION would use, so the depth question
 * is answerable right here: a child appended to this list would sit at
 * depthOfPath([...basePath, 0]).
 *
 * When that exceeds the cap the refusal is rendered IN PLACE of the button,
 * with the reason, rather than as a disabled control with a tooltip. A control
 * that greys out without saying why reads as a bug; the author has to learn the
 * rule exists at the moment it stops them. The "ลึกสุด" badge on the container
 * row above has already said the same thing, so this is a confirmation, not a
 * surprise.
 */
function AddRow({ basePath, count }) {
  const { openPicker } = useStructure();
  const childDepth = depthOfPath([...basePath, 0]);

  if (childDepth > MAX_SECTION_DEPTH) {
    return (
      <p
        title={`section ที่ซ้อนลึกเกิน ${MAX_SECTION_DEPTH} ชั้นจะไม่ถูกแสดงผลบนหน้าเว็บจริง`}
        className="flex items-center gap-1 px-1.5 py-1.5 text-xs text-amber-700 dark:text-amber-400"
      >
        <Ban className="h-3 w-3 shrink-0" aria-hidden />
        ซ้อนได้ลึกสุด {MAX_SECTION_DEPTH} ชั้น — เพิ่มที่นี่ไม่ได้
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openPicker(basePath, count)}
      className={cn(
        'mt-1 flex w-full items-center gap-1 rounded-9e-sm border border-dashed',
        'border-[var(--surface-border)] px-1.5 py-1.5 text-xs text-9e-slate-dp-50',
        'hover:border-9e-action/40 hover:bg-[var(--surface-hover)] hover:text-9e-action'
      )}
    >
      <Plus className="h-3 w-3 shrink-0" aria-hidden />
      เพิ่ม section
    </button>
  );
}

/**
 * `addRow` is FALSE for exactly one list — the top-level one, whose insertion
 * point is pinned in the panel's footer instead (see StructurePanel below). It
 * is not a style switch: a list that both rendered its AddRow here and had one
 * pinned would offer the same insertion point twice.
 *
 * It defaults TRUE because every OTHER list must keep its own. A nested AddRow
 * inserts into ITS container's slot — `basePath` is that slot's path — so it
 * only means anything while sitting under the container it belongs to, and it
 * has to travel with that container when the list scrolls. Pinning one of
 * those would strand an insertion point for a slot that had scrolled out of
 * sight, which is worse than not pinning it at all.
 */
function SectionList({ sections, basePath, addRow = true }) {
  return (
    <>
      {/* ROUND 40: 8px between cards — the one spacing value the design gives
          that this repo's scale expresses exactly (space-y-2 IS 8px). Cards
          need separation to read as cards; the 2px this carried did not give
          it. */}
      {sections.length > 0 && (
        <ul className="space-y-2">
          {sections.map((section, i) => (
            <SectionNode
              key={section?.id ?? `${basePath.join('.')}.${i}`}
              section={section}
              path={[...basePath, i]}
              siblingCount={sections.length}
            />
          ))}
        </ul>
      )}
      {addRow && <AddRow basePath={basePath} count={sections.length} />}
    </>
  );
}

/**
 * The key a container's open/shut state is remembered under.
 *
 * ── IT IS THE SECTION'S ID, NOT ITS PATH, AND THAT IS NOT A PREFERENCE ────
 * A path is a POSITION, and every action this panel offers moves positions.
 * Keyed by path, an open container closes itself the moment a sibling is added
 * above it, deleted above it, or moved past it — MOVE_SECTION rewrites the
 * array, so `sections.1` stops meaning the node the author opened and starts
 * meaning whatever took its place. Measured, not reasoned: the interaction
 * probe caught exactly this — one click of ขึ้น on the row below an open
 * container shut it and left the key pointing at a leaf.
 *
 * An id follows the node through all four. It is the one thing about a section
 * that a reorder does not touch.
 *
 * ── WHY THE PANEL STILL ADDRESSES BY PATH EVERYWHERE ELSE ────────────────
 * This does NOT reopen pagePath.js's rule. That rule is about ADDRESSING — a
 * dispatch that edits the wrong node because two ids collide is a wrong edit,
 * and paths are unambiguous by construction. This is view state: the worst a
 * collision can do here is open two containers at once, which is cosmetic and
 * self-evident. The editor's DUPLICATE_SECTION deep re-ids through
 * reidSection, and so does the server's duplicateSection — the same module —
 * so a collision needs a page that predates that shared walk.
 *
 * A section with no id at all falls back to its path, which is wrong under a
 * reorder in exactly the way described above — but a section with no id cannot
 * be addressed reliably by anything, and losing its open state is the mildest
 * consequence available.
 */
function expandKey(section, path) {
  return section?.id ? `id:${section.id}` : `path:${pathToKey(path)}`;
}

/**
 * Every container between the page and `path`, as keys — the set that has to
 * be open for `path` to be on screen at all.
 *
 * parentSectionPath returns NULL at the top level rather than an empty array
 * (see pagePath.js for why), which is exactly what terminates this walk.
 */
function ancestorKeys(page, path) {
  const out = [];
  for (let p = parentSectionPath(path); p; p = parentSectionPath(p)) out.push(expandKey(getAt(page, p), p));
  return out;
}

/**
 * @param {string[]} [initialExpanded] section IDS open on first render.
 *   PRODUCTION PASSES NOTHING and a test asserts EditorShell still doesn't —
 *   every container starts closed there. It exists because collapse is state,
 *   and the two things that need to observe the OPEN tree cannot dispatch into
 *   it: the render tests build static markup (never a React root — the runner
 *   is isolation:'none' and one leaked root breaks unrelated files), and the
 *   fit probe measures a page at both extremes in one pass. Seeding is the
 *   only way either reaches the expanded case, so it is a real parameter with
 *   a documented default rather than a hook reached into from outside.
 */
export function StructurePanel({ initialExpanded = [] }) {
  const { page, dispatch, selection } = useEditor();
  const sections = Array.isArray(page?.sections) ? page.sections : [];

  /**
   * ── COLLAPSE IS VIEW STATE AND IT STAYS OUT OF THE DOCUMENT ─────────────
   * It lives here, in a hook, keyed by context path — NOT in the reducer's
   * page tree. Round 15 ruled the same way for the settings panel's tabs and
   * the reason is the same one: `page` is what autosave serialises, so a
   * toggle written into it would mark the document dirty, race the 5s debounce
   * and publish a view preference as content. Nothing below dispatches; the
   * only writer is setExpanded, and PATCH_SECTION never sees a key.
   *
   * Keys, not paths: a path is a fresh array every render, so a Set of paths
   * would never match itself. pathToKey is the same serialisation the drag
   * hook uses for the same reason.
   *
   * WHY CLOSED BY DEFAULT. Round 29 measured its example page at 1297px in a
   * panel that cannot collapse against 407px collapsed, and named collapse —
   * not row height — as the variable that decides whether the panel is usable
   * at all. Closed-by-default is also what makes a container's cost legible:
   * an open container's children are indistinguishable from its siblings in a
   * flat list, which is the confusion the indent rule was fighting. What keeps
   * a closed container from being opaque is round 16's child count, which is
   * on the row whether it is open or shut.
   */
  const [expanded, setExpanded] = useState(
    () => new Set(initialExpanded.map((id) => `id:${id}`))
  );

  const isExpanded = useCallback(
    (section, path) => expanded.has(expandKey(section, path)),
    [expanded]
  );
  const toggleExpanded = useCallback((section, path) => {
    const key = expandKey(section, path);
    setExpanded((prev) => {
      const next = new Set(prev);
      // delete() reports whether it removed anything, so this is one lookup.
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  /**
   * ── A COLLAPSED ANCESTOR MUST NEVER HIDE THE SELECTION ──────────────────
   * The trap: SELECT is dispatched from the CANVAS too, and ADD_SECTION,
   * DUPLICATE_SECTION and MOVE_SECTION all set the selection themselves — to a
   * path that may sit inside a closed container. The settings panel would then
   * be editing a section with no row on screen.
   *
   * So a selection change opens whatever it is inside. An EFFECT rather than a
   * derivation on purpose: derived, the ancestors of the selection would be
   * permanently open and their chevrons would be dead controls. Written into
   * the set, the author can close them again afterwards, and the next
   * selection into that subtree opens it again.
   *
   * The identity guard is what makes a repeated SELECT of the same row free:
   * returning `prev` unchanged is a bail-out React does not re-render for.
   */
  useEffect(() => {
    if (!selection) return;
    const keys = ancestorKeys(page, selection);
    if (keys.length === 0) return;
    setExpanded((prev) => {
      if (keys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of keys) next.add(k);
      return next;
    });
    // `page` is a dependency because the ancestors' IDS are read out of it.
    // Every edit produces a new page object, so this runs often — the identity
    // bail-out above is what makes those runs free.
  }, [selection, page]);

  // { parentPath, index } while the picker is open, else null.
  const [target, setTarget] = useState(null);
  // { path, section } while a delete is awaiting confirmation, else null. The
  // SECTION is captured here, not re-read at confirm time: the dialog names what
  // it is about to delete and counts what goes with it, and both must describe
  // the row that was clicked.
  const [pendingDelete, setPendingDelete] = useState(null);

  const onMove = useCallback(
    (path, to) => dispatch({ type: 'MOVE_SECTION', path, to }),
    [dispatch]
  );
  const drag = useTreeDrag(onMove); // already a stable object — see useTreeDrag.js

  const openPicker = useCallback((parentPath, index) => setTarget({ parentPath, index }), []);

  // The ONLY path to REMOVE_SECTION. A row's ลบ button opens this; the dispatch
  // happens in confirmDelete below, never at the click.
  const requestDelete = useCallback((path, section) => setPendingDelete({ path, section }), []);
  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    dispatch({ type: 'REMOVE_SECTION', path: pendingDelete.path });
    setPendingDelete(null);
  }, [dispatch, pendingDelete]);

  const onPick = useCallback((type) => {
    if (!target) return;
    // newSection throws on a type the schema has no member for — let it. The
    // picker only ever offers types the renderer can draw, so a throw here
    // means those two lists have drifted, and a section the schema rejects
    // must not reach the tree quietly.
    dispatch({
      type: 'ADD_SECTION',
      parentPath: target.parentPath,
      index: target.index,
      section: newSection(type),
    });
    setTarget(null);
  }, [dispatch, target]);

  // Stable identity or every row re-renders on any panel render — useTreeDrag
  // memoizes for that reason, and spreading it into a fresh object here would
  // throw that away.
  const ctx = useMemo(
    () => ({ ...drag, openPicker, requestDelete, isExpanded, toggleExpanded }),
    [drag, openPicker, requestDelete, isExpanded, toggleExpanded]
  );

  return (
    <StructureContext.Provider value={ctx}>
      {/* ── THE SCROLLING BAND — THE ONLY SCROLLER THIS PANEL ADDS ─────────
          `flex-1` is what absorbs the height EditorShell's `split` hands over,
          so the panel's outer height is whatever the grid row gives it no
          matter how tall the heading above or the footer below grows. The
          `p-3` is the padding the shared Panel body used to apply; it moves in
          here with the scroll, so the list keeps the inset it had.

          THE GUTTER SITS ON THIS ELEMENT BECAUSE THIS IS THE ELEMENT THAT
          SCROLLS. Round 13 proved the converse by counter-example on the
          section picker: left behind on an ancestor that no longer scrolls, a
          reserved gutter reserves space against a scrollbar that never arrives
          there, and the width instability simply reappears one level in — 783px
          scrolling against 798px not. `stable` reserves it whether or not it is
          occupied, so this box is the same width with a short page and a long
          one. Browsers too old for the property ignore it and get today's
          behaviour, never worse. */}
      <div
        data-testid="structure-scroll"
        className="flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]"
      >
        <SectionList sections={sections} basePath={['sections']} addRow={false} />
      </div>

      {/* ── THE PINNED FOOTER — THE OUTERMOST INSERTION POINT, AND ONLY IT ──
          "Add a section to the page" is the one action that is true of the
          page rather than of whatever happens to be on screen, so it is the
          one that can be pinned without lying: its `basePath` is the top-level
          list, which does not move. Every NESTED AddRow stays in the scroller
          above, with the container whose slot it inserts into.

          The refusal row AddRow can render is unreachable from here and always
          was: it fires when a child would land deeper than MAX_SECTION_DEPTH,
          and a child of the top-level list is at depth 0. So this band is
          always the button, and the cap's copy is untouched.

          `border-t` is what stops the list appearing to run out from under the
          button, now that content can pass behind it. The padding pairs with
          AddRow's own `mt-1`: 8 above plus that 4 is the 12 below. */}
      <div
        data-testid="structure-add"
        className="border-t border-[var(--surface-border)] px-3 pb-3 pt-2"
      >
        <AddRow basePath={['sections']} count={sections.length} />
      </div>

      <SectionPicker open={Boolean(target)} onClose={() => setTarget(null)} onPick={onPick} />
      <ConfirmDeleteDialog
        pending={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </StructureContext.Provider>
  );
}
