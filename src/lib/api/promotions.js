/**
 * Promotions adapter.
 *
 * Upstream path: `/promotions` (plural — per integration guide summary).
 * curl-verified: NOT YET
 */

import { aiFetch, unwrap } from './client';

const PATH = '/promotions';

export async function listPromotions() {
  const raw = await aiFetch(PATH, { tags: ['promotions'] });
  return unwrap(raw);
}
