/**
 * Cross-collection slug availability guard.
 *
 * A builder page (PageBuilder) and an advanced-HTML page (CustomPage) share
 * the SAME public slug namespace, so a slug is only free if it collides with
 * NEITHER collection — including each collection's `slugHistory`, because a
 * retired slug may still have a live 301 pointing at it and must not be
 * reclaimed by the other type. The check is bidirectional (both action files
 * call it) and case-normalised, and it excludes the doc being updated so a
 * page can be re-saved without colliding with itself.
 *
 * Server-only: imports both mongoose models. Callers must have an active
 * connection (they `await dbConnect()` first).
 */

import PageBuilder from '@/models/PageBuilder';
import CustomPage from '@/models/CustomPage';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';
import { isReservedSlug } from '@/lib/pages/reservedSlugs';
import { slugMatchesPromotion } from '@/lib/pages/promotionMode';

/**
 * @param {string} slug
 * @param {{ excludeBuilderId?: string, excludeCustomId?: string }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function checkSlugAvailable(slug, opts = {}) {
  const key = String(slug ?? '').trim().toLowerCase();
  if (!key) return { ok: false, error: 'กรุณาระบุ slug' };
  if (isReservedSlug(key)) return { ok: false, error: 'slug นี้เป็นเส้นทางระบบ ใช้ไม่ได้' };

  const builderFilter = { $or: [{ slug: key }, { slugHistory: key }] };
  if (opts.excludeBuilderId) builderFilter._id = { $ne: opts.excludeBuilderId };

  const customFilter = { $or: [{ slug: key }, { slugHistory: key }] };
  if (opts.excludeCustomId) customFilter._id = { $ne: opts.excludeCustomId };

  const [builderHit, customHit] = await Promise.all([
    PageBuilder.exists(builderFilter),
    CustomPage.exists(customFilter),
  ]);

  if (builderHit || customHit) return { ok: false, error: 'Slug นี้ถูกใช้แล้ว' };
  return { ok: true };
}

/**
 * EXTRA slug guard for a PROMOTION-type page, of EITHER collection.
 *
 * A Genesis promotion owns `/promotions/<slug>`, a namespace the shared
 * `checkSlugAvailable` guard does not cover. That URL is also how an MSDB
 * promotion resolves — via `PromotionConfig.url_slug` (the admin pretty-URL) or a
 * raw `Promotion.promotion_id` (the id-fallback, see resolvePromotion.js). So a
 * promotion page's slug must additionally not collide with either, or two sources
 * would claim one `/promotions/<slug>`.
 *
 * ── SIX CALLERS, ACROSS TWO COLLECTIONS ───────────────────────────────────
 * Three in lib/actions/pageBuilder.js and three in lib/actions/customPages.js.
 * It was builder-only when written; an Advanced HTML page can now be a promotion
 * too, and it reaches the same URL by the same route, so it is checked by the
 * same guard rather than by a second one that could disagree.
 *
 * SCOPED, AND ON THE SUBMITTED TYPE: every caller invokes this ONLY when the
 * pageType being SAVED is `'promotion'` — not the stored one. That is deliberate
 * and it is what catches a page which becomes a promotion under a slug it
 * already had: the flipping save carries the new type, so the guard runs on it
 * even though the slug is unchanged. Non-promotion pages are unaffected.
 *
 * READ-ONLY against both collections —
 * `PromotionConfig` is frozen legacy (slated for retirement); this adds no write
 * coupling, only defensive reads. Slugs are lowercase kebab (schema-enforced) and
 * Next paths are case-sensitive, so an exact lowercase match mirrors how the route
 * actually resolves the segment.
 *
 * @param {string} slug
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function checkPromotionSlugAvailable(slug) {
  const key = String(slug ?? '').trim().toLowerCase();
  if (!key) return { ok: false, error: 'กรุณาระบุ slug' };

  // Fetch the two identifier lists and delegate the match to the pure rule
  // (slugMatchesPromotion) so the collision semantics are unit-tested without a
  // DB. Admin save path, infrequent; both lists are small.
  const [urlSlugs, promotionIds] = await Promise.all([
    PromotionConfig.distinct('url_slug'),
    Promotion.distinct('promotion_id'),
  ]);

  if (slugMatchesPromotion(key, { urlSlugs, promotionIds })) {
    return { ok: false, error: 'Slug นี้ชนกับโปรโมชันใน MSDB — ใช้ไม่ได้' };
  }
  return { ok: true };
}
