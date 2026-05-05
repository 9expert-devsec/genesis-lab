import mongoose from 'mongoose';

/**
 * PromotionConfig — admin-managed pretty-URL + SEO layer for the
 * public /promotions/[slug] route. Mirrors ProgramPageConfig.
 *
 * `promotion_id` is the FK to Promotion.promotion_id (which itself
 * comes from the upstream `_id`). The resolver in resolvePromotion.js
 * accepts either url_slug or the raw promotion_id as the URL segment.
 */
const PromotionConfigSchema = new mongoose.Schema(
  {
    promotion_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    url_slug: { type: String, default: null, trim: true },

    meta_title:       { type: String, default: '' },
    meta_description: { type: String, default: '' },
    og_image_url:     { type: String, default: '' },
  },
  { timestamps: true, collection: 'promotion_configs' }
);

// Empty-string url_slug would clash on the unique sparse index; coerce
// to null so the index just ignores the row.
PromotionConfigSchema.pre('save', function preSave(next) {
  if (typeof this.url_slug === 'string' && this.url_slug.trim() === '') {
    this.url_slug = null;
  }
  next();
});

PromotionConfigSchema.index({ url_slug: 1 }, { sparse: true });

export default mongoose.models.PromotionConfig ||
  mongoose.model('PromotionConfig', PromotionConfigSchema);
