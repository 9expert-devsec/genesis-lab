import mongoose from 'mongoose';

/**
 * PageVersion — a point-in-time full snapshot of a PageBuilder page, so a
 * publish can be rolled back. `snapshot` is the entire page document (Mixed)
 * captured at the moment of the write; storing the whole doc (rather than a
 * diff) keeps rollback a straight overwrite and survives schema drift.
 *
 * A snapshot is taken on every PUBLISH and before every rollback. History is
 * UNBOUNDED: the caller used to prune to the newest 20 on insert and no longer
 * does, because a deleted snapshot strands the Cloudinary assets its ownership
 * tokens were the last record of (see lib/pages/pageAudit.js). Like the audit
 * log, writing a version MUST NEVER block a save.
 *
 * The rollback UI is Phase 3; this phase only writes snapshots.
 */
const PageVersionSchema = new mongoose.Schema(
  {
    pageId:   { type: String, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true }, // full page doc
    label:    { type: String, default: '' }, // e.g. 'publish', 'pre-rollback'
    actor:    { id: { type: String, default: '' }, name: { type: String, default: '' } },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'page_versions' }
);

// A page's versions, newest first — for the pruning query and the Phase-3 UI.
PageVersionSchema.index({ pageId: 1, createdAt: -1 });

export default mongoose.models.PageVersion ||
  mongoose.model('PageVersion', PageVersionSchema);
