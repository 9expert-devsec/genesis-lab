import mongoose from 'mongoose';

/**
 * EarlyBirdConfig — one config per course for the Early Bird banner.
 * Stores the promotion reference, deadline for countdown, special price,
 * and which schedule to link the register button to.
 */
const EarlyBirdConfigSchema = new mongoose.Schema(
  {
    course_id:    { type: String, required: true, unique: true, trim: true },
    promotion_id: { type: String, default: '', trim: true },  // FK → Promotion (for thumbnail)
    /**
     * ── THE OWNERSHIP FIELD GOING FORWARD ────────────────────────────────
     * A `PageBuilder._id` as a string: the promotion PAGE that owns this row
     * and writes it through on save. Empty means no page owns it.
     *
     * A SEPARATE FIELD, NOT `promotion_id` REPURPOSED. Overloading that one to
     * hold a page id would make every existing reader ambiguous — the
     * `Promotion` join in `getEarlyBirdByCourse` would look up a page id as an
     * MSDB promotion and find nothing, silently dropping the banner thumbnail.
     * `promotion_id` is LEGACY: read it, respect it, never write a new value
     * into it. Promotions will be created on Genesis itself and it falls out
     * of use; this field is what replaces it.
     *
     * BOTH CAN BE SET AT ONCE, and that is not a broken state — it is what
     * adopting a released legacy row produces, because adoption sets the page
     * and leaves `promotion_id` exactly as it was. `resolveOwner` in
     * lib/earlyBird/ownership.js reads this FIRST, so the page wins; reading
     * them the other way round would make an adopted row answer "legacy" and
     * refuse the page its own row.
     *
     * ABSENT ON EVERY ROW STORED BEFORE THIS COMMIT, and the discriminator is
     * built for that: `.lean()` applies no Mongoose defaults and JSON
     * serialisation drops undefined keys, so a reader sees the key MISSING
     * rather than `''`. `resolveOwner` folds absent, null and '' into one
     * answer — nobody — which is why adding this field changes nothing about
     * how the four live rows resolve today.
     */
    owner_page_id: { type: String, default: '', trim: true },
    schedule_id:  { type: String, default: '', trim: true },  // upstream schedule _id for register button
    label_th:     { type: String, default: 'Early Bird', trim: true },
    special_price:{ type: Number, default: null },            // admin-set price (shown in card)
    deadline:     { type: Date,   default: null },            // countdown target
    is_active:    { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'early_bird_configs' }
);

/**
 * The promotion-side admin (/admin/promotions/<id>/early-bird) lists a
 * promotion's whole Early Bird set with `find({ promotion_id })`, and the
 * refusal path re-reads by the same field. This is that query's only access
 * path — the collection is small, so this is not a measured win, it is simply
 * the index the query has.
 *
 * `course_id`'s unique index above is load-bearing and NOT merely a constraint:
 * it is what makes "one course, one Early Bird" a RULE. `saveEarlyBird` writes
 * through a filter naming both the course and the promotions allowed to own it,
 * so a write aimed at a course another promotion holds misses, attempts an
 * insert, and is refused by this index rather than by an earlier read that two
 * admins could race. Dropping `unique` would turn the refusal into a suggestion.
 */
EarlyBirdConfigSchema.index({ promotion_id: 1 });

/**
 * The owner-scoped access path: "every row this page owns", which is what a
 * page save reconciles against and what clearing a binding or deleting a page
 * deletes. Same shape and same reason as `promotion_id`'s index above — the
 * collection is small, so this is the index the query has rather than a
 * measured win.
 *
 * ── DELIBERATELY NOT UNIQUE, AND NOT COMPOUND ─────────────────────────────
 * `course_id`'s unique index above stays the SOLE unique key, because it is
 * what makes "one course, one Early Bird" a rule at all. A compound
 * `(course_id, owner_page_id)` unique index would let two pages hold the same
 * course — the exact overwrite this collection's rule exists to refuse — and it
 * would also break `lib/courses/renameCoursePreview.js`, which declares
 * EarlyBirdConfig's `course_id` as `unique: true` and derives a rename
 * collision check from that declaration.
 *
 * VERIFIED PRESENT on the deployed collection (course_id_1, unique: true),
 * alongside promotion_id_1. That matters: the guarded write's E11000 refusal is
 * only real if the index exists, and course-promos.js has carried a note since
 * it was written saying the production index was UNVERIFIED. It is verified now
 * — which makes the duplicate-key catch a real second refusal rather than a
 * hoped-for one. It does NOT make the pre-read collapsible; the two still fail
 * in different worlds (see that note).
 */
EarlyBirdConfigSchema.index({ owner_page_id: 1 });

export default mongoose.models.EarlyBirdConfig ||
  mongoose.model('EarlyBirdConfig', EarlyBirdConfigSchema);
