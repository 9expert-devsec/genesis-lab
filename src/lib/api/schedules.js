/**
 * Schedules adapter.
 *
 * Upstream path: `/schedules` (plural — confirmed by integration guide).
 * curl-verified: NOT YET (verify before Phase 2)
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
