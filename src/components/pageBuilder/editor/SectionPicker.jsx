'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Lock, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LAYOUT_TYPES, CONTENT_TYPES, CARD_TYPES, DYNAMIC_TYPES, ADVANCED_TYPES,
} from '@/lib/schemas/pageBuilder';
import { isContainer } from '@/lib/pageBuilder/containerSlots';
import { isAdvancedType } from '@/lib/pages/tierSanitize';
import { labelOf } from '@/lib/pageBuilder/sectionLabels';
import { iconOf } from '@/lib/pageBuilder/sectionIcons';
import { RENDERABLE_SECTION_TYPES } from '../SectionRenderer';
import { useEditor } from './EditorProvider';

/**
 * The add-section picker.
 *
 * ── Displays every type; ENABLES only what can actually be added ─────────
 * The trap the picker exists to prevent is offering a type that validates,
 * saves, and publishes nothing — so a type is CLICKABLE only if it is in
 * RENDERABLE_SECTION_TYPES (the renderer's registry) and not blocked by tier.
 * That invariant is unchanged and load-bearing.
 *
 * But absent ≠ safe: hiding Card/Dynamic/Advanced entirely left an author
 * unable to tell those types exist. So they are SHOWN, disabled, with a reason
 * — "เร็ว ๆ นี้" for the ones whose components are a later phase, a lock + tier
 * note for advanced types a non-developer can't use. A disabled button cannot
 * call onPick, so the trap stays closed; the author just stops wondering
 * whether the feature is missing or the tool is broken.
 *
 * Radix Dialog rather than a hand-rolled modal: focus trap / escape / aria are
 * exactly what a hand-rolled one gets subtly wrong.
 *
 * ── WHAT THIS ROUND CHANGED, AND WHAT IT DELIBERATELY DID NOT ───────────────
 * 27 types in five groups is a wall to read top-to-bottom, so this round added
 * PRESENTATION ONLY: a search box, a row of group filter pills, tinted icon
 * tiles, a wider multi-column dialog, and — for a non-developer — the Advanced
 * group folded into one locked summary row instead of four dead buttons.
 *
 * `typeState()` below is untouched. Search and pills decide what is DRAWN;
 * `typeState` still decides, alone, what is CLICKABLE. Nothing here can make a
 * 'soon' or 'locked' type reach onPick — filtering a list does not enable its
 * members.
 */

// 'add' → clickable. 'soon' → exists, component is a later phase. 'locked' →
// exists, needs a higher tier. Only 'add' reaches onPick.
//
// ── 'soon' IS UNREACHABLE TODAY, BY MEASUREMENT — AND STAYS ─────────────────
// After 2C.2b every type declared in lib/schemas/sections/* has a component in
// SectionRenderer's REGISTRY, so `renderable` is true for every type the picker
// draws and no button can currently reach 'soon'. That is MEASURED, not
// assumed: test/render/sectionTypeCoverage.test.mjs subtracts
// RENDERABLE_SECTION_TYPES from ALL_SECTION_TYPES and asserts the remainder is
// empty. It is self-retiring — the day a declared type ships without a
// component it goes red and names the type.
//
// DO NOT DELETE THE BRANCH ON THAT BASIS. It is the fail-closed path: it is the
// only thing that keeps a schema-only type DISABLED here instead of clickable,
// and a clickable type with no component throws in newSection() or publishes an
// empty section. The branch is unreachable because the codebase is currently in
// a good state, not because the state it guards cannot happen.
function typeState(type, canUseAdvanced) {
  const renderable = RENDERABLE_SECTION_TYPES.includes(type);
  if (isAdvancedType(type)) {
    // ── The developer-tier gate ──────────────────────────────────────────
    // GATES: authoring an Advanced-category section (custom_html / custom_css /
    // embed / debug_json). WHY: those are raw HTML / CSS / JSON escape hatches,
    // so a non-developer must not be able to add one — they see 'locked', a
    // developer sees it offered. This is only the PICKER half; the server-side
    // enforcement that STRIPS a non-developer's advanced section on save is
    // sanitizePageForTier in lib/pages/tierSanitize.js.
    //
    // UNEXERCISED FROM INTRODUCTION UNTIL 2C: before 2C the advanced types had
    // no component, so this branch could only ever return 'locked' (non-dev) or
    // 'soon' (dev) — the canUseAdvanced → 'add' path never actually fired on a
    // real, offerable type. 2C shipped the four components, so as of this pass
    // the gate decides 'add' vs 'locked' for the first time since it was written
    // (docs/page-builder-status.md forward-dependency 3).
    //
    // ── THE OTHER HALF OF THIS SAME GATE, KEPT NEXT TO IT ON PURPOSE ──────
    // The gate has a PRESENTATION half too, and it lives in the advanced branch
    // of SectionPickerBody below. Both halves are written down here so a future
    // reader finds the whole rule in one place instead of finding one side and
    // assuming it is all of it:
    //
    //   !canUseAdvanced → this returns 'locked' for every advanced type, AND
    //     the group collapses to ONE summary row carrying the lock and the
    //     "ต้องมีสิทธิ์ developer" framing. Four identically-dead buttons told a
    //     marketing author nothing four times; one row tells them once, and why.
    //
    //   canUseAdvanced → this returns 'add'/'soon' per type, AND the group
    //     renders as ordinary clickable buttons in the same grid as every other
    //     group. NO extra expand click. Putting the four types behind a
    //     disclosure for the ONE tier that can actually use them would be the
    //     collapse pointed exactly the wrong way.
    if (!canUseAdvanced) return 'locked';
    return renderable ? 'add' : 'soon';
  }
  return renderable ? 'add' : 'soon';
}

/**
 * The five groups, and the ONE list the filter pills are built from.
 *
 * `types` is the imported constant BY REFERENCE, never a copy — a type added to
 * (say) CARD_TYPES in lib/schemas/sections/cards.js appears in the การ์ด group
 * and under the การ์ด pill with no edit here. test/render/sectionTypeCoverage
 * pins that each of the five is still read from its export.
 *
 * `key` is a stable ASCII handle for the active-pill state and for the tests;
 * `title` is what the author reads. They are separate so retitling a group in
 * Thai cannot silently change which pill is selected.
 *
 * ── WHY การ์ด IS ITS OWN PILL AND NOT FOLDED INTO ไดนามิก ────────────────────
 * The designer mockup shows four pills, with price_card sitting among the
 * fetch-backed types under "Dynamic Data". That is a mislabel this codebase
 * already has words for: docs/page-builder-status.md calls price_card /
 * stat_card / icon_card the "self-contained" cards and keeps them distinct from
 * the data-backed ones. A pill reading "ไดนามิก" over a static card would
 * contradict the type semantics the rest of the builder is written to. Five
 * pills, matching CARD_TYPES as it is exported.
 */
export const GROUPS = [
  { key: 'content',  title: 'เนื้อหา',             types: CONTENT_TYPES },
  { key: 'layout',   title: 'เลย์เอาต์',            types: LAYOUT_TYPES },
  { key: 'card',     title: 'การ์ด',               types: CARD_TYPES },
  { key: 'dynamic',  title: 'ไดนามิก',             types: DYNAMIC_TYPES },
  { key: 'advanced', title: 'ขั้นสูง (developer)',  types: ADVANCED_TYPES },
];

/** The pill for "no group filter". Not a group — it is the absence of one. */
const ALL_GROUP = 'all';

/**
 * The pill row, DERIVED from `GROUPS` — one pill per group, in the group order,
 * plus "ทั้งหมด" at the front because "no filter" is not a group.
 *
 * Hoisted into its own function ONLY so the derivation is testable as
 * behaviour. Five pills typed out as five strings would render identically
 * today and would then quietly disagree with the grid the first time a sixth
 * category is exported from lib/schemas/sections/* — the failure mode being a
 * pill row that no longer covers everything the picker draws, with nothing to
 * say so. `groups` is a parameter with a default rather than a closed-over
 * constant so a test can hand it a SIXTH group and watch a sixth pill come out;
 * a test that could only ever see the real five could not tell derivation from
 * a coincidence of counting.
 */
export function pillsOf(groups = GROUPS) {
  return [{ key: ALL_GROUP, title: 'ทั้งหมด' }, ...groups];
}

/**
 * Does this type's visible name contain what was typed?
 *
 * ── ON `.toLowerCase()` AND THAI ────────────────────────────────────────────
 * Thai script is CASELESS, so folding does nothing to 'กริดไฮไลต์' — on the Thai
 * labels this is a plain substring match, which is exactly what is wanted.
 * It is kept anyway because it is NOT a no-op across all 27: four labels embed
 * ASCII — 'HTML กำหนดเอง', 'CSS กำหนดเอง', 'Debug JSON', 'ฝังเนื้อหา (embed)' —
 * and folding is the only reason typing `html` finds the first of them. So:
 * caseless where the script is caseless, case-insensitive where it is not.
 *
 * Matching is against labelOf() — the name on the button — and not the raw type
 * name, so what an author types is what an author can see.
 */
function matchesQuery(type, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return labelOf(type).toLowerCase().includes(q);
}

/**
 * The groups to draw, already narrowed by both filters.
 *
 * The two conditions are an AND, not an OR: a pill restricts to one group and a
 * query then restricts WITHIN it. A type outside the active group is not shown
 * however well it matches the text.
 *
 * A group whose list narrows to nothing is DROPPED, not drawn empty — a header
 * with no grid under it reads as a rendering fault rather than as "no match".
 */
export function visibleGroups(query, activeGroup) {
  return GROUPS
    .filter((g) => activeGroup === ALL_GROUP || activeGroup === g.key)
    .map((g) => ({ ...g, types: g.types.filter((t) => matchesQuery(t, query)) }))
    .filter((g) => g.types.length > 0);
}

function TypeButton({ type, state, onPick }) {
  const disabled = state !== 'add';
  const Icon = iconOf(type);
  return (
    <button
      type="button"
      data-testid="picker-type"
      data-type={type}
      data-state={state}
      disabled={disabled}
      onClick={disabled ? undefined : () => onPick(type)}
      title={state === 'locked' ? 'ต้องมีสิทธิ์ developer' : state === 'soon' ? 'กำลังจะมาในเร็ว ๆ นี้' : undefined}
      className={cn(
        'flex items-start justify-between gap-2 rounded-9e-md border border-[var(--surface-border)] px-3 py-2.5 text-left text-[13px]',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'text-9e-navy hover:border-9e-action/40 hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]'
      )}
    >
      {/* Leading icon in a tinted rounded tile. The tint is the SAME pair this
          editor already uses for an active affordance — `bg-9e-action/10` +
          `text-9e-action`, from RichTextEditor's active toolbar button and
          PublishDialog's selected status row — not a new colour invented for
          this dialog. An offerable type is drawn in the accent; anything
          disabled keeps the old muted treatment on the neutral ice tint, so the
          colour itself carries "you can add this". Decorative either way: the
          label is the accessible name, so aria-hidden. */}
      <span className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-9e-md',
            disabled
              ? 'bg-9e-ice text-9e-slate-dp-50 dark:bg-[#0D1B2A]'
              : 'bg-9e-action/10 text-9e-action'
          )}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="font-medium">{labelOf(type)}</span>
          {/* A DELIBERATE KEEP, not an oversight. The denser card tempted a
              trim, but this line is the only place the picker says a type can
              hold other sections — an author who does not know that never
              nests, and the container types then look like empty boxes. Kept,
              restyled to sit under the label in the narrower card. */}
          {state === 'add' && isContainer(type) && (
            <span className="mt-0.5 block text-[10px] leading-tight text-9e-slate-dp-50">ใส่ section ซ้อนข้างในได้</span>
          )}
        </span>
      </span>
      {/* The 'soon' badge. Unreachable today — see typeState's note and
          test/render/sectionTypeCoverage.test.mjs, which MEASURES that. This
          round restyled the card around it and left the badge itself alone:
          the day a declared type ships without a component this is what the
          author sees instead of a clickable button, and a JSX path deleted for
          being cold is a path that is not there when the state comes back. */}
      {state === 'soon' && (
        <span className="shrink-0 rounded-full bg-9e-ice px-1.5 py-px text-[9px] text-9e-slate-dp-50 dark:bg-[#0D1B2A]">
          เร็ว ๆ นี้
        </span>
      )}
      {state === 'locked' && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-9e-slate-dp-50" aria-hidden />}
    </button>
  );
}

/**
 * The Advanced group's non-developer face: one row, locked, saying why.
 *
 * Renders INSTEAD OF the four buttons, never alongside them — see the
 * presentation half of the developer-tier note at typeState. It is a <p>, not a
 * disabled <button>: there is nothing here to press, and a button that exists
 * only to refuse the press is exactly what this row replaces.
 */
function AdvancedLockedSummary({ types }) {
  return (
    <p
      data-testid="picker-advanced-locked"
      className="flex items-start gap-2 rounded-9e-md border border-[var(--surface-border)] bg-9e-ice px-3 py-2.5 text-[12px] text-9e-slate-dp-50 dark:bg-[#0D1B2A]"
    >
      <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        ต้องมีสิทธิ์ developer จึงจะเพิ่ม section ขั้นสูงได้
        <span className="mt-0.5 block text-[10px]">{types.map(labelOf).join(' · ')}</span>
      </span>
    </p>
  );
}

/**
 * The picker's contents, WITHOUT the Radix portal around them.
 *
 * Split out and exported because a Dialog.Portal renders nothing under
 * renderToStaticMarkup (established in rounds 5/6 — see the note at the bottom
 * of test/render/draftVisibility.test.mjs), so everything drawn inside one is
 * invisible to the render tier and can only be guarded by source scans. This
 * body has no portal, takes `query` / `activeGroup` as PROPS rather than owning
 * them, and is therefore assertable as real DOM at any filter value.
 *
 * The state itself lives one level up in SectionPicker; this component is a
 * pure function of its props.
 */
export function SectionPickerBody({
  query, activeGroup, canUseAdvanced, onQueryChange, onGroupChange, onPick,
}) {
  const groups = visibleGroups(query, activeGroup);

  return (
    <>
      {/* ── THE FIXED HEADER REGION ────────────────────────────────────────
          Search + pills, and they do NOT scroll. The controls that CHANGE the
          list must stay reachable while reading it — scrolling to the bottom
          of 27 types and having to scroll back up to retype is the whole
          reason this is split out of the list below.

          It does not shrink either: as the flex column's fixed part it keeps
          its natural height, and the list underneath absorbs every change in
          the outer box, so the search field cannot be squeezed on a short
          viewport.

          The pills are MAPPED FROM `GROUPS` — the same array the grid below
          draws from — so a group added to that array gets a pill for free and
          can never show a set that disagrees with its header. "ทั้งหมด" is
          prepended because it is not a group. */}
      <div data-testid="picker-header" className="mb-3 shrink-0 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-9e-slate-dp-50" aria-hidden />
          <input
            type="search"
            data-testid="picker-search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="ค้นหาชนิด section"
            aria-label="ค้นหาชนิด section"
            className="w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-1.5 pl-8 pr-2 text-[13px] text-9e-navy placeholder:text-9e-slate-dp-50 focus:border-9e-action/40 focus:outline-none dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pillsOf().map((pill) => {
            const active = activeGroup === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                data-testid="picker-pill"
                data-group-key={pill.key}
                data-active={active ? 'true' : 'false'}
                aria-pressed={active}
                onClick={() => onGroupChange(pill.key)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px]',
                  // The selected treatment is PublishDialog's, verbatim
                  // (`border-9e-action/40 bg-9e-action/10` on its chosen status
                  // row) plus this editor's accent text — one active-state
                  // convention across the builder, not a second one.
                  active
                    ? 'border-9e-action/40 bg-9e-action/10 font-medium text-9e-action'
                    : 'border-[var(--surface-border)] text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]'
                )}
              >
                {pill.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── THE SCROLLING REGION ────────────────────────────────────────────
          Only the list scrolls. This is the element that carries the overflow
          AND the reserved scrollbar gutter, and the two belong together on
          whichever element scrolls: the gutter exists to stop the content
          reflowing 15px sideways as the scrollbar comes and goes between
          filter states, so it has to sit where the scrollbar actually appears.
          Left behind on an ancestor that no longer scrolls it would reserve
          space against a scrollbar that never arrives there, and the round-10
          width defect would come back inside this box.

          `flex-1` makes this the part that absorbs the outer box's fixed
          height: whatever the header takes, the list gets the rest, so the
          dialog's own height stays exactly what round 12 measured no matter
          how tall the header grows. */}
      <div
        data-testid="picker-scroll"
        className="flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
      {groups.map((group) => (
        <div key={group.key} data-testid="picker-group" data-group-key={group.key} className="mb-3 last:mb-0">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-9e-slate-dp-50">{group.title}</p>
          {group.key === 'advanced' && !canUseAdvanced ? (
            <AdvancedLockedSummary types={group.types} />
          ) : (
            // 2 columns below md is exactly what this grid did at 32rem, so the
            // narrow end is unchanged; the extra columns only appear once the
            // dialog has actually widened. See the width note on Dialog.Content.
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {group.types.map((type) => (
                <TypeButton key={type} type={type} state={typeState(type, canUseAdvanced)} onPick={onPick} />
              ))}
            </div>
          )}
        </div>
      ))}

      {groups.length === 0 && (
        <p data-testid="picker-empty" className="rounded-9e-md border border-[var(--surface-border)] px-3 py-6 text-center text-[12px] text-9e-slate-dp-50">
          ไม่พบชนิด section ที่ตรงกับคำค้นหา
        </p>
      )}
      </div>
    </>
  );
}

export function SectionPicker({ open, onClose, onPick }) {
  const { tier } = useEditor();
  const canUseAdvanced = Boolean(tier?.canUseAdvanced);

  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState(ALL_GROUP);

  // Reopening the picker starts from everything visible. The dialog's contents
  // unmount on close but this component does not, so without the reset the next
  // open would come back mid-search — with the type the author now wants
  // filtered out and no obvious reason why.
  const reset = () => { setQuery(''); setActiveGroup(ALL_GROUP); };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            // ── 52rem, and this is a NEW SHAPE for this directory's dialogs ──
            // Every other dialog here is 30-34rem, a single-column popover: a
            // confirm, a form, a status list. This one is a 27-item catalogue
            // with a search box and a pill row above it, and a 3-4 column grid
            // is the whole point of the redesign — at 32rem four columns are
            // ~110px each and the Thai labels wrap to three lines.
            //
            // 52rem = 832px; less the p-4 gutters and the gap-2 tracks, four
            // cards land at ~194px and three at ~256px, both comfortably wider
            // than the longest label ('ฝังเนื้อหา (embed)'). It is deliberately
            // not MORE: past ~56rem a row of four starts reading as a lot of
            // empty card rather than as a denser catalogue.
            //
            // The `calc(100vw-2rem)` floor is the directory's, unchanged — the
            // same one every dialog here uses — so on a phone this is still a
            // full-bleed sheet with a 1rem margin, and the grid is back to the
            // 2 columns it has always had below md.
            'fixed left-1/2 top-1/2 z-50 w-[min(52rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 rounded-9e-md border',
            'border-[var(--surface-border)] bg-[var(--surface)] p-4 shadow-xl',
            // ── WHY scrollbar-gutter, AND WHAT IT IS NOT FIXING ─────────────
            // Round 10's reported defect: the picker "shrinks" when a filter
            // narrows the list. MEASURED in headless Chrome at 1400x600, both
            // filter states:
            //
            //   outer width   832px   832px    ← the box NEVER moved
            //   clientWidth   815px   830px    ← the content did, by 15px
            //   grid columns  189.75  193.50
            //
            // So `w-[min(52rem,…)]` above was never the problem and is
            // unchanged — it compiles (Tailwind escapes the comma as `\2c `)
            // and it holds. `grid-cols-*` was not the problem either: those are
            // literal `repeat(n, minmax(0,1fr))` templates, which reserve every
            // track even with fewer items to place, so four cards and one card
            // sit on identically-wide columns.
            //
            // What moved was the SCROLLBAR. 27 types overflow
            // the height cap, so `overflow-y-auto` puts a classic
            // scrollbar INSIDE the border box and 15px of content width
            // disappears; filter down to 5 and the scrollbar goes with it. The
            // card edges hold still while everything between them breathes —
            // which in a screenshot comparison reads exactly as "the dialog got
            // wider", because the part you look at did.
            //
            // `stable` reserves the gutter whether or not it is occupied, so
            // the content column is the same width in every filter state. It is
            // an arbitrary PROPERTY (Tailwind 3.4 ships no scrollbar-gutter
            // utility); it compiles, and pre-Chrome-94 / pre-Safari-18.2 simply
            // ignore it and get today's behaviour, never worse.
            // ── HEIGHT IS A CONSTANT, EXACTLY AS WIDTH IS ───────────────────
            // Round 12. Round 10 stopped the CONTENT WIDTH moving when a filter
            // narrowed the list; height still moved, and by far more — MEASURED
            // 739px for all 27 types, ~288px once a filter hit round 10's floor.
            // So height is now declared the same way width is: one value, fixed
            // by default, clamped only by the VIEWPORT and never by how many
            // results the filter left.
            //
            // WHERE 47rem COMES FROM. Measured in headless Chrome against the
            // dev server's own compiled stylesheet, ทั้งหมด with every group and
            // every type, at 1400x1000/1200/1400, with scrollHeight ===
            // clientHeight so the number is a natural height and not a clipped
            // one. TWO numbers came back, and the difference is the whole reason
            // this comment exists:
            //
            //   developer      739px   27 types, Advanced as 4 buttons
            //   NON-developer  746px   23 types, Advanced as the locked summary
            //
            // The non-developer view is SEVEN PIXELS TALLER while showing FOUR
            // FEWER TYPES, because the collapsed Advanced row (a lock plus two
            // lines of text) is taller than the single grid row of four buttons
            // it stands in for. Sizing to the developer view alone — the obvious
            // reading of "the height of ทั้งหมด" — would have left every
            // non-developer with a permanently scrolling dialog, 2px of overflow
            // they can never clear, on the majority tier.
            //
            // So the fit is to the TALLER of the two: 746 / 16 = 46.625rem,
            // rounded up to 47rem = 752px, leaving 6px below the last row on top
            // of the 16px `p-4` already provides.
            //
            // ── WHY ROUND 10'S 18rem MIN-HEIGHT IS GONE, NOT MISLAID ────────
            // It was a FLOOR under a height that was still free to vary — it
            // stopped the short states collapsing to a 4.5:1 strip while the
            // 27-type view grew past it to its natural size. A fixed `h-` makes
            // every state that one height, so a floor beneath it can never bind:
            // it would be dead code that reads like a live constraint. The
            // landscape-phone edge round 10 named with it (min-height beating
            // max-height below a ~352px viewport) goes away with it too — `min()`
            // clamps downward, so there is no longer a floor to lose that fight.
            //
            // The old viewport max-height is gone for the same reason and is not
            // a dropped safeguard: the `min()` above IS that clamp, folded into
            // the one declaration, so a short viewport still cannot be exceeded.
            //
            // ── ROUND 13: THIS BOX NO LONGER SCROLLS ITSELF ─────────────────
            // It is a flex COLUMN of three parts: the title row, the header
            // region the body renders (search + pills), and the list, which
            // takes the remaining height and does the scrolling. The overflow
            // and the reserved gutter moved INWARD onto that list.
            //
            // Rounds 10 and 12 are untouched by that move. The height below is
            // still the single declaration that decides this box's size, and
            // because the list absorbs whatever the two fixed rows do not use,
            // the outer box stays exactly this tall in every filter state —
            // which is the property round 12 measured, now held by the flex
            // distribution rather than by the box hugging its own scroll.
            //
            // Round 12 pinned overflow and height to the SAME element and
            // reasoned a split would clip with no way to scroll. That was true
            // of a fixed-height box with nothing scrollable inside it; it is
            // not a reason never to split, only a reason the scroller must move
            // inward rather than be deleted. The rewritten pin is in
            // test/render/sectionPickerWidthStability.test.mjs.
            'flex flex-col h-[min(47rem,calc(100dvh-4rem))]'
          )}
        >
          {/* The title row is the other fixed part of the column — it holds its
              natural height and never scrolls away from the close button. */}
          <div data-testid="picker-titlebar" className="mb-3 flex shrink-0 items-center justify-between">
            <Dialog.Title className="text-sm font-bold text-9e-navy dark:text-white">เพิ่ม section</Dialog.Title>
            <Dialog.Close aria-label="ปิด" className="rounded p-1 text-9e-slate-dp-50 hover:bg-9e-ice dark:hover:bg-[#0D1B2A]">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">เลือกชนิดของ section ที่ต้องการเพิ่ม</Dialog.Description>

          <SectionPickerBody
            query={query}
            activeGroup={activeGroup}
            canUseAdvanced={canUseAdvanced}
            onQueryChange={setQuery}
            onGroupChange={setActiveGroup}
            onPick={onPick}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
