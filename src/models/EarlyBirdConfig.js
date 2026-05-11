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

export default mongoose.models.EarlyBirdConfig ||
  mongoose.model('EarlyBirdConfig', EarlyBirdConfigSchema);
