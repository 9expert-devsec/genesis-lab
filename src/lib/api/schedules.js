/**
 * Schedules adapter.
 *
 * Upstream path: `/schedules` (plural — confirmed by integration guide).
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/schedules';

/**
 * ── THE `status` OPT-IN ─────────────────────────────────────────────────────
 * With no `status` param, `/schedules` applies its own public filter and hands
 * back only the rounds it considers registerable — which silently EXCLUDES
 * every `full` round. That default is why a sold-out round used to be missing
 * from /schedule rather than shown as เต็ม, and why a `?class=` deep link to
 * one rendered a blank step 1.
 *
 * Upstream accepts a comma-joined subset of the vocabulary, or the literal
 * `all`. The enum it validates against is `open | nearly_full | full | all` —
 * anything else is a 400, so these two constants are the only values we send.
 *
 *   PUBLIC — the three statuses a public surface RENDERS. Spelled out rather
 *            than `all` on purpose: if MSDB ever adds a fourth status (a draft,
 *            a cancelled round), `all` would leak it onto the public site the
 *            day it ships. This list opts in to exactly what /schedule,
 *            /registration and the course detail page know how to draw.
 *   ADMIN  — `all`, deliberately open-ended for the opposite reason: the admin
 *            table is the place a new status must show up unannounced.
 *
 * Every caller passes one of these; no surface builds a query string of its
 * own. The param is threaded through `listSchedules`/`listSchedulesByCourse`
 * and defaults to `undefined`, so a caller that says nothing keeps the exact
 * upstream-filtered feed it had before this existed.
 */
export const PUBLIC_SCHEDULE_STATUSES = 'open,nearly_full,full';
export const ADMIN_SCHEDULE_STATUSES = 'all';

/**
 * Schedule lookup. All parameters are optional.
 *
 * @param {object} opts
 * @param {string} opts.date       — single date: 'YYYY-MM-DD'
 * @param {string} opts.from       — range start: 'YYYY-MM-DD'
 * @param {string} opts.to         — range end:   'YYYY-MM-DD'
 * @param {string|string[]} opts.courses — course ID(s); comma-joined upstream
 * @param {string} opts.status     — PUBLIC_SCHEDULE_STATUSES or
 *                                   ADMIN_SCHEDULE_STATUSES. Omitted = the
 *                                   upstream public filter (no `full` rows).
 * @param {number} opts.revalidate — override Next.js ISR seconds. Default 1800
 *                                   (30 min). Admin pages pass `0` to read
 *                                   uncached so just-written rows show up.
 */
export async function listSchedules({
  date,
  from,
  to,
  courses,
  status,
  revalidate = 1800,
} = {}) {
  const coursesParam = Array.isArray(courses) ? courses.join(',') : courses;
  const raw = await aiFetch(PATH, {
    params: { date, from, to, courses: coursesParam, status },
    revalidate,
    tags: ['schedules'],
  });
  return unwrap(raw);
}

/**
 * Fetch all upcoming schedules across every course.
 *
 * Wraps `listSchedules` with `from = today` so we get only future
 * sessions.
 *
 * Pass `status` to widen what comes back — /schedule sends
 * PUBLIC_SCHEDULE_STATUSES so sold-out rounds arrive and can be drawn as เต็ม
 * instead of vanishing. Omitting it keeps the narrower upstream default.
 *
 * Items reference their course via the `course` ObjectId (the same
 * convention `listSchedulesByCourse` reads on the way in). The page
 * server component re-attaches schedules to course rows by `_id`.
 */
export async function getAllSchedules({ status } = {}) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return listSchedules({ from: `${yyyy}-${mm}-${dd}`, status });
}

/**
 * Fetch upcoming schedules for a specific course.
 *
 * @param {string} courseObjectId — upstream MongoDB `_id` (NOT course_id code).
 *                                  The `/schedules` endpoint uses the `course`
 *                                  param, which takes an ObjectId — the opposite
 *                                  convention from `/public-course?course_id=...`.
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {string} [options.status] — see PUBLIC_SCHEDULE_STATUSES above.
 *
 * Without `status`, upstream auto-filters to the registerable statuses and
 * dates >= today, so a `full` round never arrives. The registration page, the
 * course detail page and the course CARDS pass PUBLIC_SCHEDULE_STATUSES
 * because all must SHOW a sold-out round rather than pretend it does not exist.
 *
 * WHAT `status` DOES AND DOES NOT WIDEN — measured, because only the no-status
 * case used to be documented and the difference decides whether a caller needs
 * its own date filter:
 *   · `status` widens the STATUS set only. The `>= today` bound is applied
 *     UNCONDITIONALLY by the endpoint and is NOT lifted by passing `status` —
 *     checked at the widest the enum allows (`status=all`): 104 rows globally,
 *     zero dated before today, and per-course `all` returned byte-identical
 *     rows to the public subset.
 *   · Rows come back in ASCENDING date order.
 * So a caller passing `status` still gets upcoming-only, already sorted, and
 * needs NO client-side filter and NO client-side sort. A `full` round therefore
 * lands in strict chronological position among the open ones.
 *
 * curl-verified 2026-04-23; status param curl-verified 2026-08-10;
 * date bound + ordering under `status` curl-verified 2026-08-13.
 */
export async function listSchedulesByCourse(courseObjectId, options = {}) {
  if (!courseObjectId) return { items: [], total: 0 };
  const raw = await aiFetch(PATH, {
    params: {
      course: courseObjectId,
      limit: options.limit ?? 20,
      status: options.status,
    },
    revalidate: 1800,
    tags: [`schedules:course:${courseObjectId}`],
  });
  return unwrap(raw);
}
