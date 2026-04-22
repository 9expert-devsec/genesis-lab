/**
 * Promotions adapter.
 *
 * Upstream path: `/promotions` (plural — per integration guide summary).
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';

const PATH = '/promotions';

export async function listPromotions() {
  const raw = await aiFetch(PATH, { tags: ['promotions'] });
  return unwrap(raw);
}
