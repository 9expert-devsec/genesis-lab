import mongoose from 'mongoose';

/**
 * TransportCard — one document per "how to get here" card on
 * /contact-us. Each card has bilingual title/description and an
 * optional map image. Sorted by display_order ascending on the
 * public page; admin can drag to reorder.
 *
 * description_th / description_en accept multi-line text. The public
 * component splits on \n and renders each line as a list item, the
 * same way the legacy MapSection.TABS structure does.
 */
const TransportCardSchema = new mongoose.Schema(
  {
    title_th:        { type: String, required: true, trim: true },
    title_en:        { type: String, default: '', trim: true },
    description_th:  { type: String, default: '' },
    description_en:  { type: String, default: '' },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    icon_name:       { type: String, default: 'MapPin' },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'transport_cards' }
);

TransportCardSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.TransportCard ||
  mongoose.model('TransportCard', TransportCardSchema);
