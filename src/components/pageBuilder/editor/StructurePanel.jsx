'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Eye, EyeOff, ChevronUp, ChevronDown, Copy, Trash2, Plus, Ban,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { slotsOf, MAX_SECTION_DEPTH } from '@/lib/pageBuilder/containerSlots';
import { labelOf, sectionSummary, sectionRendersEmpty, sectionChildCounts } from '@/lib/pageBuilder/sectionLabels';
import { iconOf } from '@/lib/pageBuilder/sectionIcons';
import { countDescendants } from '@/lib/pageBuilder/sectionDescendants';
import { newSection } from '@/lib/pageBuilder/newSection';
import { useEditor } from './EditorProvider';
import { depthOfPath } from './pagePath';
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
        'hover:bg-9e-ice hover:text-9e-navy dark:hover:bg-[#0D1B2A] dark:hover:text-white',
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
                className="rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
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
  const { getRowProps, isDragging, isDropTarget, requestDelete } = useStructure();

  const index = path[path.length - 1];
  const slots = slotsOf(section?.type);
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
    <li>
      {/* The row is the drag source and drop target, NOT a control: selection
          is the label button below. A role="button" here would nest the eye and
          menu buttons inside a button, which is invalid and costs keyboard
          access to the very actions the row exists for. */}
      <div
        {...getRowProps(path)}
        className={cn(
          'group flex items-center gap-1 rounded-9e-sm border border-transparent px-1.5 py-1.5 text-xs',
          'cursor-grab active:cursor-grabbing',
          selected ? 'border-9e-action/40 bg-9e-action/10' : 'hover:bg-9e-ice dark:hover:bg-[#0D1B2A]',
          isDragging(path) && 'opacity-40',
          // Only ever set on a legal sibling target — see useTreeDrag.js.
          isDropTarget(path) && 'border-t-2 border-t-9e-action'
        )}
      >
        {/* ── THE TYPE ICON STANDS WHERE THE GRIP GLYPH DID ───────────────────
            NOT beside it. The row was measured in a browser at 260px: after the
            grip, the four hover actions and the visibility toggle, the label has
            85px at top level and 33px on a nested row that also carries a badge.
            An icon ADDED to the row costs another 18px of that, which the label
            does not have — and the alternative, buying it back by shrinking a
            control, is the one thing a 22px hit area must not pay.

            Nothing about dragging changes: the handlers, the drop targets and
            the grab cursor are all on the row div, which is why the glyph was
            only ever decoration. iconOf is the SAME lookup the section picker
            renders a type with (rounds 9-13), so an author meets one icon per
            type and meets it twice. */}
        <TypeIcon className="h-3.5 w-3.5 shrink-0 text-9e-slate-dp-50/60" aria-hidden />

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

              What this cannot fix on its own: five rich_text sections with no
              name and no summary have no distinguishing data at all, so they
              read identically. The position number is what separates them,
              which is why it leads — and naming them is now the author's
              remedy rather than something only a future round could give. */}
          <span className="flex items-baseline gap-1">
            <span data-testid="row-position" className="shrink-0 text-[10px] tabular-nums text-9e-slate-dp-50/70">
              {index + 1}.
            </span>
            <span
              data-testid="row-primary"
              className={cn(
                'min-w-0 flex-1 truncate font-medium',
                selected ? 'text-9e-navy dark:text-white' : 'text-9e-navy/80 dark:text-white/80'
              )}
            >
              {primary}
            </span>
          </span>
          {secondary && (
            <span data-testid="row-secondary" className="block truncate pl-4 text-[10px] text-9e-slate-dp-50">
              {secondary}
            </span>
          )}
          {hidden && <span className="sr-only"> (ซ่อนอยู่)</span>}
        </button>

        {willBeEmpty && <EmptyBadge />}
        {atCap && <CapBadge />}

        <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <IconButton label="ขึ้น" disabled={index === 0} onClick={() => move(index - 1)}>
            <ChevronUp className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="ลง" disabled={index === siblingCount - 1} onClick={() => move(index + 1)}>
            <ChevronDown className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="ทำซ้ำ" onClick={() => dispatch({ type: 'DUPLICATE_SECTION', path })}>
            <Copy className="h-3.5 w-3.5" />
          </IconButton>
          {/* Asks; it does NOT dispatch. REMOVE_SECTION is reached only from
              the confirm dialog below — see requestDelete / ConfirmDeleteDialog. */}
          <IconButton label="ลบ" danger onClick={() => requestDelete(path, section)}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        </span>

        {/* Visibility rides the normal dirty/autosave path like every other
            edit — it is NOT an instant server write. The top bar's unsaved
            indicator and the beforeunload guard are what make that honest. */}
        <IconButton
          label={hidden ? 'แสดง section นี้' : 'ซ่อน section นี้'}
          onClick={() => dispatch({ type: 'TOGGLE_SECTION', path })}
        >
          {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </IconButton>
      </div>

      {slots?.map((slot) => {
        const kids = Array.isArray(section?.content?.[slot]) ? section.content[slot] : [];
        const slotLabel = SLOT_LABELS[slot];
        return (
          <div key={slot} className="ml-3 border-l border-[var(--surface-border)] pl-1.5">
            {slotLabel && (
              <p className="px-1.5 pb-0.5 pt-2 text-xs uppercase tracking-wide text-9e-slate-dp-50/70">{slotLabel}</p>
            )}
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
        'hover:border-9e-action/40 hover:bg-9e-ice hover:text-9e-action dark:hover:bg-[#0D1B2A]'
      )}
    >
      <Plus className="h-3 w-3 shrink-0" aria-hidden />
      เพิ่ม section
    </button>
  );
}

function SectionList({ sections, basePath }) {
  return (
    <>
      {sections.length > 0 && (
        <ul className="space-y-0.5">
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
      <AddRow basePath={basePath} count={sections.length} />
    </>
  );
}

export function StructurePanel() {
  const { page, dispatch } = useEditor();
  const sections = Array.isArray(page?.sections) ? page.sections : [];

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
  const ctx = useMemo(() => ({ ...drag, openPicker, requestDelete }), [drag, openPicker, requestDelete]);

  return (
    <StructureContext.Provider value={ctx}>
      <SectionList sections={sections} basePath={['sections']} />
      <SectionPicker open={Boolean(target)} onClose={() => setTarget(null)} onPick={onPick} />
      <ConfirmDeleteDialog
        pending={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </StructureContext.Provider>
  );
}
