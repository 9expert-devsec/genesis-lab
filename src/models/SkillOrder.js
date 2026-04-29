import mongoose from 'mongoose';

const SkillOrderSchema = new mongoose.Schema(
  {
    skillId:      { type: String, required: true, unique: true },
    displayName:  { type: String, default: '' },
    iconUrl:      { type: String, default: '' },
    order:        { type: Number, default: 999 },
    isHidden:     { type: Boolean, default: false },
    // Programs within this skill — ordered list of programIds.
    programOrder: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'skill_orders' }
);

SkillOrderSchema.index({ order: 1 });

export default mongoose.models.SkillOrder ||
  mongoose.model('SkillOrder', SkillOrderSchema);
