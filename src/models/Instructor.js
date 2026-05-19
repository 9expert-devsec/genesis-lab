import mongoose from 'mongoose';

/**
 * Instructor — one row per instructor card on /about-us. Photos can
 * live either on Cloudinary (admin-uploaded) or in /public/Instructors
 * (seeded from local files via scripts/seed-instructors.js).
 */
const InstructorSchema = new mongoose.Schema(
  {
    // Upstream MSDB `_id` once synced. Empty for locally-seeded rows
    // (e.g. /public/Instructors entries that pre-date MSDB ownership).
    instructor_id:   { type: String, default: '', index: true },

    name:            { type: String, required: true, trim: true },
    name_en:         { type: String, default: '', trim: true },
    title:           { type: String, default: '', trim: true },
    bio:             { type: String, default: '' },
    image_url:       { type: String, default: '' },
    image_public_id: { type: String, default: '' }, // present only for Cloudinary uploads
    // Specialties are Genesis-local — MSDB has no equivalent field.
    specialties:     { type: [String], default: [] },
    // Programs the instructor teaches (MSDB ObjectId array).
    programs:        { type: [String], default: [] },
    display_order:   { type: Number, default: 0 },
    is_active:       { type: Boolean, default: true },
    synced_at:       { type: Date, default: null },
  },
  { timestamps: true, collection: 'instructors' }
);

InstructorSchema.index({ is_active: 1, display_order: 1 });

export default mongoose.models.Instructor ||
  mongoose.model('Instructor', InstructorSchema);
