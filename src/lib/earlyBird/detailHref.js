import { resolveOwner } from '@/lib/earlyBird/ownership';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The ONLY sanctioned way to build a link to a Genesis page:
// a promotion page is diverted off its bare slug (`/<slug>` answers 308) and
// only `/promotions/<slug>` renders it, and the helper also refuses a page
// outside its publish window.
import { publicPageHref } from '@/lib/pages/promotionMode';
// ADDED beside the statements above rather than folded into any. `external_url`
// is free text on an MSDB row and reaches an `href`, so it goes through the
// same allowlist every other untrusted URL in this repo does.
import { safeUrl } from '@/lib/pageBuilder/safeUrl';

/**
 * Where the Early Bird banner's "ดูรายละเอียด" goes — or `null` for no link.
 *
 * ── THE PRECEDENCE IS NOT INVENTED HERE ─────────────────────────────────
 * It is `resolveOwner`'s, imported. A row can carry BOTH `owner_page_id` and
 * `promotion_id` — that is exactly what adopting a released legacy row produces
 * — and ownership.js reads the page FIRST and says at length why: reading them
 * the other way round would make an adopted row answer "legacy", and the page
 * that owns the row would be refused its own row. A second precedence spelled
 * out here would be that same bug, in a second place, disagreeing silently.
 *
 * So this module contributes no ordering of its own. It maps each OWNER STATE
 * to a URL, and the states come from the module that defines them.
 *
 * ── A PAGE OWNER WINS OUTRIGHT, INCLUDING WHEN IT YIELDS NOTHING ────────
 * The subtle case, and it is decided rather than fallen into. When a page owns
 * the row and `publicPageHref` refuses it — no slug, or outside its publish
 * window — the answer is `null`. It does NOT fall through to a legacy
 * `promotion_id` the row may still carry.
 *
 * Falling through would mean an expired promotion PAGE quietly redirecting
 * customers to a different promotion, chosen by a field the author stopped
 * using. "The page wins" has to mean it wins when the answer is inconvenient,
 * or it is not a precedence, it is a preference.
 *
 * ── NO TARGET MEANS NO LINK ─────────────────────────────────────────────
 * Never a disabled control, and never a link back to the course page the
 * banner is already on. A dead or self-referential link spends a customer's
 * click before failing, which is worse than an absence they never notice. This
 * is the same rule the bundle reader shipped last round: a row whose href is
 * null is dropped, not rendered hrefless.
 *
 * Pure — no DB, no models, no React. The owner PAGE and the joined promotion
 * are fetched by the caller and passed in, so the whole decision is testable
 * without either.
 */

/**
 * The MSDB fallback, for a row no Genesis page owns.
 *
 * ── THE ON-SITE DETAIL FIRST, MIRRORING THE ONE EXISTING BUILDER ────────
 * `CoursePromoSection`'s row builds `/promotions/${api_slug || promotion_id}`,
 * and both halves resolve: promotionMode.js records that the route matches a
 * lowercase segment against `PromotionConfig.url_slug` AND a raw
 * `Promotion.promotion_id`. This mirrors that expression rather than inventing
 * a second answer for the same question — the two links appear on the same
 * page and must not disagree about where one promotion lives.
 *
 * `external_url` is LAST and is the only off-site outcome. It is free text on
 * an MSDB row, so it goes through `safeUrl`, which is the allowlist
 * (http/https/mailto/tel and same-origin relative) the rich-text walker and the
 * cta buttons already use. A `javascript:` in that column must not become an
 * href here just because nothing else was set.
 */
function legacyPromotionHref(promotion) {
  const slug = String(promotion?.api_slug ?? '').trim();
  if (slug) return `/promotions/${slug}`;
  const id = String(promotion?.promotion_id ?? '').trim();
  if (id) return `/promotions/${id}`;
  return safeUrl(promotion?.external_url) || null;
}

/**
 * @param {object|null} earlyBird the EarlyBirdConfig row, with `ownerPage` and
 *   `promotion` joined by the caller (either may be null)
 * @param {number} [now] injected clock, as `publicPageHref` takes one
 * @returns {string|null} the href, or null when there is no honest one
 */
export function earlyBirdDetailHref(earlyBird, now = Date.now()) {
  switch (resolveOwner(earlyBird)) {
    case 'page_owned':
      // `publicPageHref(null)` is already null — an owner id that no longer
      // resolves (the page was deleted) needs no branch of its own.
      return publicPageHref(earlyBird?.ownerPage, now);
    case 'legacy_owned':
      return legacyPromotionHref(earlyBird?.promotion);
    default:
      // `free` (no row) and `unowned` (a row nobody holds). Neither names a
      // promotion, so neither has a detail page to point at.
      return null;
  }
}
