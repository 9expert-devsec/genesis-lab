/**
 * Schedules adapter.
 *
 * Upstream path: `/schedules` (plural — confirmed by integration guide).
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/schedules';

/**
 * Schedule lookup. All parameters are optional.
 *
 * @param {object} opts
 * @param {string} opts.date       — single date: 'YYYY-MM-DD'
 * @param {string} opts.from       — range start: 'YYYY-MM-DD'
 * @param {string} opts.to         — range end:   'YYYY-MM-DD'
 * @param {string|string[]} opts.courses — course ID(s); comma-joined upstream
 */
export async function listSchedules({ date, from, to, courses } = {}) {
  const coursesParam = Array.isArray(courses) ? courses.join(',') : courses;
  const raw = await aiFetch(PATH, {
    params: { date, from, to, courses: coursesParam },
    revalidate: 1800, // 30 min — schedules change more often than static content
    tags: ['schedules'],
  });
  return unwrap(raw);
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
 *
 * Upstream auto-filters to status open/nearly_full, non-empty
 * signup_url, and dates >= today. No client-side filtering needed.
 *
 * curl-verified 2026-04-23.
 */
export async function listSchedulesByCourse(courseObjectId, options = {}) {
  if (!courseObjectId) return { items: [], total: 0 };
  const raw = await aiFetch(PATH, {
    params: {
      course: courseObjectId,
      limit: options.limit ?? 20,
    },
    revalidate: 1800,
    tags: [`schedules:course:${courseObjectId}`],
  });
  return unwrap(raw);
}
