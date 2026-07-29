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
 * NOT the modal's date-picker calendar. `calendarMonths` in
 * SchedulesAdminClient.jsx bounds how far a user can scroll while picking
 * session dates — a different concept that merely happened to be 4 too.
 * See the comment there. Do not import this constant into it.
 *
 * Dependency-free by design (no next/*, no db, no models) so the server
 * page, the client component, and the `pure` test tier can all import it.
 */

export const ADMIN_SCHEDULE_MONTHS = 12;

/** Local-time ISO date (YYYY-MM-DD). `toISOString()` shifts to UTC. */
function toIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The month columns the admin grid renders, starting at `now`'s month.
 *
 * @param {Date} [now]
 * @returns {{ key: string, year: number, month: number }[]}
 *          `key` is the `YYYY-MM` bucket key rows are matched against;
 *          `month` is 0-indexed, as `Date.getMonth()` returns.
 */
export function adminScheduleMonthCols(now = new Date()) {
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
 * returns lands in a column that exists. `from` is today — unchanged from
 * the original query, and deliberately not month-aligned: the first column
 * is the current month, but sessions earlier this month are already past
 * and were never fetched.
 *
 * @param {Date} [now]
 * @returns {{ from: string, to: string }} local ISO dates (YYYY-MM-DD)
 */
export function adminScheduleWindow(now = new Date()) {
  const cols = adminScheduleMonthCols(now);
  const last = cols[cols.length - 1];
  // day 0 of the following month === last day of `last`
  const lastDay = new Date(last.year, last.month + 1, 0);
  return { from: toIsoDate(now), to: toIsoDate(lastDay) };
}
