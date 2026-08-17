/**
 * THE IN-HOUSE STATUS SET — one ordered list, and every enumeration of a status
 * is derived from it rather than written out again.
 *
 * ── THE DEFECT THIS FILE EXISTS TO MAKE IMPOSSIBLE ──────────────────────────
 * There were THREE hand-maintained lists of in-house statuses and they had
 * already drifted:
 *
 *   · the stat cards in RegistrationsClient — five entries, `quoted` MISSING,
 *     inside a hard-coded `grid-cols-5`;
 *   · the filter chips in the same file, fifteen lines below — six entries,
 *     `quoted` present;
 *   · `getRegistrationStatusCounts` in lib/actions/registrations.js — which
 *     counted four statuses by name and never computed `quoted` at all.
 *
 * The visible symptom was a summary strip reading ทั้งหมด 6 over cards summing
 * to 5, with one real record (status `quoted`) counted in the total and shown by
 * nothing. The chip could filter to it; no card could display it. That is the
 * screen asserting two different answers to one question.
 *
 * ── WHY A LIST OF OBJECTS AND NOT A LIST OF STRINGS ─────────────────────────
 * The label and the accent colour travel WITH the value, so adding a status is
 * one entry in one array and every consumer follows. A parallel `STATUS_LABEL`
 * map keyed by value would reintroduce exactly the drift above, one indirection
 * further away: a value with no label renders a raw enum, which is the same
 * class of bug as a value with no card.
 *
 * `accent` is a complete Tailwind class, never an interpolated fragment. Tailwind
 * scans source text for whole class names, so `border-l-${color}-400` is purged
 * and the card renders with no colour at all.
 *
 * ── THE ORDER IS THE PIPELINE ORDER ─────────────────────────────────────────
 * new → contacted → quoted → closed-won → closed-lost is the order a sales
 * enquiry actually moves through, so the cards and the chips both read left to
 * right as progress. It is not alphabetical and should not be sorted.
 *
 * ── WHO DERIVES FROM THIS ───────────────────────────────────────────────────
 *   · `INHOUSE_STATUS_VALUES` → the write-side validation Set in
 *     lib/actions/registrations.js (`updateRegistrationStatus`), and the
 *     per-status counting in `getRegistrationStatusCounts`, which now counts
 *     EVERY member rather than four named ones;
 *   · `buildStatCards` → the summary strip;
 *   · `buildStatusChips` → the filter chips.
 *
 * A seventh status is one entry here. Nothing else needs editing, and the pure
 * tests feed a fabricated seven-member list to both builders to prove it.
 *
 * This file is deliberately NOT `'use server'` and has no imports: a `'use
 * server'` module may only export async functions, so a shared constant cannot
 * live in lib/actions/registrations.js — which is why the canonical list moved
 * here and that file now imports it.
 */

export const INHOUSE_STATUSES = [
  { value: 'new',         label: 'ใหม่',                accent: 'border-l-violet-400' },
  { value: 'contacted',   label: 'ติดต่อแล้ว',           accent: 'border-l-blue-400' },
  { value: 'quoted',      label: 'ส่งใบเสนอราคาแล้ว',    accent: 'border-l-amber-400' },
  { value: 'closed-won',  label: 'ปิดงานสำเร็จ',        accent: 'border-l-emerald-400' },
  { value: 'closed-lost', label: 'ไม่สำเร็จ',           accent: 'border-l-slate-300' },
];

/** The stored enum values, in pipeline order. */
export const INHOUSE_STATUS_VALUES = INHOUSE_STATUSES.map((s) => s.value);

/**
 * The "no status filter" pseudo-value, shared by the first card and the first
 * chip so the two cannot label the same control differently.
 */
export const ALL_FILTER = { value: 'all', label: 'ทั้งหมด' };

/**
 * The summary strip: one total card, then one card per status.
 *
 * `key` is the status VALUE, which is also the key `getRegistrationStatusCounts`
 * returns each count under. Those two used to disagree — the action returned
 * `closedWon`/`closedLost` in camelCase while the filter value was
 * `closed-won`/`closed-lost`, so the card had to carry a third spelling to
 * bridge them. The action now keys its counts by the stored value, which deletes
 * the bridge and the chance of mismatching it.
 *
 * @param {Array<{value: string, label: string, accent: string}>} [statuses]
 * @returns {Array<{key: string, label: string, filterVal: string, cls: string}>}
 */
export function buildStatCards(statuses = INHOUSE_STATUSES) {
  return [
    {
      key:       'total',
      label:     ALL_FILTER.label,
      filterVal: ALL_FILTER.value,
      cls:       'border-l-4 border-l-[var(--surface-border)]',
    },
    ...statuses.map((s) => ({
      key:       s.value,
      label:     s.label,
      filterVal: s.value,
      cls:       `border-l-4 ${s.accent}`,
    })),
  ];
}

/**
 * The filter chips: an "all" chip, then one per status — the same members as the
 * cards, in the same order, from the same array.
 *
 * @param {Array<{value: string, label: string}>} [statuses]
 * @returns {Array<{value: string, label: string}>}
 */
export function buildStatusChips(statuses = INHOUSE_STATUSES) {
  return [
    { value: ALL_FILTER.value, label: ALL_FILTER.label },
    ...statuses.map((s) => ({ value: s.value, label: s.label })),
  ];
}
