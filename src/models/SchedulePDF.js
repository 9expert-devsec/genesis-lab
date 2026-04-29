import mongoose from 'mongoose';

// Single-row collection storing the latest "training schedule" PDF the
// admin has uploaded. Replaced in place on each new upload — old files
// stay in Cloudinary unless explicitly cleaned up.
const SchedulePDFSchema = new mongoose.Schema(
  {
    key:        { type: String, default: 'schedule_pdf', unique: true },
    url:        { type: String, default: '' },
    publicId:   { type: String, default: '' },
    filename:   { type: String, default: '' },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'schedule_pdf' }
);

export default mongoose.models.SchedulePDF ||
  mongoose.model('SchedulePDF', SchedulePDFSchema);
