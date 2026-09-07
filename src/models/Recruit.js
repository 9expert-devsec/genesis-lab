import mongoose from 'mongoose';

const RecruitSchema = new mongoose.Schema(
  {
    slug:         { type: String, required: true, unique: true, lowercase: true, trim: true },
    title:        { type: String, required: true, trim: true },
    department:   { type: String, trim: true },
    location:     { type: String, trim: true }, // e.g. 'กรุงเทพ', 'Hybrid', 'Remote'
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'internship'],
      default: 'full-time',
    },
    // How many people are wanted for this posting. OPTIONAL, and `null` is the
    // only thing that means "not given" — see src/lib/recruitHeadcount.js, which
    // is the one place that decides. No default and no `min` here on purpose:
    // a schema default would write a value onto every posting that never had
    // one, and a validator would reject a payload the action has already
    // normalised to null. Documents written before this field existed simply do
    // not have it, which reads as `undefined` and normalises to null.
    headcount:    { type: Number, default: null },
    description:  { type: String, required: true }, // rich HTML
    responsibilities: [{ type: String }],
    qualifications:   [{ type: String }],
    benefits:     [{ type: String }],
    applyEmail:   { type: String, trim: true },
    active:       { type: Boolean, default: true },
    order:        { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'recruits' }
);

RecruitSchema.index({ order: 1, active: 1 });

export default mongoose.models.Recruit || mongoose.model('Recruit', RecruitSchema);
