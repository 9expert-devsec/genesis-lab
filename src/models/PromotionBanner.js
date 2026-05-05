import mongoose from 'mongoose';

/**
 * PromotionBanner — one document per slide of the carousel above the
 * /promotions list. Multiple active rows are allowed; the public page
 * sorts them by `display_order` ascending.
 */
const PromotionBannerSchema = new mongoose.Schema(
  {
    image_url:       { type: String, required: true },
    image_public_id: { type: String, default: '' },
    alt_text:        { type: String, default: '' },
    link_url:        { type: String, default: '' },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'promotion_banners' }
);

PromotionBannerSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.PromotionBanner ||
  mongoose.model('PromotionBanner', PromotionBannerSchema);
