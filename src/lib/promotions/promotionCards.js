/**
 * The /promotions grid's cards, as ONE pure function over the loaders' rows.
 *
 * Moved out of app/(public)/promotions/page.jsx (MCP round 4) so the MCP
 * `list_live_promotions` tool lists exactly the cards the page renders — same
 * loaders, same visibility gate, same slug resolution — instead of a second
 * reading of "which promotions are on". Pure: the caller does the I/O
 * (page.jsx, and lib/mcp/register.js `loadPromotionCards`).
 */
import {
  orderedPromotionCards, promotionPageToCard, selectVisiblePromotionPages,
} from '@/lib/pages/promotionMode';

// MSDB promotion → the same card view-model as promotionPageToCard. slug
// resolves via the config slugMap, falling back to the raw promotion_id.
export function cardFromMsdb(promotion, slugMap) {
  const slug = slugMap[promotion.promotion_id] || promotion.promotion_id;
  return {
    key: `msdb:${promotion.promotion_id}`,
    href: `/promotions/${slug}`,
    title: promotion.title,
    cover: promotion.thumbnail_url,
    alt: promotion.image_alt || promotion.title || '',
    start: promotion.start_date,
    end: promotion.end_date,
    source: 'msdb',
  };
}

/**
 * Read-time union (§6 — no collection is written).
 *
 * ── THE GENESIS HALF IS ONE BLOCK, SORTED ACROSS BOTH COLLECTIONS ────────
 * Builder promotions and Advanced HTML promotions INTERLEAVE on
 * `promotionOrder`. They are both Genesis-owned pages carrying the same
 * admin-controlled order field, so the admin arranges them himself rather than
 * the code deciding which collection outranks the other — a builder promo at
 * order 2 sits between two Advanced HTML promos at 1 and 3.
 *
 * That requires ONE `selectVisiblePromotionPages` call over the UNION. Each
 * loader already gates and sorts its own half, and sorting two sorted lists
 * separately then concatenating them is two blocks by construction, which is
 * exactly what this is not. The gate is idempotent, so re-running it over the
 * union costs a filter pass and buys one ordering.
 *
 * The `promotionSource` tag is attached HERE, where the two loaders are named,
 * and read back by `promotionPageToCard` — which takes the source as a
 * required argument because it namespaces the React key, and an `_id` is
 * unique within a collection but not across two.
 *
 * MSDB still follows as its own block. `promotionOrder` and MSDB
 * `display_order` are independent scales nobody has reconciled; see
 * orderedPromotionCards.
 *
 * @param {object} rows
 * @param {object[]} rows.promotions         getActivePromotions()
 * @param {object}   rows.slugMap            getSlugMap()
 * @param {object[]} rows.builderPromotions  getActiveBuilderPromotions()
 * @param {object[]} rows.customPromotions   getActiveCustomPagePromotions()
 */
export function buildPromotionCards({ promotions = [], slugMap = {}, builderPromotions = [], customPromotions = [] } = {}) {
  const genesisPages = [
    ...builderPromotions.map((p) => ({ ...p, promotionSource: 'builder' })),
    ...customPromotions.map((p) => ({ ...p, promotionSource: 'custom' })),
  ];
  return orderedPromotionCards(
    selectVisiblePromotionPages(genesisPages)
      .map((p) => promotionPageToCard(p, p.promotionSource)),
    promotions.map((p) => cardFromMsdb(p, slugMap)),
  );
}
