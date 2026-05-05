/**
 * Resolve a /promotions/[slug] URL segment to its Promotion + Config.
 *
 * Resolution order:
 *   1. PromotionConfig.url_slug — admin-set pretty URL.
 *   2. Promotion.promotion_id  — raw upstream `_id` (allows
 *      /promotions/692eb3f3... to keep working before any config is set).
 *
 * Returns { promotion, config } or null. `config` may be null even on
 * a successful resolve (id-fallback case where no config exists yet).
 */

import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export async function resolvePromotion(slug) {
  if (!slug) return null;
  await dbConnect();

  const config = await PromotionConfig.findOne({ url_slug: slug }).lean();
  if (config) {
    const promotion = await Promotion.findOne({
      promotion_id: config.promotion_id,
    }).lean();
    if (promotion) {
      return { promotion: serialize(promotion), config: serialize(config) };
    }
  }

  const promotion = await Promotion.findOne({ promotion_id: slug }).lean();
  if (!promotion) return null;

  const fallbackConfig = await PromotionConfig.findOne({
    promotion_id: promotion.promotion_id,
  }).lean();

  return {
    promotion: serialize(promotion),
    config: fallbackConfig ? serialize(fallbackConfig) : null,
  };
}
