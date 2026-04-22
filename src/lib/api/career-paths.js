/**
 * Career Paths adapter.
 *
 * Upstream path: `/career-path` (singular — confirmed by integration guide).
 * curl-verified: NOT YET
 */

import { aiFetch, unwrap } from './client';

const PATH = '/career-path';

/**
 * List career paths.
 *
 * @param {object} opts
 * @param {number} opts.limit   — default upstream = 20; bump for full list
 * @param {string} opts.q       — search query
 * @param {'active'|'all'} opts.status — default 'active'
 */
export async function listCareerPaths({ limit = 50, q, status } = {}) {
  const raw = await aiFetch(PATH, {
    params: { limit, q, status },
    tags: ['career-paths'],
  });
  return unwrap(raw);
}

/**
 * Fetch a single career path by slug.
 */
export async function getCareerPath(slug) {
  const raw = await aiFetch(PATH, {
    params: { slug },
    tags: [`career-path:${slug}`],
  });
  const { items } = unwrap(raw);
  return items[0] ?? null;
}
