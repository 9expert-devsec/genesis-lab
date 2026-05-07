import mongoose from 'mongoose';

/**
 * ContactVideo — single-doc store for the YouTube video shown on
 * /contact-us above the transport section. Only one row exists at
 * any time (upserted by saveContactVideo).
 *
 * If `youtube_url` is empty, the public page hides the section.
 */
const ContactVideoSchema = new mongoose.Schema(
  {
    youtube_url: { type: String, default: '' },
    title_th:    { type: String, default: '' },
    title_en:    { type: String, default: '' },
  },
  { timestamps: true, collection: 'contact_video' }
);

export default mongoose.models.ContactVideo ||
  mongoose.model('ContactVideo', ContactVideoSchema);
