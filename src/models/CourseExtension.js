import mongoose from 'mongoose';

/**
 * CourseExtension — admin-managed metadata that "extends" an upstream
 * course identified by its `course_id` (e.g. "MSE-AI", "Power-Apps").
 *
 * Why a separate collection: the upstream `/public-course` API is
 * read-only for us, but we still want an editable layer for SEO,
 * pretty URLs, and a media gallery. Joining at render time keeps the
 * upstream fetch cacheable while letting admins make changes
 * independently.
 */

const GalleryItemSchema = new mongoose.Schema(
  {
    type:    { type: String, enum: ['image', 'youtube'], required: true },
    url:     { type: String, default: '' }, // image URL (Cloudinary or external)
    videoId: { type: String, default: '' }, // YouTube video ID for `youtube` items
    alt:     { type: String, default: '' }, // image alt text — accessibility + SEO
    order:   { type: Number, default: 0 },
  },
  { _id: false }
);

const CourseExtensionSchema = new mongoose.Schema(
  {
    courseId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // matches `course_id` from the upstream API (case-sensitive)
    },

    // ── Custom URL ──────────────────────────────────────────────
    // Stored with a leading slash, e.g. "/excel-ai-business-training-course".
    // Falsy → falls back to "/{course_id}-training-course" via resolveCourse.
    // `sparse: true` keeps the unique index from rejecting multiple
    // documents that don't have a custom alias set.
    urlAlias: { type: String, default: '', trim: true, index: true, sparse: true },

    // ── SEO ─────────────────────────────────────────────────────
    metaTitle:       { type: String, default: '' },
    metaDescription: { type: String, default: '' },
    ogImage:         { type: String, default: '' },

    // ── Taxonomy (free-form admin tags, not the upstream skill chips)
    tags: { type: [String], default: [] },

    // ── Media gallery — image slides + YouTube embeds, ordered.
    gallery: { type: [GalleryItemSchema], default: [] },

    // ── Control
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'course_extensions' }
);

// `courseId` already gets a unique index from `unique: true`; `urlAlias`
// gets a sparse index from `index: true`. No additional `.index()`
// declarations needed (Mongoose warns on duplicates).

// Avoid the unique-index quirk where multiple docs with `urlAlias: ""`
// would conflict. Coerce empty strings to `null` before save so the
// sparse index ignores them.
CourseExtensionSchema.pre('save', function preSave(next) {
  if (typeof this.urlAlias === 'string' && this.urlAlias.trim() === '') {
    this.urlAlias = null;
  }
  next();
});

export const CourseExtension =
  mongoose.models.CourseExtension ||
  mongoose.model('CourseExtension', CourseExtensionSchema);

export default CourseExtension;
