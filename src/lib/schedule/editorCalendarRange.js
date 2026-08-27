/**
 * The admin schedule EDITOR's date-picker range — what months a user can
 * navigate to while picking session dates in the แก้ไขตารางอบรม modal.
 *
 * ── THE BUG THIS MODULE EXISTS TO REMOVE ────────────────────────────────────
 * The picker used to render four consecutive month blocks starting at
 * `initialMonthKey`, falling back to `new Date()` when that was null. On the
 * CREATE path a hint was passed. On the EDIT path it was not — `openEdit` built
 * `{ mode: 'edit', schedule }` with no `monthKeyHint` — so the window was
 * anchored on TODAY and never on the round being edited.
 *
 * Measured on 2026-08-27 against the live feed: of 90 future rounds, FIFTEEN
 * had a date past the picker's ceiling of 2026-11-30 (today + 3 months). Those
 * rounds opened with their dates shown correctly in the summary line and no day
 * cell anywhere in the DOM to click — the month block was never rendered at
 * all, so the dates could be neither seen in the grid nor changed. A round on
 * 2026-12-16 was, in practice, uneditable.
 *
 * ── THE RULE THAT IS THE FIX ────────────────────────────────────────────────
 * THE RANGE MUST ALWAYS CONTAIN THE DATA BEING EDITED. That is the invariant,
 * and it is the reason `rangeFor` takes the selected dates as an argument
 * rather than deriving a window from the clock alone. The ±1/±2 year defaults
 * below are ergonomics — a comfortable amount of room around today — and they
 * may be re-tuned on their own evidence. They are NOT the fix, and widening
 * them is not a substitute for the invariant: any fixed horizon, however
 * generous, is a horizon some stored date eventually sits outside of. That is
 * exactly how a picker anchored on today produced an uneditable round.
 *
 * ── NOT `ADMIN_SCHEDULE_MONTHS`, AND NOT `monthWindow.js` ───────────────────
 * Two other modules in this repo also express "a number of months" and this one
 * must not reach for either:
 *
 *   · src/lib/adminScheduleHorizon.js — `ADMIN_SCHEDULE_MONTHS`, a FETCH bound.
 *     It decides which rows MSDB is asked for and how many columns the admin
 *     table draws. It answers "will this round appear in the table".
 *   · src/lib/schedule/monthWindow.js — the public /schedule table's DISPLAY
 *     window over data already fetched. It answers "what does a visitor see".
 *
 * This module answers "WHAT CAN BE PICKED", and the answer must not depend on
 * either of the other two. A grid that shows twelve months is not a reason a
 * date thirteen months out cannot be corrected; that coupling is the class of
 * defect above, re-introduced from the other end. The table's reach is a
 * separate question, asked separately at save time — see the out-of-grid
 * warning in SchedulesAdminClient.jsx, which calls the grid helper directly
 * BECAUSE that question genuinely is about the grid.
 *
 * A whole-file scan in test/pure/adminScheduleHorizon.test.mjs asserts no grid
 * identifier appears anywhere in this file. There is no legitimate reason for
 * one to, so the scan needs no anchors and cannot rot.
 *
 * Dependency-free by design (no next/*, no db, no models, no React) so the
 * modal, and the `pure` test tier, can both import it.
 */

/**
 * How far back the picker reaches by default, in months. Twelve — a year.
 *
 * Backdating a round is legitimate (a session is being recorded after the
 * fact), and the previous picker allowed it only by accident: it rendered from
 * the 1st of the current month with no lower gate, so the earlier part of the
 * current month was clickable and nothing before it existed. A year is enough
 * room to correct last season's records without the arrows becoming a journey.
 */
export const EDITOR_RANGE_MONTHS_BACK = 12;

/**
 * How far forward the picker reaches by default, in months. Twenty-four.
 *
 * Deliberately LONGER than the backward reach and deliberately longer than the
 * admin grid's twelve: scheduling forward is the common case, and the whole
 * point of this module is that the picker's reach is not the table's. Measured
 * on 2026-08-27 the furthest published round was 2027-01-01, so two years is
 * well clear of real data — which is the intent. The invariant below is what
 * guarantees correctness; this number only decides how often a user meets a
 * disabled arrow.
 */
export const EDITOR_RANGE_MONTHS_FORWARD = 24;

/** How many month blocks the picker shows side by side. */
export const EDITOR_VISIBLE_MONTHS = 2;

/**
 * `YYYY-MM` for a Date, in LOCAL time.
 *
 * Local, not UTC: `toISOString()` shifts the date, and a session at
 * 2026-09-01T00:00 in Bangkok is August 31st in UTC — i.e. the wrong month.
 * The modal buckets in local time and this matches it.
 *
 * @param {Date} date
 * @returns {string|null} null for a missing or invalid date, never 'NaN-NaN'
 */
export function monthKeyOf(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * `YYYY-MM` → `{ year, month }`, month 0-indexed as `Date.getMonth()` returns.
 * @returns {{year: number, month: number}|null}
 */
export function parseMonthKeyOf(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year: Number(m[1]), month };
}

/**
 * `n` months after `key`; negative `n` goes back.
 *
 * Through `new Date(year, month + n, 1)` rather than modular arithmetic on the
 * month, because the Date constructor already normalises an out-of-range month
 * into the neighbouring year — which is the entire behaviour being bought.
 */
export function shiftMonthKey(key, n) {
  const parsed = parseMonthKeyOf(key);
  if (!parsed) return null;
  const step = Math.trunc(Number(n));
  if (!Number.isFinite(step)) return null;
  return monthKeyOf(new Date(parsed.year, parsed.month + step, 1));
}

/**
 * The month key of the earliest / latest entry in a list of `YYYY-MM-DD`
 * strings. `YYYY-MM-DD` is fixed-width and zero-padded, so lexicographic order
 * IS chronological order and a plain string compare is correct — the same
 * property monthWindow.js relies on, arrived at independently here rather than
 * imported, because importing it would couple this module to that one.
 *
 * @param {string[]} isoDates
 * @returns {{first: string|null, last: string|null}} month keys, not dates
 */
export function storedMonthSpan(isoDates) {
  const valid = (Array.isArray(isoDates) ? isoDates : [])
    .map((d) => String(d ?? '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (!valid.length) return { first: null, last: null };
  return { first: valid[0].slice(0, 7), last: valid[valid.length - 1].slice(0, 7) };
}

/**
 * The navigable month range for the picker.
 *
 * lower = min(startOfMonth(today - EDITOR_RANGE_MONTHS_BACK), earliest stored)
 * upper = max(startOfMonth(today + EDITOR_RANGE_MONTHS_FORWARD), latest stored)
 *
 * The `min`/`max` against the stored span is the invariant, not a courtesy:
 * without it a stored date outside the default window has no month block and
 * therefore no day cell, which is the defect this module was written for. Note
 * the widening is one-sided per end — a round three years back widens only the
 * lower bound and leaves the forward reach at its default.
 *
 * @param {object} [opts]
 * @param {Date}   [opts.now]
 * @param {string[]} [opts.selectedDates] `YYYY-MM-DD`, in any order
 * @returns {{min: string, max: string}} inclusive month keys
 */
export function rangeFor({ now = new Date(), selectedDates = [] } = {}) {
  const anchor = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const nowKey = monthKeyOf(anchor);

  const defaultMin = shiftMonthKey(nowKey, -EDITOR_RANGE_MONTHS_BACK);
  const defaultMax = shiftMonthKey(nowKey, EDITOR_RANGE_MONTHS_FORWARD);

  const { first, last } = storedMonthSpan(selectedDates);

  return {
    min: first && first < defaultMin ? first : defaultMin,
    max: last && last > defaultMax ? last : defaultMax,
  };
}

/**
 * Where the picker opens.
 *
 * On EDIT, the month of the EARLIEST stored date — so a round on 30 Oct + 2 Nov
 * opens on October with both months on screen, and a round in December opens in
 * December. This is the half the old code got wrong: it had `schedule.dates` in
 * hand and used the clock instead.
 *
 * On CREATE, the caller's `monthKeyHint` (the grid cell that was clicked),
 * falling back to the current month.
 *
 * The result is always clamped into `range`, so the opening month can never sit
 * outside the arrows' reach — including the case where the left block would run
 * off the start, handled by `visibleMonthsFrom`.
 *
 * @param {object} opts
 * @param {boolean} [opts.isEdit]
 * @param {string[]} [opts.selectedDates]
 * @param {string} [opts.monthKeyHint]
 * @param {Date} [opts.now]
 * @param {{min: string, max: string}} [opts.range]
 * @returns {string} a `YYYY-MM` key
 */
export function openingMonth({
  isEdit = false,
  selectedDates = [],
  monthKeyHint = null,
  now = new Date(),
  range = null,
} = {}) {
  const anchor = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const bounds = range ?? rangeFor({ now: anchor, selectedDates });

  const { first } = storedMonthSpan(selectedDates);
  const hint = parseMonthKeyOf(monthKeyHint) ? String(monthKeyHint) : null;

  let wanted;
  if (isEdit && first) wanted = first;
  else if (hint) wanted = hint;
  else wanted = monthKeyOf(anchor);

  if (wanted < bounds.min) return bounds.min;
  if (wanted > bounds.max) return bounds.max;
  return wanted;
}

/**
 * The month keys rendered side by side, given the left-hand cursor.
 *
 * When the cursor sits on the last month of the range there is no month to its
 * right, so the pair is pulled BACK by one rather than rendering a half-empty
 * row or a block outside the range. A range only one month long yields a single
 * block — the caller renders whatever it gets rather than assuming two.
 *
 * @param {string} cursorKey
 * @param {{min: string, max: string}} range
 * @param {number} [count]
 * @returns {string[]}
 */
export function visibleMonthsFrom(cursorKey, range, count = EDITOR_VISIBLE_MONTHS) {
  if (!parseMonthKeyOf(cursorKey) || !range) return [];
  const n = Math.max(1, Math.trunc(Number(count)) || 1);

  let start = cursorKey;
  if (start < range.min) start = range.min;

  // Pull back so the rightmost block lands on or before `range.max`.
  for (let i = 0; i < n - 1; i++) {
    const end = shiftMonthKey(start, n - 1);
    if (end && end > range.max) {
      const back = shiftMonthKey(start, -1);
      if (!back || back < range.min) break;
      start = back;
    } else break;
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const key = shiftMonthKey(start, i);
    if (!key || key > range.max) break;
    out.push(key);
  }
  return out;
}

/**
 * Whether the arrows can step. One month per press, in both directions.
 *
 * `canPrev` compares the cursor to `range.min`; `canNext` compares the RIGHTMOST
 * VISIBLE block to `range.max`, not the cursor — otherwise the last month of the
 * range could only be reached as a left-hand block, and the final press would
 * scroll a month that was already on screen into the position it already
 * occupied. With two blocks visible, the last enabled step lands the pair on the
 * final two months.
 *
 * @param {string} cursorKey
 * @param {{min: string, max: string}} range
 * @param {number} [count]
 * @returns {{canPrev: boolean, canNext: boolean}}
 */
export function arrowState(cursorKey, range, count = EDITOR_VISIBLE_MONTHS) {
  if (!parseMonthKeyOf(cursorKey) || !range) return { canPrev: false, canNext: false };
  const visible = visibleMonthsFrom(cursorKey, range, count);
  const rightmost = visible.length ? visible[visible.length - 1] : cursorKey;
  return {
    canPrev: cursorKey > range.min,
    canNext: rightmost < range.max,
  };
}

/**
 * Step the cursor by `delta` months, clamped so it never leaves the range and
 * never pushes the visible pair past `range.max`.
 *
 * @param {string} cursorKey
 * @param {number} delta
 * @param {{min: string, max: string}} range
 * @param {number} [count]
 * @returns {string} the new cursor, or the old one when the step is not allowed
 */
export function stepMonth(cursorKey, delta, range, count = EDITOR_VISIBLE_MONTHS) {
  if (!parseMonthKeyOf(cursorKey) || !range) return cursorKey;
  const next = shiftMonthKey(cursorKey, delta);
  if (!next) return cursorKey;
  if (next < range.min) return range.min;

  const n = Math.max(1, Math.trunc(Number(count)) || 1);
  // The rightmost block must stay within the range.
  const end = shiftMonthKey(next, n - 1);
  if (end && end > range.max) {
    const latestStart = shiftMonthKey(range.max, -(n - 1));
    return latestStart && latestStart >= range.min ? latestStart : range.min;
  }
  return next;
}

/** The days of a month as local Dates, 1st through last. */
export function daysOfMonth(key) {
  const parsed = parseMonthKeyOf(key);
  if (!parsed) return [];
  const days = [];
  const d = new Date(parsed.year, parsed.month, 1);
  while (d.getMonth() === parsed.month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
