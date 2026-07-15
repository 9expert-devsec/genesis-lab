import mongoose from 'mongoose';

/**
 * PageAuditLog — an append-only trail of every mutation to a page (either
 * page type). One row per action. Deliberately denormalised and loosely
 * typed: `before`/`after` are Mixed because they hold whatever the action
 * touched (a status string, a {slug,title} pair, a section id…), and the
 * trail must survive schema drift on the pages themselves.
 *
 * Writing a log entry MUST NEVER block a save — the action layer wraps the
 * write in try/catch and swallows (same defensive posture as
 * currentUserStamp). A lost audit row is acceptable; a failed save is not.
 *
 * `pageType` distinguishes the two collections this trail spans:
 *   'builder'       → PageBuilder (page_builder_pages)
 *   'advanced_html' → CustomPage  (custom_pages)
 */
const PageAuditLogSchema = new mongoose.Schema(
  {
    pageId:   { type: String, required: true },
    pageType: { type: String, enum: ['builder', 'advanced_html'], required: true },

    // e.g. 'create' | 'update' | 'delete' | 'status' | 'section.add' | …
    action:   { type: String, required: true },

    // Set for section-scoped actions; the field name for field-scoped edits.
    sectionId: { type: String, default: '' },
    field:     { type: String, default: '' },

    // What changed — arbitrary shape, kept small by the caller.
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },

    actor: { id: { type: String, default: '' }, name: { type: String, default: '' } },
  },
  // Only createdAt — an audit row is immutable, there is no updatedAt.
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'page_audit_logs' }
);

// The one query that matters: a page's history, newest first.
PageAuditLogSchema.index({ pageId: 1, createdAt: -1 });

export default mongoose.models.PageAuditLog ||
  mongoose.model('PageAuditLog', PageAuditLogSchema);
