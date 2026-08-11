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

    /**
     * Stored with a leading slash, e.g. "/excel-ai-business-training-course".
     * Falsy → falls back to "/{course_id}-training-course" via resolveCourse.
     *
     * ── THIS INDEX IS NOT UNIQUE, AND NOTHING ELSE ENFORCES UNIQUENESS ──────
     * The previous comment here said `sparse: true` kept "the unique index"
     * from rejecting documents without an alias. There is no unique index.
     * `index: true` builds a PLAIN index — verified against the live
     * collection, which reports `urlAlias_1 unique=false sparse=true` — and no
     * code path checks for a duplicate either: saveCourseExtension normalises
     * the alias and writes it, and the create-flow duplicate guard
     * (findCourseExtensionCodeInsensitive) checks `courseId`, never `urlAlias`.
     *
     * So two courses CAN be given the same alias, both saves succeed, and
     * `getCourseExtensionByAlias` does `findOne({ urlAlias })` with no sort —
     * which of them the public page gets is index/natural order, not a
     * guarantee. That is not hypothetical: it is exactly how POWER-APPS and
     * Power-Apps came to share /power-apps-for-business-training-course, with
     * the admin editing one row while the public page rendered the other.
     *
     * The E11000 branch in saveCourseExtension's catch, which returns
     * "URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น", therefore CANNOT FIRE for an
     * alias collision. It is reachable only via the `courseId` unique index.
     *
     * Adding `unique: true` is a MIGRATION, not an edit: the index build fails
     * outright while duplicates exist, so the data has to be resolved first and
     * an application-level check added for the error to stay user-visible.
     */
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

    // ── Payment (Omise) ─────────────────────────────────────────
    // When true, the public registration wizard for this course shows
    // the 3-way payment choice (quote / credit card / QR PromptPay).
    // When false (default), the course uses the original quote-only flow.
    omisePaymentEnabled: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'course_extensions' }
);

// `courseId` gets a UNIQUE index from `unique: true`; `urlAlias` gets a plain
// sparse index from `index: true` — NOT a unique one. No additional `.index()`
// declarations needed (Mongoose warns on duplicates).

/**
 * Coerce an empty alias to null before save, so the sparse index skips the
 * document instead of holding 78 rows under the key "".
 *
 * THE ORIGINAL REASON GIVEN FOR THIS WAS WRONG — it said empty strings "would
 * conflict" under the unique index. They would not, because the index is not
 * unique (see urlAlias above). What the coercion actually buys is a smaller,
 * more honest index, and a `null` that reads as "no custom URL" rather than an
 * empty string that reads as one. Worth keeping; just not for that reason.
 *
 * AND IT DOES NOT RUN ON THE WRITE PATH THAT MATTERS. `saveCourseExtension`
 * uses findOneAndUpdate, and Mongoose does not fire `pre('save')` for update
 * operations — the normalisation that actually applies there is
 * `normalizeAlias()` in the action, which returns null for empty input. This
 * hook covers `.save()` callers, of which there are currently none.
 */
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
