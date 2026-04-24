import mongoose from 'mongoose';

/**
 * Admin-curated list of "คอร์สใหม่แนะนำ" for the home page.
 *
 * We only store the course short code; the live course data (name,
 * price, schedules, ...) is fetched from the upstream API at render
 * time. `course_name` / `course_cover_url` are cached here purely for
 * the admin list view so we don't need to round-trip upstream on every
 * admin render.
 */
const featuredCourseSchema = new mongoose.Schema(
  {
    course_id:        { type: String, required: true, trim: true, unique: true },
    course_name:      { type: String, required: true },
    course_cover_url: { type: String, default: '' },
    sort_order:       { type: Number, default: 0 },
    active:           { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'featured_courses' }
);

featuredCourseSchema.index({ active: 1, sort_order: 1 });

export const FeaturedCourse =
  mongoose.models.FeaturedCourse ||
  mongoose.model('FeaturedCourse', featuredCourseSchema);

export default FeaturedCourse;
