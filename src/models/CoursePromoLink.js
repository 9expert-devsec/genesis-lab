import mongoose from 'mongoose';

/**
 * CoursePromoLink — links a Promotion to a specific course.
 * One doc per (promotion_id + course_id) pair.
 * schedule_ids[] = upstream schedule _id values that are part of this promo.
 * Empty array = promo applies to all schedules of this course.
 */
const CoursePromoLinkSchema = new mongoose.Schema(
  {
    course_id:    { type: String, required: true, trim: true },   // upstream course_id e.g. "MSE-L5"
    promotion_id: { type: String, required: true, trim: true },   // FK → Promotion.promotion_id
    schedule_ids: { type: [String], default: [] },                // upstream schedule _id values
    is_active:    { type: Boolean, default: true },
    display_order:{ type: Number,  default: 0 },
  },
  { timestamps: true, collection: 'course_promo_links' }
);

CoursePromoLinkSchema.index({ course_id: 1, display_order: 1 });
CoursePromoLinkSchema.index({ course_id: 1, promotion_id: 1 }, { unique: true });

export default mongoose.models.CoursePromoLink ||
  mongoose.model('CoursePromoLink', CoursePromoLinkSchema);
