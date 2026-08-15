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
     * Codes this course USED TO HAVE, appended by the rename action.
     *
     * ── WHY THE OLD CODE HAS TO SURVIVE SOMEWHERE ──────────────────────────
     * The code is CUSTOMER-FACING — it is the first column of /schedule, and
     * customers quote courses by it because the names are long. After a rename
     * the code on somebody's quotation matches nothing: `urlAlias` saves the
     * URL, but nothing saved the CODE. This is where it lives.
     *
     * CONSULTED BY EXACTLY TWO SITES, ruled: `/search`'s course haystack and
     * `resolveCourse`'s fallthrough. NOT the client-side catalogue filters —
     * those would need the extension payload widened for a case their users do
     * not hit. Anything else reading this is scope creep, and there is a guard.
     *
     * Also load-bearing for the COLLISION check: a new code must not collide
     * with a live code OR a retired one, or a rename resurrects an ambiguity
     * that an old link or an old quotation can still reach.
     *
     * Upper-cased on write through normalizeCourseCode, matching the key
     * discipline the order lists and the rank map already use.
     */
    formerCodes: { type: [String], default: [] },

    /**
     * Stored with a leading slash, e.g. "/excel-ai-business-training-course".
     * Falsy → falls back to "/{course_id}-training-course" via resolveCourse.
     *
     * ── UNIQUE, AND WHY `sparse` STAYS ──────────────────────────────────────
     * Two courses pointing at one alias means `getCourseExtensionByAlias`
     * (`findOne({ urlAlias })`, no sort) returns whichever the index hands back
     * — so the admin edits one row while the public page renders the other, and
     * every SEO/gallery/Omise change silently does nothing. That is worse than a
     * 404 because a 404 is visible. It happened: POWER-APPS and Power-Apps both
     * held /power-apps-for-business-training-course until 2026-08-11.
     *
     * `sparse` is doing nothing TODAY — all 78 rows carry an alias — and is kept
     * for the case the unique index would otherwise create: a course with no
     * custom URL must be able to store null, and under a NON-sparse unique index
     * the second such row collides with the first on the null key.
     *
     * ── THIS DECLARATION DOES NOT REACH THE DATABASE BY ITSELF ──────────────
     * Nothing in this repo applies index CHANGES. `dbConnect()` leaves Mongoose's
     * `autoIndex` at its default, so models do call `createIndexes()` on first
     * use — but that only CREATES MISSING indexes. `urlAlias_1` already exists as
     * non-unique, and MongoDB rejects a same-key/different-options create with
     * IndexOptionsConflict rather than altering it. `syncIndexes()`, which would
     * drop and rebuild the mismatch, is called nowhere.
     *
     * So the index must be dropped and recreated BY HAND, once:
     *     db.course_extensions.dropIndex('urlAlias_1')
     *     db.course_extensions.createIndex({ urlAlias: 1 }, { unique: true, sparse: true })
     * Until that is done this line is documentation, and the application-level
     * check in saveCourseExtension is the only thing standing between two
     * courses and one alias. Verify with `db.course_extensions.getIndexes()`:
     * the goal state is `urlAlias_1 unique: true, sparse: true`.
     */
    urlAlias: { type: String, default: '', trim: true, index: true, unique: true, sparse: true },

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

// Both `courseId` and `urlAlias` get UNIQUE indexes from `unique: true`;
// `urlAlias` is additionally sparse. No `.index()` declarations needed (Mongoose
// warns on duplicates). Two unique indexes means an E11000 no longer identifies
// which constraint failed on its own — see duplicateKeyMessage.

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
