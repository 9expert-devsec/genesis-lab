/**
 * Public Courses adapter.
 *
 * Upstream path: `/public-course` (singular — confirmed by curl
 * against live MSDB). The integration guide mixes singular and plural
 * in examples; only the singular form returns 200 + data.
 *
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/public-course';

/**
 * List all active public courses.
 * Optional filters: skill (skill ID), program (program ID).
 */
export async function listPublicCourses({ skill, program } = {}) {
  const raw = await aiFetch(PATH, {
    params: { skill, program },
    tags: ['public-courses'],
  });
  return unwrap(raw);
}

/**
 * Get a single course by ID or slug/code (e.g. "MSE-L1" or Mongo ObjectId).
 * Upstream supports both via the same `course` query parameter.
 */
export async function getPublicCourse(idOrCode) {
  const raw = await aiFetch(PATH, {
    params: { course: idOrCode },
    tags: [`public-course:${idOrCode}`],
  });
  const { items } = unwrap(raw);
  return items[0] ?? null;
}

/**
 * Fetch a single course by its short course_id (e.g. "COPILOT-STU").
 * Returns the full detail-response shape (see docs/api-domains.md)
 * or null if not found.
 *
 * IMPORTANT: upstream's `/public-course?_id=<objectId>` silently
 * ignores the parameter and returns all 73 courses unfiltered. Only
 * `course_id` filter works for fetching individual courses.
 * curl-verified 2026-04-23.
 */
export async function getCourseByCode(courseId) {
  if (!courseId) return null;
  const raw = await aiFetch(PATH, {
    params: { course_id: courseId },
    tags: [`course:${courseId}`],
  });
  const { items } = unwrap(raw);
  return items?.[0] ?? null;
}
