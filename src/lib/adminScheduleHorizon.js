/**
 * Admin schedule grid horizon — the ONE number the admin table's month
 * columns and its MSDB `to` bound both derive from.
 *
 * WHY THIS MODULE EXISTS
 * The horizon used to be the literal `4`, written three times: the
 * `to` bound in src/app/admin/schedules/page.jsx, the `monthCols` loop in
 * SchedulesAdminClient.jsx, and the "แสดง N เดือนข้างหน้า" subtitle. Three
 * copies of one concept that must agree, and nothing made them agree.
 *
 * They also did not agree. The old bound was `today + N months`
 * (2026-07-29 → 2026-11-29) while the grid rendered columns through the
 * month containing `today + N-1 months` (October). Rows dated in November
 * were fetched from MSDB and then dropped on the client, because
 * `monthKey(s.dates[0])` matched no column — an over-fetch plus a SILENT
 * drop, the same shape as the /schedule join incident. So the bound is now
 * DERIVED from the last rendered column rather than computed in parallel
 * with it: `adminScheduleWindow()` calls `adminScheduleMonthCols()` and
 * takes the last day of the last column. The window fetched and the window
 * rendered cannot diverge without one of them being rewritten.
 *
 * NOT the modal's date-picker range. src/lib/schedule/editorCalendarRange.js
 * bounds how far a user can navigate while picking session dates. It is a
 * DIFFERENT CONCEPT: this horizon decides what the admin TABLE displays, that
 * range decides what a user may PICK. Do not import this constant into it, and
 * do not pass this constant into it from the modal.
 *
 * The two were once numerically equal — both 4 — and the picker was rewritten
 * precisely because tying what can be edited to a clock-derived window made 15
 * of 90 live rounds uneditable (measured 2026-08-27). Tying it to the table's
 * reach instead would be the same defect from the other end. The picker's range
 * is derived from the DATA BEING EDITED; see that module's docstring.
 *
 * The reverse direction is legitimate and is used: the modal asks this module
 * where the last column falls in order to WARN, at save time, that a round will
 * not be listed yet. "Will this appear in the table" is a question about the
 * table. "What may I pick" is not.
 *
 * Dependency-free by design (no next/*, no db, no models) so the server
 * page, the client component, and the `pure` test tier can all import it.
 */

export const ADMIN_SCHEDULE_MONTHS = 12;

/**
 * The admin schedule table's SELECTABLE month range — how far back and
 * forward the new from/to dropdowns let an admin move the table's window.
 *
 * A DIFFERENT CONCEPT FROM `ADMIN_SCHEDULE_MONTHS` above. That constant is
 * the DEFAULT number of columns rendered when nobody has touched the
 * dropdowns. This is the outer boundary of what the dropdowns may even
 * offer — the table can be asked to show any span within it, but never
 * outside it.
 *
 * INTENTIONALLY EQUAL to src/lib/schedule/editorCalendarRange.js's
 * `EDITOR_RANGE_MONTHS_BACK` / `EDITOR_RANGE_MONTHS_FORWARD` (12 / 24): a
 * round the picker allows selecting must not land in a table window the
 * admin has no way to reach, which is the defect the previous round fixed
 * from the picker's side. The equality is DELIBERATE, not automatic, and it
 * must stay that way without either module importing the other — the
 * picker decides what may be PICKED, this decides what the TABLE may be
 * asked to DISPLAY, and a test in test/pure/adminScheduleSelectableRange
 * pins them equal so a future edit to one is forced to look at the other
 * rather than drift by accident.
 */
export const ADMIN_SCHEDULE_RANGE_MONTHS_BACK = 12;
export const ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD = 24;

/** Total month keys in the selectable range, inclusive of the current month. */
export const ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL =
  ADMIN_SCHEDULE_RANGE_MONTHS_BACK + ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD + 1;

/** Local-time ISO date (YYYY-MM-DD). `toISOString()` shifts to UTC. */
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM` for a Date, in local time. */
function monthKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM` → `{ year, month }`, month 0-indexed. `null` if unparseable. */
function parseMonthKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year: Number(m[1]), month };
}

/** `n` months after `key`, through the Date constructor so it normalises
 *  an out-of-range month into the neighbouring year. */
function shiftMonthKey(key, n) {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  return monthKeyOf(new Date(parsed.year, parsed.month + Math.trunc(n), 1));
}

/**
 * Every month key from `fromKey` to `toKey`, inclusive at both ends.
 * `[]` for an unparseable `fromKey`. A `toKey` before `fromKey` yields just
 * `[fromKey]` rather than an empty or reversed list — callers that need
 * `to >= from` enforce it themselves (see `resolveAdminScheduleRange`).
 */
function monthKeysBetween(fromKey, toKey) {
  const start = parseMonthKey(fromKey);
  if (!start) return [];
  const rawEnd = parseMonthKey(toKey) ? String(toKey) : null;
  const end = rawEnd && rawEnd >= fromKey ? rawEnd : fromKey;

  const out = [];
  let cursor = String(fromKey);
  for (let guard = 0; cursor <= end && guard < 600; guard++) {
    out.push(cursor);
    cursor = shiftMonthKey(cursor, 1);
  }
  return out;
}

/**
 * The month columns the admin grid renders.
 *
 * With no explicit range, starts at `now`'s month and runs `ADMIN_SCHEDULE_
 * MONTHS` columns — UNCHANGED behaviour for every existing caller, which all
 * call this with zero or one argument. Pass `{ fromKey, toKey }` (both
 * required together) to render a caller-chosen span instead — the shape the
 * new selectable from/to dropdowns use.
 *
 * @param {Date} [now]
 * @param {{fromKey?: string, toKey?: string}} [explicit]
 * @returns {{ key: string, year: number, month: number }[]}
 *          `key` is the `YYYY-MM` bucket key rows are matched against;
 *          `month` is 0-indexed, as `Date.getMonth()` returns.
 */
export function adminScheduleMonthCols(now = new Date(), { fromKey, toKey } = {}) {
  if (fromKey && toKey) {
    return monthKeysBetween(fromKey, toKey).map((key) => {
      const { year, month } = parseMonthKey(key);
      return { key, year, month };
    });
  }

  const cols = [];
  for (let i = 0; i < ADMIN_SCHEDULE_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    cols.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  return cols;
}

/**
 * The MSDB query window for the admin grid.
 *
 * `to` is the LAST DAY of the last rendered column, so every row upstream
 * returns lands in a column that exists. `from` is today when the window
 * starts at the CURRENT month — unchanged from the original query, and
 * deliberately not month-aligned: sessions earlier this month are already
 * past and were never fetched. When an explicit `fromKey` moves the window's
 * start to a DIFFERENT month (the admin picked an earlier or later start),
 * `from` is the first day of that month instead — the "today" narrowing only
 * makes sense for the window that actually contains today.
 *
 * ── THAT "TODAY" NARROWING IS GONE, AND ITS REASON WITH IT ──────────────────
 * `from` is now the FIRST DAY of the first rendered column, unconditionally —
 * the exact mirror of what `to` already does at the other end.
 *
 * The narrowing was justified above in the words "sessions earlier this month
 * are already past and were never fetched". Both halves of that have stopped
 * being true. MSDB used to clamp any `from` earlier than today up to today, so
 * asking for them was pointless; it now honours a past `from` (verified
 * 2026-09-02: `from=2025-09-01` returns rows dated from 2025-11-18 onward,
 * where the same call previously reported `$gte: todayUTC` in its
 * `summary.filterUsed` and returned none). And this grid now WANTS them: a
 * finished round renders as จบไปแล้ว rather than being absent, so "already
 * past" is a thing to DRAW, not a reason to skip fetching.
 *
 * Left as it was, the defect would be invisible on the 1st of a month and grow
 * all month: on the 20th, the default view's own current-month column would
 * silently omit every round that ran on the 1st through the 19th, while the
 * eleven future columns looked complete. That is the same class of silent drop
 * this module's header was written about, arriving from the other direction —
 * a row excluded by our own bound rather than dropped after arriving.
 *
 * The `to` end is UNCHANGED. So is every column the grid renders: this widens
 * only what is FETCHED, into a column that already exists and already has a
 * cell waiting for it.
 *
 * @param {Date} [now]
 * @param {{fromKey?: string, toKey?: string}} [explicit]
 * @returns {{ from: string, to: string }} local ISO dates (YYYY-MM-DD)
 */
export function adminScheduleWindow(now = new Date(), { fromKey, toKey } = {}) {
  const cols = adminScheduleMonthCols(now, { fromKey, toKey });
  const first = cols[0];
  const last = cols[cols.length - 1];
  // day 0 of the following month === last day of `last`
  const lastDay = new Date(last.year, last.month + 1, 0);
  const from = toIsoDate(new Date(first.year, first.month, 1));
  return { from, to: toIsoDate(lastDay) };
}

/**
 * The outer boundary of what the from/to dropdowns may select — `min`
 * `ADMIN_SCHEDULE_RANGE_MONTHS_BACK` months behind `now`'s month, `max`
 * `ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD` months ahead of it.
 *
 * @param {Date} [now]
 * @returns {{min: string, max: string}} inclusive `YYYY-MM` keys
 */
export function adminScheduleSelectableRange(now = new Date()) {
  const nowKey = monthKeyOf(now);
  return {
    min: shiftMonthKey(nowKey, -ADMIN_SCHEDULE_RANGE_MONTHS_BACK),
    max: shiftMonthKey(nowKey, ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD),
  };
}

/** Every `YYYY-MM` key the from/to dropdowns may offer, in order. */
export function adminScheduleSelectableMonthKeys(now = new Date()) {
  const { min, max } = adminScheduleSelectableRange(now);
  return monthKeysBetween(min, max);
}

/**
 * The selectable range's own two ends, as ISO days — the FIRST day of `min`
 * through the LAST day of `max`.
 *
 * This is what the out-of-grid save warning (SchedulesAdminClient.jsx's
 * `gridWindowDays()`) now checks a round's dates against, in place of the
 * currently rendered columns. A date outside today's chosen from/to is not a
 * problem BY ITSELF — the admin can widen the dropdowns and see it — so the
 * warning must fire only when no dropdown selection could ever show the
 * round at all.
 *
 * @param {Date} [now]
 * @returns {{firstDay: string, lastDay: string}}
 */
export function adminScheduleSelectableWindowDays(now = new Date()) {
  const { min, max } = adminScheduleSelectableRange(now);
  const first = parseMonthKey(min);
  const last = parseMonthKey(max);
  return {
    firstDay: toIsoDate(new Date(first.year, first.month, 1)),
    lastDay: toIsoDate(new Date(last.year, last.month + 1, 0)),
  };
}

/**
 * Resolve the raw `monthFrom`/`monthTo` URL parameters into a valid,
 * in-range `{ from, to }` pair of `YYYY-MM` keys.
 *
 * Three rules, applied per end independently and then together:
 *
 *   1. MISSING or MALFORMED (not `YYYY-MM`) falls back to that end's default
 *      — the current month for `from`, `ADMIN_SCHEDULE_MONTHS - 1` months
 *      after it for `to`. Together, with NEITHER parameter given, this is
 *      exactly today's default view — unchanged.
 *   2. Well-formed but beyond `adminScheduleSelectableRange()` is CLAMPED to
 *      the nearest bound, rather than treated as malformed — a hand-edited
 *      URL narrows to what is selectable instead of being thrown out
 *      entirely.
 *   3. If the resolved `to` ends up before the resolved `from`, `to` is
 *      raised to `from` — a one-month view rather than an empty grid.
 *
 * @param {Date} [now]
 * @param {{fromKey?: string, toKey?: string}} [raw]
 * @returns {{from: string, to: string}}
 */
export function resolveAdminScheduleRange(now = new Date(), { fromKey, toKey } = {}) {
  const nowKey = monthKeyOf(now);
  const defaultFrom = nowKey;
  const defaultTo = shiftMonthKey(nowKey, ADMIN_SCHEDULE_MONTHS - 1);
  const { min, max } = adminScheduleSelectableRange(now);
  const clamp = (key) => (key < min ? min : key > max ? max : key);

  const from = parseMonthKey(fromKey) ? clamp(String(fromKey)) : defaultFrom;
  let to = parseMonthKey(toKey) ? clamp(String(toKey)) : defaultTo;
  if (to < from) to = from;

  return { from, to };
}
