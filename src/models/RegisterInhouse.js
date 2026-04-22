import mongoose from 'mongoose';

const RegisterInhouseSchema = new mongoose.Schema(
  {
    // Contact person
    contactName:  { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    contactRole:  { type: String, trim: true },

    // Company
    companyName:    { type: String, required: true, trim: true },
    companyAddress: { type: String, trim: true },
    companySize:    { type: String, trim: true }, // e.g. '1-50', '50-200', '200+'

    // Training request
    coursesInterested: [{ type: String }], // free-text or course IDs
    participantsCount: { type: Number, min: 1 },
    preferredDates:    { type: String, trim: true },
    preferredLocation: {
      type: String,
      enum: ['on-site', 'at-9expert', 'online', 'flexible'],
      default: 'flexible',
    },
    budget:       { type: String, trim: true },
    message:      { type: String, trim: true },

    // Status
    status: {
      type: String,
      enum: ['new', 'contacted', 'quoted', 'closed-won', 'closed-lost'],
      default: 'new',
    },
    notes:        { type: String, trim: true },

    // Audit
    source:       { type: String, default: 'web' },
    ipAddress:    { type: String },
  },
  { timestamps: true, collection: 'register_inhouse' }
);

RegisterInhouseSchema.index({ createdAt: -1, status: 1 });

export default mongoose.models.RegisterInhouse ||
  mongoose.model('RegisterInhouse', RegisterInhouseSchema);
