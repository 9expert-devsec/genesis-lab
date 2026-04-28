import mongoose from 'mongoose';

/**
 * Admin-curated list of testimonials surfaced on the home page.
 *
 * Stores the external review `_id` (or `id`) only; the live review
 * payload (text, avatar, rating, ...) is fetched from
 * `https://reviews.9experttraining.com/api/public/reviews` at render
 * time via the reviews adapter.
 */
const featuredReviewSchema = new mongoose.Schema(
  {
    review_id:  { type: String, required: true, trim: true, unique: true },
    sort_order: { type: Number, default: 0 },
    active:     { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'featured_reviews' }
);

featuredReviewSchema.index({ active: 1, sort_order: 1 });

export const FeaturedReview =
  mongoose.models.FeaturedReview ||
  mongoose.model('FeaturedReview', featuredReviewSchema);

export default FeaturedReview;
