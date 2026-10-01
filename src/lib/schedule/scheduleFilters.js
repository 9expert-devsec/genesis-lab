/**
 * The /schedule filter state: its DEFAULTS, and how many of them a visitor has
 * moved off default.
 *
 * Kept dependency-free (no React, no next/*) for the same reason monthWindow.js
 * is — it is the module the `pure` tier can check without a DOM.
 *
 * ── WHY THE DEFAULTS ARE A FUNCTION AND NOT A CONSTANT ──────────────────────
 * Three call sites need the same answer and none of them may derive it
 * independently:
 *
 *   1. the initial state of the filter controls;
 *   2. ล้างตัวกรอง in the mobile sheet, which must restore exactly that;
 *   3. the "N filters active" badge on the ตัวกรอง button, which is the
 *      DIFFERENCE between the current state and (1).
 *
 * A constant cannot serve any of them, because the window STARTS at the current
 * month — so it is a function of the instant the page mounted. That is not a
 * detail: the defect monthWindow.js exists to remove was a "default" that
 * silently meant "the rest of this calendar year" whichever month you arrived
 * in, so a reset that restored มกราคม–ธันวาคม would be that same bug wearing a
 * button.
 *
 * ── THE END IS NOW AN ARGUMENT, AND THAT IS THE POINT ───────────────────────
 * It used to be `rollingWindow(now, PUBLIC_SCHEDULE_DEFAULT_MONTHS)` — six
 * months, computed here. The range is data-derived now (December of this year,
 * or of next year when an eligible round reaches past it — see
 * monthWindow's `scheduleWindowEnd`), and the data lives on the server. This
 * module cannot see it and must not guess at it, so the end key is PASSED IN.
 *
 * The default view is therefore the WHOLE option range rather than a shorter
 * window inside it. "What the page opens on" and "what the filter can reach"
 * are one answer; there is no longer a narrower default that can hide rounds
 * the dropdown would have reached.
 *
 * `now` is a parameter rather than a `new Date()` read inside, so the caller
 * reads the clock ONCE per mount and the three answers above cannot disagree
 * with each other by a month boundary crossed mid-session.
 *
 * ── AND THE MONTH IS BANGKOK'S, NOT THE RUNTIME'S ───────────────────────────
 * The window STARTS at "this month", and which month that is now goes through
 * `siteMonthKey` (lib/articlePublishTime) rather than through `monthKey`'s
 * runtime-local getters. Vercel runs in UTC, so between 17:00 and 24:00 Bangkok
 * on the last day of a month the two answers differ by a whole month: the
 * server rendered a window opening on October while the visitor's browser
 * recomputed one opening on November, for the same page. The round DATES are
 * still bucketed by `monthKey` — see siteMonthKey's docstring for why only the
 * clock read moved.
 */

import { siteMonthKey } from '@/lib/articlePublishTime';
import { decemberOf, parseMonthKey } from './monthWindow';

/**
 * The "no opinion" value shared by the program / type / status selects.
 *
 * Named because it is written into three `<option value>`s, compared against in
 * `matchesSession`, and counted here — a bare `'all'` in four places is four
 * chances to typo one of them into a filter that silently matches nothing.
 */
export const SCHEDULE_FILTER_ALL = 'all';

/**
 * The state the page opens with: everything unfiltered, and the FULL month
 * range — the current Bangkok month through `endKey`.
 *
 * `endKey` is the range end the server computed (monthWindow's
 * `scheduleWindowEnd`). A missing or unparseable one falls back to December of
 * the start's own year — the rule's own floor, never a bare `start`: a
 * one-column default would look like a broken page, and this is the branch a
 * failed fetch lands in.
 *
 * @param {Date} [now]
 * @param {string} [endKey] `YYYY-MM`, the last month the range reaches
 * @returns {{program: string, type: string, status: string, monthFrom: string, monthTo: string}}
 */
export function defaultScheduleFilters(now = new Date(), endKey = null) {
  // The Bangkok month key, NOT the Date — a Date would be run through
  // `monthKey`'s runtime-local getters. See above.
  const start = siteMonthKey(now);
  const floor = decemberOf(start, 0) ?? start;
  const end = parseMonthKey(endKey) ? String(endKey) : floor;
  return {
    program: SCHEDULE_FILTER_ALL,
    type: SCHEDULE_FILTER_ALL,
    status: SCHEDULE_FILTER_ALL,
    monthFrom: start,
    // Never before the start. The server's end and the client's clock are read
    // at different instants, so a page cached in December and served in January
    // would otherwise hand back a reversed range.
    monthTo: end < start ? start : end,
  };
}

/**
 * How many filters the visitor has actually applied, 0–4.
 *
 * The month range counts as ONE filter, not two: `from` and `to` are one
 * decision expressed in two controls, and a badge that read "2" for moving a
 * single slider would be lying about how much is switched on.
 *
 * The comparison is against a PASSED-IN defaults object rather than a freshly
 * computed one. Recomputing here would make the badge depend on the clock at
 * render time instead of the clock at mount time — so a session left open
 * across midnight on the 1st would light up the badge with no user action.
 */
export function activeScheduleFilterCount(filters, defaults) {
  if (!filters || !defaults) return 0;
  let count = 0;
  for (const key of ['program', 'type', 'status']) {
    if (filters[key] !== SCHEDULE_FILTER_ALL) count += 1;
  }
  if (
    filters.monthFrom !== defaults.monthFrom ||
    filters.monthTo !== defaults.monthTo
  ) {
    count += 1;
  }
  return count;
}

/**
 * Does one schedule row survive the type / status filters?
 *
 * THE ONE MATCHER. The desktop table filters per CELL and the mobile card
 * filters per ROUND; if either kept its own copy the two layouts would disagree
 * about what the filter means, and the disagreement would be invisible because
 * no viewport shows both at once. The program filter is NOT here: it selects
 * whole courses, not sessions.
 */
export function matchesSession(filters, schedule) {
  const type = filters?.type ?? SCHEDULE_FILTER_ALL;
  const status = filters?.status ?? SCHEDULE_FILTER_ALL;
  return (
    (type === SCHEDULE_FILTER_ALL || schedule?.type === type) &&
    (status === SCHEDULE_FILTER_ALL || schedule?.status === status)
  );
}
