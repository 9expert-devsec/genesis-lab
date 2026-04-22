import mongoose from 'mongoose';

const RegisterPublicSchema = new mongoose.Schema(
  {
    // Course / class references (upstream IDs — we store as strings, not refs)
    courseId:    { type: String, required: true },
    courseCode:  { type: String, trim: true },
    courseName:  { type: String, trim: true },
    classId:     { type: String, required: true },
    classDate:   { type: String, trim: true }, // human-readable date label

    // Attendee info
    firstName:   { type: String, required: true, trim: true },
    lastName:    { type: String, required: true, trim: true },
    email:       { type: String, required: true, lowercase: true, trim: true },
    phone:       { type: String, required: true, trim: true },
    lineId:      { type: String, trim: true },

    // Billing info (optional — for company invoice)
    companyName: { type: String, trim: true },
    taxId:       { type: String, trim: true },
    address:     { type: String, trim: true },

    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'paid', 'cancelled'],
      default: 'pending',
    },
    notes:       { type: String, trim: true },

    // Audit
    source:      { type: String, default: 'web' },
    ipAddress:   { type: String },
  },
  { timestamps: true, collection: 'register_public' }
);

RegisterPublicSchema.index({ createdAt: -1, status: 1 });
RegisterPublicSchema.index({ email: 1 });

export default mongoose.models.RegisterPublic ||
  mongoose.model('RegisterPublic', RegisterPublicSchema);
