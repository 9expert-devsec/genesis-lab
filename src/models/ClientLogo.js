import mongoose from 'mongoose';

/**
 * ClientLogo — one document per company logo on /portfolio.
 * Fixed display size: 160 × 80 px (object-contain, bg white).
 * Sorted by display_order ascending, active only on public page.
 */
const ClientLogoSchema = new mongoose.Schema(
  {
    company_name:    { type: String, required: true, trim: true },
    image_url:       { type: String, required: true },
    image_public_id: { type: String, default: '' },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'client_logos' }
);

ClientLogoSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.ClientLogo ||
  mongoose.model('ClientLogo', ClientLogoSchema);
