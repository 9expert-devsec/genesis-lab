import mongoose from 'mongoose';

/**
 * Instructor — one row per instructor card on /about-us. Photos can
 * live either on Cloudinary (admin-uploaded) or in /public/Instructors
 * (seeded from local files via scripts/seed-instructors.js).
 */
const InstructorSchema = new mongoose.Schema(
  {
    name:            { type: String, required: true, trim: true },
    title:           { type: String, default: '', trim: true },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' }, // present only for Cloudinary uploads
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'instructors' }
);

InstructorSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.Instructor ||
  mongoose.model('Instructor', InstructorSchema);
