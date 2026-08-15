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

    /**
     * Courses carrying this skill, in display order — normalised UPPER-CASE
     * course codes. The direct analogue of `programOrder` above, and of
     * ProgramOrder.courseOrder; see that model and lib/courses/courseOrder.js.
     *
     * A course has ONE program but up to three skills (measured: 47×1, 29×2,
     * 3×3), so a course appears in one ProgramOrder list and in several of
     * these. Its position in each is independent — moving it here does not
     * move it on its program page.
     */
    courseOrder: { type: [String], default: [] },

    /** '' | 'seeded' | 'arranged' — see ProgramOrder.courseOrderSource. */
    courseOrderSource: { type: String, enum: ['', 'seeded', 'arranged'], default: '' },
  },
  { timestamps: true, collection: 'skill_orders' }
);

SkillOrderSchema.index({ order: 1 });

export default mongoose.models.SkillOrder ||
  mongoose.model('SkillOrder', SkillOrderSchema);
