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
     * THE UPSTREAM COURSE THIS ROW BELONGS TO — MSDB's `_id`, as a hex string.
     *
     * ── WHY AN IDENTITY FIELD EXISTS BESIDE THE CODE ───────────────────────
     * `courseId` is a code, and a code MOVES. When the tech lead renames
     * `course_id` at MSDB, genesis is left holding the old one — and from the
     * code alone, "this course was renamed" and "this course was deleted
     * upstream and an unrelated one was created under the new code" are the
     * same observation. The rename screen reports that honestly today and
     * refuses to act on it, because acting on the wrong reading merges two
     * courses' SEO, gallery, early-bird price and schedule overrides with no
     * reverse — once genesis has written, the undo is refused by its own
     * collision and formerCodes guards.
     *
     * The `_id` is what separates them: it survives a rename, the code does
     * not.
     *
     * ── WHY IT WAS BACKFILLED WHEN IT WAS ──────────────────────────────────
     * The mapping from code to `_id` is only knowable with certainty while
     * every genesis code still matches an upstream code. Measured 2026-08-16
     * (scripts/audit-extension-upstream-id): 79 rows, 79 upstream courses, all
     * 79 resolving to exactly one `_id`, no duplicate codes, no duplicate ids,
     * and no upstream identifier already stored under any other name. After the
     * next rename the row that most needs an anchor is the one that can no
     * longer be given one.
     *
     * ── A STRING, NOT AN ObjectId, AND NOT A ref ───────────────────────────
     * The referent lives in a DIFFERENT DATABASE reached over HTTP. Declaring
     * `mongoose.Schema.Types.ObjectId` with a `ref` would invite a `populate()`
     * that can never resolve, and the audit trail already stores MSDB ids as
     * strings (`recordId: String(item?._id ?? '')`). Same key space, same
     * spelling.
     *
     * ── INDEXED, DELIBERATELY NOT UNIQUE ───────────────────────────────────
     * Two rows anchored to one upstream course would be a defect, so `unique`
     * looks right. It is not, yet, for two reasons that are about THIS round:
     * with `default: ''` every un-anchored row shares the empty key, so
     * uniqueness would need `sparse` and no default — which turns "left empty",
     * the state the backfill deliberately produces and reports, into an absent
     * key that reads as "never considered". And nothing consumes this field
     * yet, so a constraint would fire before any reader exists to be protected.
     * Revisit when the guard that reads it lands; the backfill cannot create a
     * duplicate by construction, since it writes only 1:1 resolutions.
     *
     * '' means NOT ANCHORED, and that is a real state, not a missing one. It is
     * never guessed at: see lib/courses/upstreamAnchorPlan.
     */
    upstreamId: { type: String, default: '', trim: true, index: true },

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
     * ── THE INDEX IS LIVE. THIS PARAGRAPH USED TO SAY IT WAS NOT ────────────
     * VERIFIED 2026-09-04 via `db.course_extensions.getIndexes()`:
     *
     *     { v: 2, key: { urlAlias: 1 }, name: 'urlAlias_1',
     *       unique: true, sparse: true }
     *
     * The hand migration this comment used to prescribe has been done. The
     * database enforces uniqueness, and the application-level check in
     * `saveCourseExtension` is the FRIENDLIER of two guards rather than the only
     * one — it refuses before the MSDB write and names the course that already
     * owns the alias, where the index would refuse afterwards with an E11000.
     *
     * KEPT AS A WARNING RATHER THAN DELETED, because the mechanism it described
     * is still true and still bites: nothing in this repo applies index
     * CHANGES. `dbConnect()` leaves Mongoose's `autoIndex` at its default, so
     * models call `createIndexes()` on first use — but that only CREATES
     * MISSING indexes. MongoDB rejects a same-key/different-options create with
     * IndexOptionsConflict rather than altering it, and `syncIndexes()`, which
     * would drop and rebuild a mismatch, is called nowhere. So the NEXT change
     * to these options will also need doing by hand, and will also sit here
     * looking applied until someone does it:
     *
     *     db.course_extensions.dropIndex('urlAlias_1')
     *     db.course_extensions.createIndex({ urlAlias: 1 }, { unique: true, sparse: true })
     *
     * The reason this correction matters: a reader trusting the old text would
     * believe two courses could still take one alias if the application check
     * were bypassed — by a direct database edit, a restored backup, or a race
     * between two admins — and would design around a hole that is closed.
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

    /**
     * ── RICH SECTION-7 BULLETS — PER ROW, INDEX-ALIGNED WITH MSDB ───────────
     *
     * Genesis-owned formatting for `training_topics`. MSDB keeps receiving the
     * plain projection in its exact current shape, `[{ title, bullets[] }]`,
     * because its own admin form still edits that field with plain <input>s and
     * every consortium consumer reads it through GET /api/ai/public-course.
     *
     * ── ONE ENTRY PER MSDB ROW, NOT ONE BLOB FOR THE SECTION ───────────────
     * `trainingTopicsRich[i]` is the HTML for `training_topics[i].bullets`.
     * Two reasons it is per-row rather than a single whole-section string:
     *
     *   · ROW TITLES STAY PLAIN AND MSDB-OWNED, by settled agreement. A single
     *     blob would have to carry the titles inside its own markup to express
     *     the section's structure, which is precisely the ownership line this
     *     split exists to hold.
     *   · The editor replaces the per-ROW bullets control, not the section. A
     *     blob would force it to re-derive row boundaries from markup on every
     *     keystroke.
     *
     * An entry may be '' — row i simply has no rich copy. 125 of the 829 live
     * rows carry no bullets at all, so that is the ordinary case, not an error.
     *
     * ── ABSENT / EMPTY IS THE SENTINEL, AND THERE IS NO BACKFILL ───────────
     * `[]` means "no rich copy exists for this course". That is all 79 courses
     * today and will stay so until an admin edits one; nothing migrates them.
     * Every reader must treat it as "render the plain MSDB rows exactly as
     * today" — see lib/courses/topicRichState.js, which is the ONE function
     * allowed to make that decision.
     *
     * ── A REAL [String], NOT JSON IN A STRING ──────────────────────────────
     * A JSON-encoded string would add a parse failure mode — a corrupt field
     * that throws or silently decodes to something else — and buy nothing Mongo
     * does not already do. The array is the shape; the database stores the
     * shape.
     *
     * ── IT HAS NO FALLBACK IN saveCourseExtension's UPDATE LITERAL ─────────
     * Omitting the key means UNTOUCHED, not "reset to []". That is the whole
     * point of the key-presence selection in that action, and the only reason
     * this field can be added to a live collection safely: every existing
     * caller omits it, and every existing caller must therefore leave it alone.
     */
    trainingTopicsRich: { type: [String], default: [] },

    /**
     * ── THE COURSE RICH BODY ────────────────────────────────────────────────
     *
     * Genesis-owned Tiptap HTML, authored in the admin course form and rendered
     * on the public course page IN PLACE OF the plain `course_teaser` paragraph
     * when it is present. Unlike `trainingTopicsRich`, this has no MSDB
     * counterpart to drift from — `course_teaser` keeps being read and stored
     * exactly as before, untouched by this field, and the fallback to it at
     * render is a presentation choice made where the page renders, not a sync
     * relationship this field has to track.
     *
     * '' is the sentinel for "no rich body written for this course" — every row
     * today, and there is no backfill. A reader that finds it empty (which also
     * covers Tiptap's own "nothing typed" shapes, e.g. `<p></p>`) renders the
     * plain teaser instead; see lib/richTextEmpty.
     *
     * Sanitised with `sanitizeRichHtml`'s `rich` profile on save AND again on
     * render, same defence-in-depth reasoning as every other field that module
     * covers: stored bytes can predate a sanitiser change, and the write path is
     * not the only thing that could ever put bytes here.
     *
     * NO FALLBACK ENTRY OF ITS OWN in extensionUpdate's coercion map, same as
     * `trainingTopicsRich` above and for the same reason: there is no value an
     * absent key could be replaced with that would not be a wipe, so every
     * existing caller that omits this key must leave it untouched.
     */
    descriptionRich: { type: String, default: '' },

    /**
     * ── SECTION 6'S FOUR RICH BODIES — descriptionRich's PATTERN, FOUR TIMES ──
     *
     * Genesis-owned Tiptap HTML for the four "รายละเอียดคอร์ส" bullet fields —
     * `objectivesRich` for `course_objectives`, `targetAudienceRich` for
     * `course_target_audience`, `prerequisitesRich` for `course_prerequisites`,
     * `systemRequirementsRich` for `course_system_requirements`. Every reason
     * `descriptionRich` gives above applies to each of these four unchanged:
     * '' is the sentinel for "no rich copy written", there is no backfill, the
     * plain MSDB field keeps being read and stored exactly as before (BOTH
     * inputs coexist in the admin form — this is additive, not a migration),
     * and the fallback to the plain list is a presentation choice made where
     * each renders (CourseObjectives.jsx and its three siblings), not a sync
     * relationship these fields have to track.
     *
     * Sanitised with `sanitizeRichHtml`'s `rich` profile on save AND again on
     * render, same defence-in-depth reasoning. NO FALLBACK ENTRY OF ITS OWN in
     * extensionUpdate's coercion map, for any of the four — an absent key
     * leaves the stored value untouched, which is what makes adding four more
     * writable fields to a live collection safe.
     *
     * Four independent fields, not one blob: each field's rich body and plain
     * list are their own pair (settled decision #4) — a rich `objectivesRich`
     * must not affect whether `targetAudienceRich` falls back, any more than
     * `descriptionRich` affects `course_target_audience`.
     */
    objectivesRich:          { type: String, default: '' },
    targetAudienceRich:      { type: String, default: '' },
    prerequisitesRich:       { type: String, default: '' },
    systemRequirementsRich:  { type: String, default: '' },
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
