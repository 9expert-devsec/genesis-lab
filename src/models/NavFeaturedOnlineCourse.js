import mongoose from 'mongoose';

/**
 * Admin-curated 3-course showcase for the public navbar's
 * "หลักสูตรออนไลน์" dropdown.
 *
 * Mirrors `FeaturedOnlineCourse` (home page) but scoped to the navbar.
 * At most 3 active items are allowed — enforced in the create action.
 * We cache `course_name` / `course_cover_url` so the dropdown renders
 * without an upstream round-trip.
 */
const NavFeaturedOnlineCourseSchema = new mongoose.Schema(
  {
    course_id:        { type: String, required: true, trim: true, unique: true },
    course_name:      { type: String, required: true },
    course_cover_url: { type: String, default: '' },
    course_url:       { type: String, default: '' }, // Academy link — website_urls[0] from API
    sort_order:       { type: Number, default: 0 },
    active:           { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'nav_featured_online_courses' }
);

NavFeaturedOnlineCourseSchema.index({ active: 1, sort_order: 1 });

export const NavFeaturedOnlineCourse =
  mongoose.models.NavFeaturedOnlineCourse ||
  mongoose.model('NavFeaturedOnlineCourse', NavFeaturedOnlineCourseSchema);

export default NavFeaturedOnlineCourse;
