import mongoose from 'mongoose';

/**
 * NearbyPlace — one document per hotel/restaurant/cafe/bar near the
 * 9Expert Training office. Powers /restaurant-and-hotel-nearby-9expert-training.
 * Sorted by display_order asc, then distance asc.
 */
const NearbyPlaceSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['hotel', 'food', 'cafe', 'bar', 'drink'],
      required: true,
    },
    label:    { type: String, trim: true, default: '' },
    distance: { type: Number, required: true },
    walk:     { type: Number, required: true },
    detail:   { type: String, trim: true, default: '' },
    hours:    { type: String, trim: true, default: '-' },
    phone:    { type: String, trim: true, default: '-' },
    maps:     { type: String, trim: true, default: '' },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' },
    is_active:     { type: Boolean, default: true },
    display_order: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'nearby_places' }
);

NearbyPlaceSchema.index({ is_active: 1, display_order: 1, distance: 1 });

export default mongoose.models.NearbyPlace ||
  mongoose.model('NearbyPlace', NearbyPlaceSchema);