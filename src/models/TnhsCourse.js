import mongoose from 'mongoose';

/**
 * Admin-managed list of TNHS courses surfaced in the public navbar's
 * "TNHS" dropdown.
 *
 * Each row links out to the TNHS website (`external_url`). The cover is
 * a Cloudinary URL pasted by the admin (no in-app upload). Sorting and
 * visibility are admin-controlled via `sort_order` / `is_active`.
 */
const TnhsCourseSchema = new mongoose.Schema(
  {
    course_name:  { type: String, required: true, trim: true },
    cover_url:    { type: String, default: '' }, // Cloudinary URL (uploaded via admin)
    external_url: { type: String, default: '' }, // Link to TNHS website
    sort_order:   { type: Number, default: 0 },
    is_active:    { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'tnhs_courses' }
);

TnhsCourseSchema.index({ is_active: 1, sort_order: 1 });

export const TnhsCourse =
  mongoose.models.TnhsCourse || mongoose.model('TnhsCourse', TnhsCourseSchema);

export default TnhsCourse;
