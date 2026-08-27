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
 * Snapshot a full page document. `snapshot` should be a plain object (the
 * caller serialises).
 *
 * ── THE PRUNE IS GONE, ON PURPOSE ──────────────────────────────────────────
 * This used to delete every row past the newest 20 per page. It cannot, until
 * there is something able to reclaim what a deleted snapshot was holding.
 *
 * A snapshot is the ENTIRE page document, and a page document carries
 * Cloudinary ownership tokens — `seo.ogImagePublicId` and each section's
 * image `publicId`. Deleting the row deletes the last record that those
 * assets were ever referenced, while the assets themselves stay in
 * Cloudinary. So every 21st publish permanently STRANDS an asset: nothing
 * left in the system knows it exists, and nothing can ever reclaim it. See
 * item 5 in docs/page-builder-status.md.
 *
 * Unbounded growth is the cheaper of the two failures — rows are small, and a
 * row that is merely surplus can be deleted later, whereas a stranded asset
 * cannot be found later. Restore the prune once item 5b's reference-counted
 * GC exists to clean up what it orphans.
 *
 * NOT related to getPageVersions' MAX_VERSION_ROWS / .limit(20): that is a
 * DISPLAY cap on the admin history list, and it stays exactly as it is.
 * Conflating a display cap with a retention policy is what made a prune look
 * harmless in the first place.
 */
export async function snapshotVersion({ pageId, snapshot, label, actor, versionNumber }) {
  const key = String(pageId ?? '');
  if (!key || !snapshot) return;
  try {
    await PageVersion.create({
      pageId:   key,
      snapshot,
      label:    label ?? '',
      actor:    actor ?? { id: '', name: '' },
      // The caller passes the POST-increment counter off its own write. Absent
      // or non-numeric means "not numbered", which is a real state — every row
      // written before round 35 is in it. Coerced here rather than trusted, so
      // an undefined never reaches the schema as a number.
      versionNumber: Number.isFinite(versionNumber) ? versionNumber : null,
    });
  } catch (err) {
    /**
     * Versioning must never block a save — unchanged, and still the point.
     *
     * BUT IT NO LONGER FAILS WITHOUT A TRACE. Round 35 added a partial unique
     * index on (pageId, versionNumber). A duplicate-key rejection here would
     * mean a LOST SNAPSHOT — the one failure mode strictly worse than the
     * repeated number the index exists to catch — and swallowing it silently
     * would hide the only evidence that the counter had stopped being unique.
     * Round 33 flagged this as the decision to make when the number landed:
     * keep the swallow, add the log.
     *
     * Logged, not thrown. A save that succeeded must still report success.
     */
    console.error(
      `[pageVersion] snapshot NOT written for page ${key} (version ${versionNumber ?? 'unnumbered'}) — ` +
      `history is now missing a publish: ${err?.message ?? err}`
    );
  }
}
