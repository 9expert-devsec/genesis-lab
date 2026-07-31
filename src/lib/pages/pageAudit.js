/**
 * Audit-log + version-snapshot writers for pages.
 *
 * Both MUST NEVER block a save: every function swallows its own errors, so a
 * caller can `await` them without a failed audit/version write ever surfacing
 * as a failed mutation. A lost audit row or snapshot is acceptable; a lost
 * save is not.
 *
 * Server-only (imports mongoose models).
 */

import PageAuditLog from '@/models/PageAuditLog';
import PageVersion from '@/models/PageVersion';

const MAX_VERSIONS = 20; // keep only the newest N snapshots per page

/**
 * Append one audit row. `pageType` is 'builder' | 'advanced_html'. `before`/
 * `after` should be small (a status, a {slug,title} pair) — never a whole doc.
 */
export async function recordAudit(entry) {
  try {
    await PageAuditLog.create({
      pageId:    String(entry?.pageId ?? ''),
      pageType:  entry?.pageType ?? 'builder',
      action:    entry?.action ?? 'update',
      sectionId: entry?.sectionId ?? '',
      field:     entry?.field ?? '',
      before:    entry?.before ?? null,
      after:     entry?.after ?? null,
      actor:     entry?.actor ?? { id: '', name: '' },
    });
  } catch {
    /* audit must never block a save */
  }
}

/**
 * Snapshot a full page document, then prune the page's history to the newest
 * MAX_VERSIONS. `snapshot` should be a plain object (the caller serialises).
 */
export async function snapshotVersion({ pageId, snapshot, label, actor }) {
  const key = String(pageId ?? '');
  if (!key || !snapshot) return;
  try {
    await PageVersion.create({
      pageId:   key,
      snapshot,
      label:    label ?? '',
      actor:    actor ?? { id: '', name: '' },
    });
    const stale = await PageVersion.find({ pageId: key })
      .sort({ createdAt: -1 })
      .skip(MAX_VERSIONS)
      .select('_id')
      .lean();
    if (stale.length) {
      await PageVersion.deleteMany({ _id: { $in: stale.map((v) => v._id) } });
    }
  } catch {
    /* versioning must never block a save */
  }
}
