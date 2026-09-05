'use client';

import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { Field, INPUT_CLASS } from './fields';

/**
 * Choosing ONE round of a course, by its real dates rather than by a pasted
 * ObjectId.
 *
 * ── WHERE ITS OPTIONS COME FROM, AND WHY THAT IS THE WHOLE DESIGN ─────────
 * From the RESOLVED MAP the canvas already holds — the same map, from the same
 * resolver, that the published page gets. Not from a new server action.
 *
 * That is not a shortcut; it is the arrangement `lib/pageBuilder/chosenRounds.js`
 * argued for when it put the round SELECTION in the renderer instead of in
 * `assembleResolved`: "the editor's round picker has to offer the rounds the
 * author has NOT chosen … its option list is the `resolved` map". The resolver
 * hands over each item's course and that course's whole fetched round list; the
 * renderer picks one; this picks which. Nothing re-fetches.
 *
 * It also settles the permission question by construction. The Early Bird
 * screen's round dropdown reads `getCourseRoundsForPromotion`, gated on
 * `requireAdmin('promotions')`; a page-builder session is gated on `'pages'`.
 * Reading the map the canvas was already given needs no gate of its own.
 *
 * ── WHY THE EARLY BIRD SELECTS WERE NOT EXTRACTED ────────────────────────
 * They are the obvious prior art and they cannot serve.
 * `PromotionEarlyBirdClient.formatRound` is one of the hand-rolled formatters
 * `lib/schedule/roundDateLabel` was written to retire: its own `MONTHS_TH`
 * array, a hand-added `+ 543`, and first-date-to-last-date — so a round on 8,
 * 10 and 12 ต.ค. renders as `8 – 12`, advertising two days that do not exist.
 * Extracting it would have carried that onto a second screen. This uses
 * `formatRoundDays`, which collapses only CONSECUTIVE runs and takes its month
 * and Buddhist year from `Intl`.
 *
 * ── EVERY STORED ROUND KEEPS AN OPTION — "(รอบเดิม)" ─────────────────────
 * A round the author already chose that the fetch no longer returns still gets
 * a selectable option. Without it, opening a bundle to change a PRICE would
 * silently drop the round, because a `<select>` whose value matches no option
 * reports the empty one and the next save writes that back.
 *
 * That is the same rule `CoursePicker` states as "EVERY STORED ENTRY GETS A
 * ROW", and the Early Bird form's one correct instinct, kept.
 *
 * ── THE YEAR IS ALWAYS SHOWN HERE, UNLIKE ON THE PAGE ────────────────────
 * `showYear: true`, not the page's `'auto'`. An admin comparing rounds in a
 * dropdown is choosing between dates that may be a year apart, and `'auto'`
 * hides the year on anything in the current one — which is exactly the
 * comparison being made. It also keeps this component free of `currentYear`,
 * which `formatRoundDays` refuses to infer.
 */

/** A round's option label: its dates, or its raw id if it has none usable. */
export function roundOptionLabel(row) {
  const label = formatRoundDays(row?.dates, { showMonth: true, showYear: true });
  return label === '-' ? String(row?._id ?? '') : label;
}

/**
 * What gets STORED beside the id when a round is picked: `{id, dates, type}`
 * and nothing else.
 *
 * The shape is `roundSnapshotShape` (lib/schemas/sections/dynamic.js), which is
 * deliberately NOT `.passthrough()` — so a `status` or a `signup_url` written
 * into it is stripped at the schema boundary. This builder does not write them
 * in the first place, which makes that strip a backstop rather than the only
 * defence. A stored `status` would be the seats-left signal frozen at pick
 * time, and 'เปิดรับ' on a round that has since filled is a lie a visitor acts
 * on; a stored `signup_url` is a link to a round that is not there.
 *
 * The snapshot is written on PICK rather than on save, so it records the round
 * as it was when the author actually chose it.
 */
export function snapshotOf(row) {
  return {
    id: String(row?._id ?? ''),
    dates: (Array.isArray(row?.dates) ? row.dates : []).map(String),
    type: typeof row?.type === 'string' ? row.type : '',
  };
}

export function RoundPicker({ value, rounds, label, hint, onChange }) {
  const id = typeof value === 'string' ? value.trim() : '';
  // `undefined` means the canvas fetch is still in flight; `[]` means it landed
  // and this course has no upcoming rounds. The two must not look the same to
  // the caller's warnings, so they are not collapsed here either.
  const list = Array.isArray(rounds) ? rounds : [];
  const stored = id ? list.find((r) => String(r?._id) === id) : null;

  const pick = (next) => {
    if (!next) return onChange('', undefined);
    const row = list.find((r) => String(r?._id) === next);
    // Choosing the "(รอบเดิม)" option keeps the id and writes NO new snapshot —
    // there is no row to build one from, and overwriting the stored one with an
    // empty shape would destroy the only record of what that round was.
    onChange(next, row ? snapshotOf(row) : undefined);
  };

  return (
    <Field label={label ?? 'รอบอบรม'} hint={hint}>
      <select
        data-testid="round-picker"
        value={id}
        onChange={(e) => pick(e.target.value)}
        className={INPUT_CLASS}
      >
        <option value="">— ยังไม่ได้เลือกรอบ —</option>
        {id && !stored && (
          <option data-testid="round-picker-kept" value={id}>
            {id} (รอบเดิม)
          </option>
        )}
        {list.map((row) => (
          <option key={String(row?._id)} value={String(row?._id)}>
            {roundOptionLabel(row)}
          </option>
        ))}
      </select>
    </Field>
  );
}
