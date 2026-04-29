import mongoose from 'mongoose';

// Stores custom display order for programs fetched from external API.
// programId matches the `program_id` or `_id` field from /programs.
const ProgramOrderSchema = new mongoose.Schema(
  {
    programId:   { type: String, required: true, unique: true },
    displayName: { type: String, default: '' },
    iconUrl:     { type: String, default: '' },
    order:       { type: Number, default: 999 },
    isHidden:    { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'program_orders' }
);

ProgramOrderSchema.index({ order: 1 });

export default mongoose.models.ProgramOrder ||
  mongoose.model('ProgramOrder', ProgramOrderSchema);
