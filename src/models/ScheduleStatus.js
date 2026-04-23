import mongoose from 'mongoose';

/**
 * Admin-defined status override for upstream schedules.
 *
 * We do not mirror upstream schedules; this collection only stores
 * diffs (overrides + optional scheduled future changes). The resolver
 * in src/lib/schedule-status.js merges this with upstream at read time.
 */
const ScheduleStatusSchema = new mongoose.Schema(
  {
    scheduleId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['open', 'nearly_full', 'closed'],
      required: true,
    },
    scheduledChangeAt: { type: Date, default: null },
    scheduledChangeTo: {
      type: String,
      enum: ['open', 'nearly_full', 'closed', null],
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
  },
  { timestamps: true, collection: 'schedule_status' }
);

export default mongoose.models.ScheduleStatus ||
  mongoose.model('ScheduleStatus', ScheduleStatusSchema);
