/**
 * Promotion-mode discriminator + detail-route precedence + the /promotions grid
 * union. THE SHARED promotion vocabulary for BOTH Genesis-owned page types.
 *
 * ── WHY IT LIVES IN lib/pages/ AND NOT lib/pageBuilder/ ────────────────────
 * It was written for the Page Builder and named for it. It is now read by the
 * Advanced HTML (CustomPage) surfaces too — the actions, the grid loader, the
 * settings dialog — and a CustomPage file importing its promotion vocabulary
 * from `@/lib/pageBuilder/*` is a lie about ownership that the next reader has
 * to disprove. Moved for exactly the reason lib/pages/draftState.js,
 * lib/pages/slugGuard.js and lib/pages/customPageDraft.js live here: a concern
 * both page types own belongs in neither one's folder.
 *
 * A "promotion page" here is a document of EITHER collection with
 * `pageType === 'promotion'`:
 *
 *   PageBuilder — sections-composed. TWO kinds, told apart by `promotionId`:
 *     STANDALONE (Genesis-originated) — `promotionId` empty. It owns its own
 *       card in the /promotions grid and its own /promotions/<slug> detail.
 *     LINKED (MSDB-anchored) — `promotionId` set. It is the builder-authored
 *       detail for an existing MSDB Promotion.
 *   CustomPage — one raw HTML body. ALWAYS standalone: it has no `promotionId`
 *     field at all, deliberately. lib/schemas/customPage.js states the reason
 *     and what would have to change before a linked one could exist.
 *
 * Pure — depends only on the client-safe `isPubliclyVisible` predicate (no DB,
 * no models), so the editors, the routes, the actions, and the gated unit tier
 * can all import it. ONE definition, so the kinds — and the detail-route
 * precedence — can never be decided two different ways.
 *
 * `isPubliclyVisible` transfers to a CustomPage unchanged, and that is a
 * property of the predicate rather than a coincidence: a CustomPage carries no
 * publishStartDate / publishEndDate, so both windows read as null and the
 * predicate reduces to `status === 'published'` — which is exactly the whole of
 * a CustomPage's visibility rule. No second predicate, no per-collection case.
 */
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';

export function isPromotionPage(page) {
  return page?.pageType === 'promotion';
}

/**
 * A promotion page with NO MSDB link → Genesis-originated / standalone.
 * A CustomPage promotion carries no `promotionId` field, so it is always
 * standalone by this rule — the same answer its schema gives, reached the same
 * way rather than by a second collection-specific branch.
 */
export function isStandalonePromotion(page) {
  return isPromotionPage(page) && !String(page?.promotionId ?? '').trim();
}

/** A promotion page linked to an MSDB Promotion.promotion_id. Builder only. */
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
 * Should `/promotions/<slug>` render THIS page? True only for a promotion-type
 * page that is publicly visible right now — so an expired or unpublished
 * promotion page falls through to a 404, exactly as its bare-slug render would
 * have. Reuses the ONE shared visibility predicate; no second copy.
 *
 * This is also the bare-slug REDIRECT predicate's promotion half
 * (isPromotionPage) — a promotion page is diverted off `/<slug>` regardless of
 * visibility.
 *
 * COLLECTION-AGNOSTIC: it reads `pageType` plus the visibility fields and
 * nothing else, so a PageBuilder page and a CustomPage get the same answer out
 * of the same code. Named for what it decides, not for who asks — it was
 * `shouldRenderBuilderPromotion` while only the builder called it, and a name
 * asserting builder-ness over a CustomPage argument is a stale premise with a
 * short fuse.
 */
export function shouldRenderPromotionPage(page, now = Date.now()) {
  return isPromotionPage(page) && isPubliclyVisible(page, now);
}

/**
 * The detail-route precedence for `/promotions/<slug>`, as ONE pure decision:
 * 'builder' | 'custom' | 'msdb' | 'notfound'.
 *
 * Builder page first, then Advanced HTML page, then the MSDB resolve
 * (html_content), else 404. `msdbResolved` is the truthy result of
 * resolvePromotion (or null).
 *
 * ── THE ORDER IS DETERMINISM, NOT A TIEBREAK ──────────────────────────────
 * At most one source can match a slug. checkSlugAvailable rejects a slug held by
 * the other page collection (live slugs and slugHistory both), and
 * checkPromotionSlugAvailable rejects one that collides with a
 * PromotionConfig.url_slug or a raw Promotion.promotion_id — and since promotion
 * mode landed on CustomPage, BOTH collections call BOTH guards. So this order
 * only decides a hand-seeded document that bypassed them; it is fixed so that
 * two such documents cannot render differently on two requests.
 *
 * A page that is promotion-type but NOT publicly visible (unpublished, or a
 * builder page outside its window) falls THROUGH rather than 404-ing here, and
 * that is deliberate: its slug will not resolve in MSDB either, so it 404s at
 * the end — matching what its bare-slug render would have done, which the grid
 * relies on for "a visible card always implies a live detail".
 *
 * THE ROUTE CALLS THIS. It used to inline `shouldRenderPromotionPage` twice
 * while this function sat exported, documented, tested and called by nothing —
 * a precedence living in two places, which is the next stale premise waiting to
 * happen. One decision, one definition, one caller shape.
 */
export function promotionDetailTarget(builderPage, customPage, msdbResolved, now = Date.now()) {
  if (shouldRenderPromotionPage(builderPage, now)) return 'builder';
  if (shouldRenderPromotionPage(customPage, now)) return 'custom';
  if (msdbResolved) return 'msdb';
  return 'notfound';
}

// ── The /promotions grid union ──────────────────────────────────────────────

/**
 * From a raw set of pages, keep the ones that belong on the /promotions grid —
 * promotion-type AND publicly visible right now (the shared predicate; an
 * expired/unpublished one is dropped, and its detail 404s, so a visible card
 * always implies a live detail) — sorted by `promotionOrder` asc, `createdAt`
 * desc as the stable tiebreak (matching getAllPromotions' habit).
 *
 * COLLECTION-AGNOSTIC BY CONSTRUCTION, and that is what lets ONE call sort the
 * whole Genesis half of the grid rather than producing a block per collection.
 * It reads pageType, the visibility fields, promotionOrder and createdAt — every
 * one of which both page types carry.
 *
 * Pure — the DB finds live in the loaders, the gate+sort is tested here.
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
 * Adapt a Genesis promotion page to the SAME card view-model an MSDB promotion
 * maps to, so ONE `PromotionCard` renders every source. The link is
 * `/promotions/<slug>` (its detail home), NOT the bare slug. Cover is the
 * `promotionCover` upload; empty falls to the card's existing "ไม่มีภาพปก"
 * placeholder (parity with MSDB — no invented seo.ogImage fallback). Dates feed
 * the grid's shared `dateRangeLabel`; a CustomPage has no publish window, so its
 * card carries no date pill rather than an invented one. Pure.
 *
 * ── `source` IS REQUIRED, WITH NO DEFAULT, ON PURPOSE ──────────────────────
 * It is the card `key`'s namespace. An `_id` is unique WITHIN a collection and
 * nothing makes it unique across two, so a defaulted prefix is how two different
 * pages quietly collapse into one React key. The caller always knows which
 * loader a page came from; making it say so costs a word and removes the
 * failure.
 */
export function promotionPageToCard(page, source) {
  return {
    key: `${source}:${page?._id ?? page?.slug ?? ''}`,
    href: `/promotions/${page?.slug ?? ''}`,
    title: page?.title ?? '',
    cover: page?.promotionCover ?? '',
    alt: page?.title ?? '',
    start: page?.publishStartDate ?? null,
    end: page?.publishEndDate ?? null,
    source,
  };
}

/**
 * The grid order: the GENESIS-owned promotions as ONE block BEFORE the MSDB
 * promotions.
 *
 * TWO ARGUMENTS, AND WHAT EACH ONE HOLDS. The first is every Genesis-owned card
 * — builder pages and Advanced HTML pages TOGETHER, already interleaved and
 * sorted on `promotionOrder` by ONE `selectVisiblePromotionPages` call over the
 * union of both collections. They interleave because both are Genesis-owned
 * pages with the same admin-controlled order field, so the admin arranges them
 * himself rather than the code deciding which collection outranks the other. The
 * second is the MSDB cards.
 *
 * THE BLOCK BOUNDARY IS THE PART THAT IS STILL DELIBERATE, and it is the only
 * ordering claim left in this function. Genesis-owned and MSDB promotions are
 * NOT interleaved with each other: `promotionOrder` and MSDB `display_order` are
 * two independent scales nobody has reconciled, and merging them would invent an
 * ordering rather than express one. Block-first keeps Genesis-authored promos
 * prominent without that invention.
 */
export function orderedPromotionCards(genesisCards, msdbCards) {
  return [...(genesisCards ?? []), ...(msdbCards ?? [])];
}
