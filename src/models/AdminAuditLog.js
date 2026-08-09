import mongoose from 'mongoose';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';

/**
 * AdminAuditLog — an append-only trail of every admin mutation, across BOTH
 * halves of this system's data.
 *
 * A generalisation of PageAuditLog (which covers the two page collections and
 * keeps working unchanged). Same posture, deliberately:
 *   - append-only: `createdAt` only, no `updatedAt`, because an audit row is
 *     immutable. Nothing in this repo updates a row here, and nothing should.
 *   - `before`/`after` are Mixed, because they hold whatever the action touched
 *     (a status enum, a {slug,title} pair, an ordered id list…) and the trail
 *     must survive schema drift on the things it describes. The CALLER keeps
 *     them small; `recordAdminAction` enforces a ceiling as a backstop.
 *   - writing a row MUST NEVER block a save. That is the writer's job, not the
 *     model's — see src/lib/audit/recordAdminAction.js.
 *
 * WHY THIS IS NOT A MONGOOSE HOOK. Half this admin's data does not live in
 * Mongo: courses, schedules, instructors and career paths are written UPSTREAM
 * to MSDB over HTTP via src/lib/api/msdb-write.js. Document middleware would
 * capture only the Mongo half and stay silent about the rest, producing a log
 * that LOOKS complete. The hook point is the server-action layer, which both
 * halves pass through.
 *
 * FIELD NOTES
 *   menu     — an RBAC page key from src/lib/rbac/pages.js. That vocabulary is
 *              reused rather than duplicated: it is already the `pageKey` passed
 *              to requireAdmin() at every admin write site, and it already
 *              carries the Thai label the reading surface renders. A second set
 *              of menu names for one concept is how the pin/position mismatch
 *              happened.
 *   menuRaw  — set ONLY when the supplied key was not in ALL_PAGE_KEYS. See
 *              UNKNOWN_MENU below.
 *   entity   — which KIND of record, when one menu holds more than one. The
 *              masterclass menu writes courses AND batches; portfolio writes
 *              logos AND photos; page-configs writes program AND skill configs.
 *              Menu alone cannot answer "who changed this batch".
 *   recordId — the identifier a human would recognise, which is NOT always a
 *              Mongo _id: a course_id code, an upstream promotion_id, a role
 *              key, or a stable literal like 'schedule-pdf' for a singleton.
 *   meta     — small structured extras that are not a field diff: the `source`
 *              discriminator on registrations, the {synced, errors} counts a
 *              bulk sync returns, an attendee count.
 */

/**
 * The bucket for a menu key that is not in the registry.
 *
 * A typo'd key must NOT create a phantom menu — the reading surface filters by
 * this field and renders its Thai label from ADMIN_PAGES, so an unregistered
 * string would be an unlabelable filter option that fragments the history.
 * But the row is NOT dropped either: an audit trail whose failure mode is "the
 * event vanished" is worse than one with an odd label. So the writer files it
 * under 'unknown' and preserves the offending value in `menuRaw`, which is
 * queryable — someone can find every mis-keyed row and repair the caller.
 */
export const UNKNOWN_MENU = 'unknown';

/** Every accepted `menu` value: the RBAC registry plus the catch-all. */
export const MENU_ENUM = [...ALL_PAGE_KEYS, UNKNOWN_MENU];

const AdminAuditLogSchema = new mongoose.Schema(
  {
    menu:    { type: String, enum: MENU_ENUM, required: true },
    menuRaw: { type: String, default: '' },

    entity:      { type: String, default: '' },
    recordId:    { type: String, default: '' },
    recordLabel: { type: String, default: '' },

    // 'create' | 'update' | 'delete' | 'toggle' | 'reorder' | 'sync' | …
    // Free-form on purpose: the set grows with the admin, and an enum here
    // would make adding a menu action a schema migration.
    action: { type: String, required: true },

    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after:  { type: mongoose.Schema.Types.Mixed, default: null },
    meta:   { type: mongoose.Schema.Types.Mixed, default: null },

    actor: {
      id:   { type: String, default: '' },
      // A SNAPSHOT of the display name at the time of the action. Admins get
      // renamed and deleted; the trail must still say who it was.
      name: { type: String, default: '' },
    },
  },
  // Only createdAt — an audit row is immutable, there is no updatedAt.
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'admin_audit_logs' }
);

// The four queries the reading surface is specified to serve. Phase 3 must
// confirm with explain() that these actually serve its chosen sort + filter
// combination before building on them: an index serves a sort only in its own
// direction or its exact reverse, and skip(n).limit(k) still performs a full
// blocking sort per request when no index covers it.
AdminAuditLogSchema.index({ createdAt: -1 });               // newest first, globally
AdminAuditLogSchema.index({ menu: 1, createdAt: -1 });      // one menu's history
AdminAuditLogSchema.index({ 'actor.id': 1, createdAt: -1 }); // one admin's history
AdminAuditLogSchema.index({ recordId: 1, createdAt: -1 });  // one record's history

export default mongoose.models.AdminAuditLog ||
  mongoose.model('AdminAuditLog', AdminAuditLogSchema);
