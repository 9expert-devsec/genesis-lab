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
    /**
     * Opt this logo OUT of the dark-mode white knockout.
     *
     * The wall renders every logo as a pure white silhouette in dark mode
     * (brightness(0) invert). That is correct for a wordmark, but it erases
     * any ENCLOSED counter-form — the gold tree inside SCB purple square,
     * the '9' inside Praram 9 teal block — leaving a featureless blob.
     * Those logos render in original colour instead.
     *
     * Data, not a name list in the JSX: a hardcoded array breaks silently
     * the first time a company is renamed.
     */
    keepColorOnDark: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'client_logos' }
);

ClientLogoSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.ClientLogo ||
  mongoose.model('ClientLogo', ClientLogoSchema);
