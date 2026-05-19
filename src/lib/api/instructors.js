/**
 * Instructors adapter.
 *
 * Upstream path: `/instructors` — same canonical envelope shape as the
 * other domains.
 */

import { aiFetch, unwrap } from './client';

const PATH = '/instructors';

export async function listInstructors() {
  const raw = await aiFetch(PATH, { tags: ['instructors'] });
  return unwrap(raw);
}
