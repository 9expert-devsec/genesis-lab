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
