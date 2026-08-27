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

    /**
     * The version's NUMBER — round 35.
     *
     * Assigned by the publish write, never by this collection: the counter is
     * `PageBuilder.publishedVersion`, `$inc`-ed inside the same single document
     * write that promotes the draft, and its post-increment value is stamped
     * here. That is what makes a number NEVER REUSED — deleting rows from this
     * collection cannot move a counter that does not live in it, so item 5b's
     * future GC can prune history without ever handing a number out twice.
     *
     * NULL is a real and expected state, not a defect: every row written before
     * round 35 has no number, and scripts/backfill-page-version-numbers.mjs
     * assigns them. Until it runs — or on any row it has not reached — the UI
     * omits the number rather than printing a placeholder. See
     * lib/pageBuilder/versionLabel.js, which owns that decision once.
     */
    versionNumber: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'page_versions' }
);

// A page's versions, newest first — for the pruning query and the Phase-3 UI.
PageVersionSchema.index({ pageId: 1, createdAt: -1 });

/**
 * ── THE BACKSTOP, AND WHY IT IS PARTIAL ───────────────────────────────────
 * `$inc` on the page is what makes numbers distinct; this index is what says so
 * out loud if that ever stops being true. It is a guard, not the mechanism.
 *
 * PARTIAL on `versionNumber` being a NUMBER, which is load-bearing rather than
 * tidy: MongoDB treats a missing field as null and considers two nulls EQUAL in
 * a unique index, so a plain unique index would reject the second unnumbered row
 * on any page — i.e. it would break every database that has not been backfilled,
 * which today is all of them. The filter excludes exactly those rows.
 *
 * A COLLISION IS NOT SILENT — see snapshotVersion in lib/pages/pageAudit.js. It
 * swallows every error so a failed snapshot can never fail a save, and a
 * swallowed duplicate-key would mean a LOST snapshot with no trace, which is
 * strictly worse than a repeated number. So that function logs before it
 * swallows. Round 33 named this as the decision to make when the number landed.
 */
PageVersionSchema.index(
  { pageId: 1, versionNumber: 1 },
  { unique: true, partialFilterExpression: { versionNumber: { $type: 'number' } } }
);

export default mongoose.models.PageVersion ||
  mongoose.model('PageVersion', PageVersionSchema);
