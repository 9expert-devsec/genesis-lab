/**
 * Promotions adapter.
 *
 * Upstream path: `/promotions` (plural — per integration guide summary).
 * curl-verified: 2026-05-04
 *
 * Filter params (verified against summary.filters in the response):
 *   includeExpired       — past-end_at promotions (default false)
 *   includeUnpublished   — is_published=false promotions (default false)
 *   includeScheduled     — start_at in the future (default false)
 *
 * Upstream defaults exclude all three; pass them all true to mirror the
 * full catalog into our cache and let admins curate via PromotionConfig
 * + Promotion.is_active.
 */

import { aiFetch, unwrap } from './client';

const PATH = '/promotions';

export async function listPromotions({
  includeExpired = false,
  includeUnpublished = false,
  includeScheduled = false,
} = {}) {
  const raw = await aiFetch(PATH, {
    tags: ['promotions'],
    params: {
      includeExpired:     includeExpired ? 'true' : undefined,
      includeUnpublished: includeUnpublished ? 'true' : undefined,
      includeScheduled:   includeScheduled ? 'true' : undefined,
    },
  });
  return unwrap(raw);
}
