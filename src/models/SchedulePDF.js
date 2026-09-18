import mongoose from 'mongoose';

// Single-row collection storing the latest "training schedule" PDF the
// admin has uploaded. Since the signed-upload round `url` is the
// ROOT-RELATIVE `/files/schedule/9expert-training-schedule.pdf` and each
// upload overwrites that one asset in place; a row written before that round
// still holds an absolute res.cloudinary.com secure_url, and both consumers
// put the value straight into `href`, so either shape renders.
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
