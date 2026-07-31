/**
 * Promotion-mode discriminator (Phase 1) + detail-route precedence (Phase 2).
 *
 * A builder page with `pageType === 'promotion'` is one of TWO kinds, told apart
 * by `promotionId`:
 *   - STANDALONE (Genesis-originated) — `promotionId` empty. It owns its own card
 *     in the Phase-3 /promotions grid and its own /promotions/<slug> detail.
 *   - LINKED (MSDB-anchored)          — `promotionId` set. It is the builder-
 *     authored detail for an existing MSDB Promotion; the MSDB row owns the card.
 *
 * Pure — depends only on the client-safe `isPubliclyVisible` predicate (no DB, no
 * models), so the editor, the routes, the actions, and the gated unit tier can all
 * import it. ONE definition, so the two kinds — and the detail-route precedence —
 * can never be decided two different ways.
 */
import { isPubliclyVisible } from './visibility';

export function isPromotionPage(page) {
  return page?.pageType === 'promotion';
}

/** A promotion page with NO MSDB link → Genesis-originated / standalone. */
export function isStandalonePromotion(page) {
  return isPromotionPage(page) && !String(page?.promotionId ?? '').trim();
}

/** A promotion page linked to an MSDB Promotion.promotion_id. */
export function isLinkedPromotion(page) {
  return isPromotionPage(page) && String(page?.promotionId ?? '').trim() !== '';
}

/**
 * Does `slug` collide with an MSDB promotion's public identifier? The pure core
 * of the promotion slug guard (checkPromotionSlugAvailable does the DB read and
 * delegates here, so the matching rule is tested without a DB — the same pure /
 * impure split as resolveSectionRefs). Case-normalised to match the route, which
 * resolves a lowercase segment against `PromotionConfig.url_slug` and raw
 * `Promotion.promotion_id`.
 */
export function slugMatchesPromotion(slug, { urlSlugs = [], promotionIds = [] } = {}) {
  const key = String(slug ?? '').trim().toLowerCase();
  if (!key) return false;
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  return urlSlugs.some((u) => norm(u) === key) || promotionIds.some((p) => norm(p) === key);
}

/**
 * Should `/promotions/<slug>` render THIS builder page (Phase 2)? True only for a
 * promotion-type page that is publicly visible right now — so an expired or
 * unpublished promotion page falls through to a 404, exactly as its bare-slug
 * render would have. Reuses the ONE shared visibility predicate; no second copy.
 * This is also the bare-slug REDIRECT predicate's promotion half (isPromotionPage)
 * — a promotion page is diverted off `/<slug>` regardless of visibility.
 */
export function shouldRenderBuilderPromotion(page, now = Date.now()) {
  return isPromotionPage(page) && isPubliclyVisible(page, now);
}

/**
 * The detail-route precedence, as one pure decision: 'builder' | 'msdb' |
 * 'notfound'. Builder-FIRST (a visible promotion-type builder page wins), else the
 * MSDB resolve (html_content), else 404. `msdbResolved` is the truthy result of
 * resolvePromotion (or null). Builder-first is deliberate and deterministic: the
 * Phase-1 slug guard rejects a promotion builder slug that collides with a
 * PromotionConfig.url_slug / Promotion.promotion_id, so at most one source matches
 * a slug; the order only decides a hand-seeded doc that bypassed the guard.
 */
export function promotionDetailTarget(builderPage, msdbResolved, now = Date.now()) {
  if (shouldRenderBuilderPromotion(builderPage, now)) return 'builder';
  if (msdbResolved) return 'msdb';
  return 'notfound';
}

// ── Phase 3: the /promotions grid union ─────────────────────────────────────

/**
 * From a raw set of builder pages, keep the ones that belong on the /promotions
 * grid — promotion-type AND publicly visible right now (the shared predicate; an
 * expired/unpublished one is dropped, and its detail 404s per Phase 2, so a
 * visible card always implies a live detail) — sorted by `promotionOrder` asc,
 * `createdAt` desc as the stable tiebreak (matching getAllPromotions' habit).
 * Pure — the DB find lives in the loader, the gate+sort is tested here.
 */
export function selectVisiblePromotionPages(pages, now = Date.now()) {
  return (Array.isArray(pages) ? pages : [])
    .filter((p) => isPromotionPage(p) && isPubliclyVisible(p, now))
    .sort((a, b) => {
      const order = (Number(a?.promotionOrder) || 0) - (Number(b?.promotionOrder) || 0);
      if (order !== 0) return order;
      return new Date(b?.createdAt ?? 0).getTime() - new Date(a?.createdAt ?? 0).getTime();
    });
}

/**
 * Adapt a builder promotion page to the SAME card view-model an MSDB promotion
 * maps to, so ONE `PromotionCard` renders both. The link is `/promotions/<slug>`
 * (its Phase-2 home), NOT the bare slug. Cover is the Phase-1 `promotionCover`
 * upload; empty falls to the card's existing "ไม่มีภาพปก" placeholder (parity with
 * MSDB — no invented seo.ogImage fallback). Dates feed the grid's shared
 * `dateRangeLabel`. Pure.
 */
export function builderPromotionToCard(page) {
  return {
    key: `builder:${page?._id ?? page?.slug ?? ''}`,
    href: `/promotions/${page?.slug ?? ''}`,
    title: page?.title ?? '',
    cover: page?.promotionCover ?? '',
    alt: page?.title ?? '',
    start: page?.publishStartDate ?? null,
    end: page?.publishEndDate ?? null,
    source: 'builder',
  };
}

/**
 * The grid order: builder promotions as ONE block BEFORE the MSDB promotions.
 * This is a deliberate v1 — the two sources are NOT interleaved by a shared key.
 * A unified cross-source ordering (one scale spanning `promotionOrder` and MSDB
 * `display_order`) is future work; block-first keeps Genesis-authored promos
 * prominent without inventing a merged sort nobody has specced.
 */
export function orderedPromotionCards(builderCards, msdbCards) {
  return [...(builderCards ?? []), ...(msdbCards ?? [])];
}
