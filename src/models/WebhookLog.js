import mongoose from 'mongoose';

/**
 * WebhookLog — append-only audit trail for every webhook the Genesis
 * server has received from MSDB. We keep both successful and failed
 * events so an admin can replay a failed one or trace what fired the
 * last cache invalidation.
 *
 * Documents auto-expire after 30 days via the TTL index on
 * `processed_at` (TTL_DAYS below). Adjust that, not arbitrary deletes,
 * if retention needs to change.
 */
const TTL_DAYS = 30;

const WebhookLogSchema = new mongoose.Schema(
  {
    event:        { type: String, default: '', trim: true },
    source:       { type: String, default: 'msdb', trim: true },
    payload:      { type: mongoose.Schema.Types.Mixed, default: null },
    status:       { type: String, enum: ['ok', 'error'], default: 'ok', index: true },
    error:        { type: String, default: '' },
    processed_at: { type: Date,   default: () => new Date() },
  },
  { timestamps: true, collection: 'webhook_logs' }
);

WebhookLogSchema.index({ event: 1, processed_at: -1 });
WebhookLogSchema.index({ status: 1, processed_at: -1 });
WebhookLogSchema.index(
  { processed_at: 1 },
  { expireAfterSeconds: TTL_DAYS * 24 * 60 * 60 }
);

export default mongoose.models.WebhookLog ||
  mongoose.model('WebhookLog', WebhookLogSchema);
