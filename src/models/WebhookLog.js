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
    // Audit of what the handler did: an array of
    // { type: 'tag'|'path'|'alias-lookup'|'visibility'|'visibility-uncertain',
    //   target, ok, error?, value? }. Null when the handler returns nothing.
    //
    // Not every entry is a revalidation — `alias-lookup` records a DB lookup.
    // `visibility` records that an incoming row FAILS MSDB's own /schedules read
    // filter (docs/api-domains.md:276-278) and will therefore never reach a
    // public surface; `visibility-uncertain` records that we could not DECIDE
    // (e.g. a status that only matches after case-folding, where upstream's own
    // comparison is unverified) so the row MAY be invisible. Query on `type` to
    // separate the two — definite and possible must not be read as the same
    // claim. Both carry ok:false, and neither is a delivery failure: the
    // document-level `status` stays 'ok' and the route still returns 200.
    revalidated:  { type: mongoose.Schema.Types.Mixed, default: null },
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
