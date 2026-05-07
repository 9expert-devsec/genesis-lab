import mongoose from 'mongoose';

/**
 * TransportMap — single-doc store for the map image shown on
 * /contact-us above MapSection. Only one row exists at any time
 * (upserted by saveTransportMap).
 *
 * If `image_url` is empty, the public page hides the section.
 * `caption_th` is optional supporting text shown below the image.
 */
const TransportMapSchema = new mongoose.Schema(
  {
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    caption_th:      { type: String, default: '' },
  },
  { timestamps: true, collection: 'transport_map' }
);

export default mongoose.models.TransportMap ||
  mongoose.model('TransportMap', TransportMapSchema);
