/**
 * The ONE round-date formatter — days, months and the Buddhist year.
 *
 * Kept dependency-free ON PURPOSE: no `next/*`, no db, no models, no React —
 * the same rule as monthWindow.js and joinCourseSchedules.js in this folder,
 * and what lets the whole label algorithm be exercised in the `pure` tier
 * without a DOM.
 *
 * ── THE DEFECT THIS MODULE EXISTS TO REMOVE ─────────────────────────────────
 * There were FIVE independent round-date formatters and they disagreed with
 * each other. Three of them were not merely inconsistent, they were WRONG.
 * Given a round on 8, 10 and 12 ต.ค. — three separate days, nothing on the 9th
 * or the 11th — they rendered:
 *
 *   ScheduleClient.formatDateLabel               → `8-12`
 *   SearchClient's local copy                    → `8-12 ต.ค. 2569`
 *   pageBuilder/sections/course_schedule          → `8-12 ต.ค.`
 *   lib/formatScheduleDate                        → `8 & 12`   (loses the 10th)
 *   RegisterWizard / CareerPathRegisterClient     → `8-12`
 *
 * Every one of those either advertises training on the 9th and the 11th when
 * there is none, or silently drops a day the customer is paying to attend —
 * on pages where they can then book. First-date-to-last-date is not a range;
 * it is an assumption that the days in between exist.
 *
 * The rule here is that the label states what the round actually is: maximal
 * CONSECUTIVE runs are collapsed to their endpoints, and everything else is
 * listed. `8, 10, 12` stays three days; `30, 31, 1, 2` becomes `30 - 2`.
 *
 * ── THE BUDDHIST YEAR COMES FROM `Intl`, NEVER FROM `+ 543` ─────────────────
 * `th-TH` renders the Buddhist era natively. Hand-adding 543 shifts an already
 * Buddhist rendering a second time, and it cannot be reviewed by reading the
 * output because both spellings produce the same two digits. This file is on
 * test/fs/scheduleThaiYearSource's SCHEDULE_SURFACES list for that reason.
 *
 * The month abbreviation comes from `Intl` too, and deliberately not from a
 * ninth hand-written `MONTH_TH` array — there are already at least eight
 * copies of that array in src/, which is how the surfaces above managed to
 * disagree about a value that is pure locale data.
 */

import { monthKey } from '@/lib/schedule/monthWindow';

const MS_PER_DAY = 86_400_000;

const SHORT_MONTH = new Intl.DateTimeFormat('th-TH', { month: 'short' });
const YEAR_ONLY = new Intl.DateTimeFormat('th-TH', { year: '2-digit' });

/** `'ต.ค.'` — the abbreviated Thai month, from locale data. */
function monthText(date) {
  return SHORT_MONTH.format(date);
}

/**
 * `'69'` — the two-digit BUDDHIST year.
 *
 * Via `formatToParts` and `p.type === 'year'`, exactly as monthWindow's
 * `monthYearLabel` does: `{ year: '2-digit' }` formats as `'พ.ศ. 69'`, and
 * getting `'69'` out of that by `.slice(-2)` or by splitting on a space is a
 * guess about where the era prefix ends. That prefix is locale data an ICU
 * update may reword or reorder, with no error when it does. Asking for the
 * `year` PART asks the formatter the question directly.
 */
function yearText(date) {
  return YEAR_ONLY.formatToParts(date).find((p) => p.type === 'year')?.value ?? '';
}

/**
 * The input dates, normalised: ascending, invalid dropped, one entry per
 * CALENDAR DAY.
 *
 * Each survivor is rebuilt as a LOCAL MIDNIGHT Date. That is what keeps the
 * three consumers of a day — the adjacency index below, `Intl`, and
 * `monthKey` — reading the same calendar day: they all work in local time, and
 * an input carrying a time component would otherwise let a formatter and an
 * index disagree at the edges of a day.
 *
 * ── THE FALSY FILTER IS NOT REDUNDANT WITH THE NaN ONE ──────────────────────
 * `new Date(null)` is NOT an invalid date — `null` coerces to 0 and yields the
 * UNIX EPOCH, so a null in `dates` survives the NaN check and renders as
 * `1 ม.ค. 13`. Same for `0` and `false`. Only `undefined` and `''` produce a
 * genuine Invalid Date. Upstream sends this array straight from Mongo and a
 * null in it is entirely ordinary, so the epoch would have shipped as a real
 * training day fifty-six years in the past. Caught by the `allInvalid` row in
 * test/pure/roundDateLabel.
 */
function calendarDays(dates) {
  const seen = new Set();
  return (Array.isArray(dates) ? dates : [])
    .filter((d) => d !== null && d !== undefined && d !== '')
    .map((d) => (d instanceof Date ? d : new Date(d)))
    .filter((d) => !Number.isNaN(d.getTime()))
    .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()))
    .sort((a, b) => a - b)
    .filter((d) => {
      const key = dayIndex(d);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * A day's ordinal, for adjacency.
 *
 * Through `Date.UTC` on the LOCAL calendar fields rather than through the
 * timestamp: a plain millisecond difference is not a whole number of days in
 * every zone, and "is the next day" has to hold across a month boundary, a
 * year boundary and a leap day alike. Taking the fields out and putting them
 * back in UTC makes the arithmetic exact and independent of the runtime zone.
 */
function dayIndex(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

/** Maximal runs of calendar-consecutive days. `[[8], [10], [12]]`, `[[30,31,1,2]]`. */
function consecutiveRuns(days) {
  const runs = [];
  for (const day of days) {
    const current = runs[runs.length - 1];
    if (current && dayIndex(day) === dayIndex(current[current.length - 1]) + 1) {
      current.push(day);
    } else {
      runs.push([day]);
    }
  }
  return runs;
}

/**
 * Which months a round touches, as `YYYY-MM` keys.
 *
 * Exported because the desktop table's lane packing (lib/schedule/monthLanes)
 * decides how many columns a round spans, and that decision MUST agree with
 * the label byte for byte about which months are involved. Two answers to
 * "which months is this round in" is how a round ends up spanning ก.ย.–ต.ค.
 * while its own label says it is entirely in October.
 *
 * @param {Array<string|Date>} dates
 * @returns {{startKey: string|null, endKey: string|null}} both null when there
 *   is no usable date at all
 */
export function roundMonthSpan(dates) {
  const days = calendarDays(dates);
  if (days.length === 0) return { startKey: null, endKey: null };
  return {
    startKey: monthKey(days[0]),
    endKey: monthKey(days[days.length - 1]),
  };
}

/**
 * A round's days, as one label.
 *
 * @param {Array<string|Date>} dates the round's dates, in any order
 * @param {object} [options]
 * @param {boolean} [options.showMonth=false] carry the month when the round
 *   does NOT cross one. A round that DOES cross always shows its months,
 *   whatever this says — see below.
 * @param {false|true|'auto'} [options.showYear=false] see the year rules below.
 * @param {number|null} [options.currentYear=null] the GREGORIAN year "now",
 *   required by and only by `showYear: 'auto'`.
 * @returns {string} the label, or `'-'` when there is no usable date
 *
 * ── MONTH ATTACHMENT ────────────────────────────────────────────────────────
 * A printed token carries its month when the NEXT printed token has a
 * different month, or when it is the last token. Then:
 *
 *   · does not cross a month, `showMonth: false` → no month anywhere. This is
 *     the desktop table, where the column header supplies it.
 *   · does not cross a month, `showMonth: true`  → the month on the last token
 *     only, so `8, 10, 12 ต.ค.` rather than `8 ต.ค., 10 ต.ค., 12 ต.ค.`.
 *   · CROSSES a month → every month is kept REGARDLESS of `showMonth`. A
 *     crossing round under a single month heading is unreadable without them:
 *     `30 - 1` under ก.ย. is a date that does not exist.
 *
 * ── YEAR ATTACHMENT ─────────────────────────────────────────────────────────
 *   · `false` — no year anywhere. The desktop table: EVERY column header
 *     carries its own Buddhist year (see monthColumns), so even a round
 *     crossing a year boundary is unambiguous there.
 *   · `true` — on the last token, and on any token whose next token is in a
 *     different year.
 *   · `'auto'` — on any token whose next token is in a different year, and on
 *     the last token only when its year differs from `currentYear`.
 *
 * The two halves of `'auto'` are not the same rule and must not be collapsed
 * into "print the year only if the round is not in the current year". A round
 * running 30 ธ.ค. 69 → 2 ม.ค. 70 would then render `30 ธ.ค., 2 ม.ค. 70`, which
 * reads as one December and one January THIRTEEN MONTHS APART. The first token
 * needs its year because of its neighbour, not because of today.
 *
 * ── WHY `'auto'` REFUSES TO GUESS `currentYear` ─────────────────────────────
 * Reading `new Date().getFullYear()` in here would be cheaper for every caller
 * and wrong for seven hours a year. Vercel runs in UTC; for the seven hours
 * before midnight Bangkok on 31 December the server's year and the visitor's
 * year disagree, so a round in the new year would render WITHOUT its year on
 * the server and WITH it on the client — a hydration mismatch on the one night
 * where the year is the thing being asked about. Refusing to guess pushes the
 * clock read out to a caller that can pin the zone (see lib/articlePublishTime,
 * which owns Asia/Bangkok for exactly this reason).
 *
 * The check is made on the OPTIONS, before the dates are looked at, so an
 * ill-formed call fails the same way whether or not it happens to be holding
 * an empty round today.
 */
export function formatRoundDays(dates, options = {}) {
  const { showMonth = false, showYear = false, currentYear = null } = options;

  if (showYear === 'auto' && !Number.isFinite(currentYear)) {
    throw new TypeError(
      "formatRoundDays: showYear: 'auto' requires a numeric currentYear — " +
        'this module will not read the clock, because the server and the ' +
        'visitor disagree about the year for seven hours every 31 December',
    );
  }

  const days = calendarDays(dates);
  if (days.length === 0) return '-';

  // ── Tokens. Only a run's ENDPOINTS are printed, never the days between. ──
  const runs = consecutiveRuns(days);
  const tokens = [];
  for (const run of runs) {
    const endpoints = run.length === 1 ? [run[0]] : [run[0], run[run.length - 1]];
    endpoints.forEach((date, i) => {
      // The separator that precedes this token: a run's two endpoints are a
      // range, everything else is a list.
      tokens.push({ date, inRange: i > 0 });
    });
  }

  const last = tokens.length - 1;
  const crossesMonth = monthKey(days[0]) !== monthKey(days[days.length - 1]);

  // ── Which tokens carry a month ──────────────────────────────────────────
  const wantsMonth = tokens.map((t, i) => {
    const boundary =
      i === last || monthKey(t.date) !== monthKey(tokens[i + 1].date);
    if (crossesMonth) return boundary;
    if (!showMonth) return false;
    return i === last;
  });

  // ── Which tokens carry a year ───────────────────────────────────────────
  const wantsYear = tokens.map((t, i) => {
    if (showYear === false) return false;
    if (i < last) {
      // The neighbour rule, and it is the SAME rule for `true` and `'auto'`:
      // a token whose successor is in another year has to say which year it
      // is in, or the pair reads as a single span within one year.
      return t.date.getFullYear() !== tokens[i + 1].date.getFullYear();
    }
    if (showYear === 'auto') return t.date.getFullYear() !== currentYear;
    return true;
  });

  const rendered = tokens.map((t, i) => {
    const parts = [String(t.date.getDate())];
    if (wantsMonth[i]) parts.push(monthText(t.date));
    if (wantsYear[i]) parts.push(yearText(t.date));
    return parts.join(' ');
  });

  let out = '';
  for (let i = 0; i < rendered.length; i++) {
    if (i > 0) {
      // A hyphen sits tight between two bare numbers (`16-17`) and needs room
      // once the left side has grown words (`30 ก.ย. - 1 ต.ค.`).
      out += tokens[i].inRange
        ? (wantsMonth[i - 1] || wantsYear[i - 1] ? ' - ' : '-')
        : ', ';
    }
    out += rendered[i];
  }
  return out;
}
