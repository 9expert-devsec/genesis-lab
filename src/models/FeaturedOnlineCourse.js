import mongoose from 'mongoose';

/**
 * Admin-curated list of "คอร์สออนไลน์แนะนำ" surfaced on the home page.
 *
 * Mirrors `FeaturedCourse` for online courses from the `/online-course`
 * upstream feed. We store the trimmed `o_course_id` plus a cached name
 * and cover so the admin list can render without a round-trip.
 */
const featuredOnlineCourseSchema = new mongoose.Schema(
  {
    course_id:        { type: String, required: true, trim: true, unique: true },
    course_name:      { type: String, required: true },
    course_cover_url: { type: String, default: '' },
    sort_order:       { type: Number, default: 0 },
    active:           { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'featured_online_courses' }
);

featuredOnlineCourseSchema.index({ active: 1, sort_order: 1 });

export const FeaturedOnlineCourse =
  mongoose.models.FeaturedOnlineCourse ||
  mongoose.model('FeaturedOnlineCourse', featuredOnlineCourseSchema);

export default FeaturedOnlineCourse;
