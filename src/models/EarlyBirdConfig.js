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

export default mongoose.models.EarlyBirdConfig ||
  mongoose.model('EarlyBirdConfig', EarlyBirdConfigSchema);
