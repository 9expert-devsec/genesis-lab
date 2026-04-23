/**
 * Skills adapter.
 * Upstream path: `/skills` — canonical envelope.
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/skills';

export async function listSkills() {
  const raw = await aiFetch(PATH, { tags: ['skills'] });
  return unwrap(raw);
}

/**
 * Fetch a single skill by its upstream _id.
 */
export async function getSkillById(id) {
  const { items } = await listSkills();
  return items.find((s) => s._id === id) ?? null;
}
