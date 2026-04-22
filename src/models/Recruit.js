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
