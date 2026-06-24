import mongoose from 'mongoose';

const BatchDateSchema = new mongoose.Schema(
  {
    date:      { type: Date, required: true },
    day_label: { type: String, default: '' },  // "เสาร์ที่ 12 กรกฎาคม 2568"
  },
  { _id: false }
);

const MasterclassBatchSchema = new mongoose.Schema(
  {
    course_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'MasterclassCourse', required: true, index: true },
    course_slug: { type: String, required: true, trim: true, index: true },

    batch_no:    { type: Number, required: true },
    batch_label: { type: String, default: '' },  // "รุ่นที่ 1" — admin override

    dates:         { type: [BatchDateSchema], default: [] },
    venue_name:    { type: String, default: '' },
    venue_address: { type: String, default: '' },
    venue_map_url: { type: String, default: '' },
    venue_note:    { type: String, default: '' },
    preparation_html: { type: String, default: '' },

    price_normal:         { type: Number, required: true, min: 0 },
    price_early_bird:     { type: Number, default: null },
    early_bird_deadline:  { type: Date, default: null },
    early_bird_active:    { type: Boolean, default: false },

    capacity:         { type: Number, default: 50 },
    registered_count: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'open', 'full', 'closed', 'cancelled'],
      default: 'draft',
    },
    status_override: { type: Boolean, default: false },  // true = admin manual lock

    payment_enabled: { type: Boolean, default: false },
    internal_notes:  { type: String, default: '' },
  },
  { timestamps: true, collection: 'masterclass_batches' }
);

MasterclassBatchSchema.index({ course_id: 1, batch_no: 1 });
MasterclassBatchSchema.index({ status: 1 });

export default mongoose.models.MasterclassBatch ||
  mongoose.model('MasterclassBatch', MasterclassBatchSchema);
