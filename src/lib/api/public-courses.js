/**
 * Public Courses adapter.
 *
 * Upstream path: TBD — curl-verify before first production use.
 * Integration guide mixes `/public-course` and `/public-courses` in examples.
 * Test both against live API, pin whichever returns 200 + data.
 *
 * curl -H "x-api-key: $AI_API_KEY" https://9exp-sec.com/api/ai/public-courses
 * curl -H "x-api-key: $AI_API_KEY" https://9exp-sec.com/api/ai/public-course
 */

import { aiFetch, unwrap } from './client';

// TODO(phase-2): curl-verify the correct path. Update PATH + stamp below.
// curl-verified: NOT YET
const PATH = '/public-courses';

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
