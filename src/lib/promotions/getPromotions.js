/**
 * Read-side helpers for the Promotion collection.
 *
 * All reads come from MongoDB — never the upstream API. The cron + admin
 * sync paths are responsible for keeping the collection fresh; everything
 * else (public list page, detail page, admin UI) reads here.
 */

import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';
import PageBuilder from '@/models/PageBuilder';
// The second Genesis-owned page type. ADDED beside the statements above rather
// than folded into any — the standing rule in this repo.
import CustomPage from '@/models/CustomPage';
import { selectVisiblePromotionPages } from '@/lib/pages/promotionMode';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Active promotions for the public list page.
 * Sorted ascending by display_order, then by start_date desc as tiebreaker
 * so identical orders show newest first.
 */
export async function getActivePromotions() {
  await dbConnect();
  const docs = await Promotion.find({ is_active: true })
    .sort({ display_order: 1, start_date: -1 })
    .lean();
  return serialize(docs);
}

/**
 * Genesis builder promotions for the public /promotions grid (promotion mode,
 * Phase 3). Read-only — NEVER touches the `promotions` collection (§6); the grid
 * unions this with getActivePromotions() at read time.
 *
 * Reads any promotion-type page in a potentially-visible status, then JS-gates
 * with the shared `isPubliclyVisible` (the date-window part can't be expressed in
 * the Mongo query alone — same pattern as resolveBuilderPageForRequest) and sorts
 * by promotionOrder. Returns raw pages; the grid maps them via
 * promotionPageToCard.
 */
export async function getActiveBuilderPromotions() {
  await dbConnect();
  const docs = await PageBuilder.find({
    pageType: 'promotion',
    status: { $in: ['published', 'scheduled'] },
  })
    // A PROJECTION, where there was none. This read had no .select() at all,
    // so it shipped whole page documents — every section body included — to
    // build a card of six fields, and it would have shipped the unpublished
    // `draft` by default the moment that field existed. Same precedent as
    // getPageBuilderPagesByPromotionIds.
    //
    // The list is exactly what the pipeline below reads, and nothing else:
    //   pageType                                    -> isPromotionPage
    //   status, publishStartDate, publishEndDate    -> isPubliclyVisible
    //   promotionOrder, createdAt                   -> the sort
    //   _id, slug, title, promotionCover            -> promotionPageToCard
    .select('slug title pageType status promotionOrder promotionCover publishStartDate publishEndDate createdAt')
    .lean();
  return serialize(selectVisiblePromotionPages(docs));
}

/**
 * Advanced HTML (CustomPage) promotions for the public /promotions grid. The
 * EXACT MIRROR of getActiveBuilderPromotions above — same prefilter, same JS
 * gate through the shared predicate, same sort, same projection discipline — so
 * the two halves of the Genesis block cannot be selected by two different rules.
 *
 * Read-only. NEVER touches the `promotions` collection.
 *
 * ── THE STATUS PREFILTER IS SHORTER, AND THAT IS THE MODEL'S DOING ────────
 * `CustomPage.status` is `enum: ['draft','published']` — there is no
 * `scheduled`, and no publishStartDate/publishEndDate either. So the query asks
 * for `published` alone, and `isPubliclyVisible` inside
 * selectVisiblePromotionPages reduces to exactly that for these documents (both
 * date windows read as null). The gate is not redundant: it is the SAME gate the
 * builder half runs, which is what keeps one rule over both collections.
 *
 * ── SAFE BY PROJECTION, NOT BY stripDraft ────────────────────────────────
 * There is deliberately no stripDraft() below. `draft` holds the whole content
 * surface — body included, and since promotion mode the unpublished
 * promotionCover too — and this read is safe because it asks for exactly the
 * fields the pipeline reads and no others. Widen the select and you are one
 * careless field away from putting an unpublished cover on the live grid.
 *
 * The list is exactly what the pipeline below reads, and nothing else:
 *   pageType, status                            -> isPromotionPage / isPubliclyVisible
 *   promotionOrder, createdAt                   -> the sort
 *   _id, slug, title, promotionCover            -> promotionPageToCard
 *
 * This read is registered in test/fs/draftVisibilityWiring's CUSTOM_PAGE_READS
 * sweep, which enumerates BOTH this module and lib/actions/customPages.js — an
 * unregistered CustomPage read is the projection-safe-by-luck failure that sweep
 * exists to catch, and living in a different file is not an exemption from it.
 */
export async function getActiveCustomPagePromotions() {
  await dbConnect();
  const docs = await CustomPage.find({
    pageType: 'promotion',
    status: 'published',
  })
    .select('slug title pageType status promotionOrder promotionCover createdAt')
    .lean();
  return serialize(selectVisiblePromotionPages(docs));
}

/**
 * All promotions (admin list).
 */
export async function getAllPromotions() {
  await dbConnect();
  const docs = await Promotion.find({})
    .sort({ display_order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}

/**
 * Resolve url_slug → Promotion via PromotionConfig join.
 * Returns null if no config has this slug, even if a Promotion with
 * promotion_id === slug exists. Use the slug-first/id-fallback resolver
 * (resolvePromotion.js) when you also need that fallback.
 */
export async function getPromotionBySlug(slug) {
  if (!slug) return null;
  await dbConnect();
  const config = await PromotionConfig.findOne({ url_slug: slug }).lean();
  if (!config) return null;
  const promotion = await Promotion.findOne({
    promotion_id: config.promotion_id,
  }).lean();
  if (!promotion) return null;
  return { promotion: serialize(promotion), config: serialize(config) };
}

/**
 * Single promotion by upstream `_id` value (admin / fallback).
 */
export async function getPromotionById(promotionId) {
  if (!promotionId) return null;
  await dbConnect();
  const doc = await Promotion.findOne({ promotion_id: promotionId }).lean();
  return serialize(doc);
}

/**
 * Map promotion_id → url_slug for batch lookups (used by the public
 * list page to build links without an N+1 query).
 */
export async function getSlugMap() {
  await dbConnect();
  const configs = await PromotionConfig.find({
    url_slug: { $ne: null },
  })
    .select('promotion_id url_slug')
    .lean();
  const map = {};
  for (const c of configs) {
    if (c.url_slug) map[c.promotion_id] = c.url_slug;
  }
  return map;
}

/**
 * All configs keyed by promotion_id (admin list join).
 */
export async function getAllConfigs() {
  await dbConnect();
  const configs = await PromotionConfig.find({}).lean();
  const map = {};
  for (const c of configs) {
    map[c.promotion_id] = serialize(c);
  }
  return map;
}
