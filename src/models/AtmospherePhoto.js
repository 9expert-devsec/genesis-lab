import mongoose from 'mongoose';

/**
 * AtmospherePhoto — one document per training atmosphere photo on /portfolio.
 * Fixed display size: 400 × 300 px (object-cover).
 * Sorted by display_order ascending, active only on public page.
 */
const AtmospherePhotoSchema = new mongoose.Schema(
  {
    caption_th:      { type: String, default: '', trim: true },
    image_url:       { type: String, required: true },
    image_public_id: { type: String, default: '' },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'atmosphere_photos' }
);

AtmospherePhotoSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.AtmospherePhoto ||
  mongoose.model('AtmospherePhoto', AtmospherePhotoSchema);
