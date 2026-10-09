'use client';

import { Lock } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * ── THE ROUND PICKER, SHARED BY THE TWO FLOWS THAT PICK ROUNDS ─────────────
 *
 * One course card with the course's name and code, and its rounds as
 * selectable CHIPS — a date plus a delivery-type badge. A card whose turn has
 * not come yet carries a lock line and greys every chip in it.
 *
 * ── WHERE IT CAME FROM, AND WHY IT IS NOT A NEW DESIGN ────────────────────
 * Lifted out of `career-path-register/[slug]/CareerPathRegisterClient.jsx`
 * (`Step1Courses`) with its markup UNCHANGED — the class strings, the element
 * nesting, the chip's three spans and the lock line's pill are exactly what
 * that screen rendered, so the career-path flow looks and measures as it did.
 * The only additions are the `data-round-pick-*` MARKERS below, which is the
 * convention this repo already uses on `ScheduleCard` so a caller's test can
 * pin THIS COMPONENT rather than a class string it happens to emit.
 *
 * The bundle quotation wizard is the SECOND caller. Its round step used to be
 * a block of `<select>` dropdowns, which is a different control for the same
 * decision — and the two could not be compared, so neither could be said to be
 * right. It now reads this one.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ──────────────────────────────────────
 * No rules. This module decides nothing about whether a round can be picked,
 * in what order, or why not — the career-path flow derives that from its group
 * eligibility and the date of the previous course, and the bundle derives it
 * from `roundChoices` in `lib/pageBuilder/bundleRoundChoice`. Those two bodies
 * of rules have nothing in common but their SHAPE ("this chip is pickable, and
 * if not, here is the reason"), so the shape is the prop and the rules stay
 * where they are. A shared component that also owned the rules would be a
 * two-way switch wearing one name.
 *
 * No date formatting either. `dateLabel` arrives already written — Thai and
 * Buddhist-yeared — because the two flows reach it by different routes
 * (`formatThaiRange` there, `bundleRoundLabel` here) and a third formatter in
 * this file is exactly the drift this repo keeps paying to remove.
 */

/**
 * ── THE DELIVERY-TYPE PALETTE, NOW IN ONE PLACE ──────────────────────────
 * These two tables were `TYPE_BADGE` and `TYPE_LABEL` in
 * CareerPathRegisterClient. They are exported rather than private because that
 * file still needs them for `badgeForType` / `displayType`, which handle the
 * resolved-hybrid label (`Hybrid (Classroom)`) its SUMMARY renders and a round
 * chip never sees. Two readers, one table.
 */
export const ROUND_TYPE_BADGE = {
  classroom: 'bg-blue-100 text-blue-700 border-blue-200',
  hybrid:    'bg-purple-100 text-purple-700 border-purple-200',
  online:    'bg-green-100 text-green-700 border-green-200',
};

export const ROUND_TYPE_LABEL = {
  classroom: 'Classroom',
  hybrid:    'Hybrid',
  online:    'Online',
};

const TYPE_BADGE_FALLBACK = 'bg-gray-100 text-gray-700 border-gray-200';

/**
 * The chip's badge classes and its word, by the STRICT table — exactly the
 * inline `TYPE_BADGE[t] ?? gray` / `TYPE_LABEL[t] ?? sched.type ?? '—'` pair
 * the career-path chip carried. `badgeForType`'s extra `hybrid`-prefix branch
 * is NOT folded in here: it exists for a resolved pick's compound type, which
 * is not a round's type, and widening the chip's rule would change what it
 * draws for a value it has never been handed.
 */
const badgeClassFor = (type) =>
  ROUND_TYPE_BADGE[String(type ?? '').toLowerCase()] ?? TYPE_BADGE_FALLBACK;
const labelFor = (type) =>
  ROUND_TYPE_LABEL[String(type ?? '').toLowerCase()] ?? type ?? '—';

/**
 * ONE ROUND, AS A CHIP.
 *
 * @param {object} o
 * @param {string} o.dateLabel   already-formatted Thai date range
 * @param {string} o.type        delivery type, for the badge
 * @param {boolean} o.selected   this is the course's current pick
 * @param {boolean} o.enabled    can be chosen right now
 * @param {string} [o.title]     the tooltip — the reason, when there is one
 * @param {string} [o.srReason]  the reason for assistive technology only.
 *   A greyed chip is greyed, and greying is a COLOUR: WCAG 1.4.1 does not let
 *   colour be the only carrier, so the word is in the chip even though no
 *   sighted visitor reads it. Deliberately not a visible status word — the
 *   bundle card's own ruling, and the same one applies here: four refusal
 *   vocabularies on a row of chips is a screen arguing with itself.
 * @param {boolean} [o.nearlyFull] draw the ใกล้เต็ม pill (career-path only)
 * @param {() => void} o.onClick
 */
export function RoundPickChip({
  dateLabel,
  type,
  selected = false,
  enabled = false,
  title,
  srReason = '',
  nearlyFull = false,
  onClick,
}) {
  const badge = badgeClassFor(type);
  return (
    <button
      type="button"
      /*
        THE MARKERS. `data-round-pick-chip` is what lets a caller's test assert
        "this screen draws the SHARED picker" — a hand-rolled div that copied
        the class string could satisfy a class selector and cannot satisfy this.
        `data-pickable` carries the greyed state without naming a colour, the
        same reason ScheduleCard carries `data-tone`.
      */
      data-round-pick-chip=""
      data-pickable={enabled ? 'yes' : 'no'}
      data-selected={selected ? 'yes' : 'no'}
      /*
        A SELECTED chip stays clickable even when it is no longer enabled, which
        is the career-path rule and is deliberate: a round that filled AFTER
        someone chose it must remain visible as their choice rather than become
        an unresponsive box with no way to tell it is the one they picked.
      */
      disabled={!enabled && !selected}
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-9e-md border px-3 py-2 text-sm transition-colors',
        selected
          ? 'border-9e-action bg-9e-action text-white shadow-sm'
          : enabled
            ? 'border-[var(--surface-border)] bg-white text-9e-navy hover:border-9e-action/50 hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white'
            : 'cursor-not-allowed border-[var(--surface-border)] bg-gray-50 text-gray-400 dark:bg-[#0D1B2A]/40'
      )}
    >
      <span>{dateLabel}</span>
      <span
        className={cn(
          'rounded-full border px-2 py-0.5 text-[10px] font-medium',
          selected ? 'border-white/40 bg-white/10 text-white' : badge
        )}
      >
        {labelFor(type)}
      </span>
      {nearlyFull && (
        <span
          className={cn(
            'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
            selected
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-orange-200 bg-orange-50 text-orange-700'
          )}
        >
          ใกล้เต็ม
        </span>
      )}
      {srReason && <span className="sr-only">{srReason}</span>}
    </button>
  );
}

/**
 * ONE COURSE, AND ITS CHIPS.
 *
 * @param {object} o
 * @param {string} o.name          the course's resolved name
 * @param {string} [o.code]        the course code, right-aligned on the header
 * @param {string} [o.lockReason]  when set, the lock line is drawn and the
 *   caller is expected to have greyed every chip. The SENTENCE is the caller's
 *   — career-path says `กรุณาเลือก <course>, <course> ก่อน` over its own
 *   prerequisite graph and the bundle names the one course before it — because
 *   only the caller knows which courses it means.
 * @param {string} [o.emptyLabel]  shown instead of the chips when there are
 *   none. Default is the career-path wording.
 * @param {ReactNode} [o.notices]  rendered under the chips. The bundle's
 *   cleared-pick notice, its 409 reason and its confirm-by line live here;
 *   career-path's hybrid sub-selection does too.
 * @param {string} [o.testId]      `data-testid` for the caller's own tests
 * @param {Record<string,string>} [o.dataAttrs] extra data-* for the caller
 */
export function RoundPickCourseCard({
  name,
  code = '',
  lockReason = '',
  emptyLabel = 'ยังไม่มีรอบเปิดรับสมัคร',
  hasRounds = true,
  invalid = false,
  notices = null,
  testId,
  dataAttrs = null,
  children,
}) {
  return (
    <div
      data-round-pick-card=""
      data-testid={testId}
      data-locked={lockReason ? 'yes' : 'no'}
      {...(dataAttrs ?? {})}
      className={cn(
        'rounded-9e-md border p-3',
        /*
          The base is the career-path card's own surface and border, spelled
          through `cn` so the ONE case career-path never had — a course the
          SERVER has just refused — can replace the border without a second
          element. `invalid` is false for every career-path render, so that
          flow's class string is character-for-character what it was.
        */
        invalid
          ? 'border-red-300 bg-red-50'
          : 'border-[var(--surface-border)] bg-9e-ice/30 dark:bg-[#0D1B2A]/30'
      )}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-9e-navy dark:text-white">{name}</h3>
        {/*
          UNCONDITIONAL, and that is the byte-identity rule rather than a
          preference: career-path renders this span whatever `itemCode` returns,
          including the empty string, so a `{code && …}` guard here would change
          that flow's markup for an item whose code did not resolve. Both
          callers always have one — the bundle's is `item.courseId`, which
          `resolveBundleRequest` has already refused the request without.
        */}
        <span className="font-mono text-[11px] text-9e-action">{code}</span>
      </div>

      {lockReason && (
        <p
          data-round-pick-lock=""
          className="mb-2 inline-flex items-center gap-1 rounded-9e-sm bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-[#0D1B2A] dark:text-amber-400"
        >
          <Lock className="h-3 w-3" /> {lockReason}
        </p>
      )}

      {!hasRounds ? (
        <p className="text-xs italic text-9e-slate-dp-50">{emptyLabel}</p>
      ) : (
        <div data-round-pick-chips="" className="flex flex-wrap gap-2">
          {children}
        </div>
      )}

      {notices}
    </div>
  );
}
