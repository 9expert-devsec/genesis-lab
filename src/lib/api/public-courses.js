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
