/**
 * Audit-log + version-snapshot writers for pages.
 *
 * TWO OF THE THREE MUST NEVER BLOCK A SAVE: recordAudit and snapshotVersion
 * swallow their own errors, so a caller can `await` them without a failed
 * audit/version write ever surfacing as a failed mutation. A lost audit row or
 * snapshot is acceptable; a lost save is not.
 *
 * THE THIRD IS THE EXACT INVERSE, and it is not an oversight.
 * backupDraftVersion (round 37) THROWS, because its row is the safety net for
 * an overwrite that happens next: reporting success it did not achieve would
 * let the caller destroy the draft it was written to preserve. Its own note
 * says so at length; do not "make it consistent".
 *
 * Server-only (imports mongoose models).
 */

import PageAuditLog from '@/models/PageAuditLog';
import PageVersion from '@/models/PageVersion';
// ADDED beside the two statements above rather than folded into either — the
// standing rule in this repo.
import { DRAFT_BACKUP_LABEL } from '@/lib/pageBuilder/versionLabel';


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

/**
 * Preserve the CURRENT draft as a Draft Backup — round 37.
 *
 * ── IT DOES NOT SWALLOW, AND THAT IS THE WHOLE POINT ───────────────────────
 * Every other writer in this file swallows: a lost audit row or a lost publish
 * snapshot must never fail the save that produced it, because the save is the
 * thing of value and the record is the by-product.
 *
 * Here the relation is INVERTED. This row is written so that the very next
 * effect — overwriting the author's draft with an older version — is not a
 * loss. A swallowed failure would mean the caller proceeds to overwrite, having
 * been told the safety net is in place when it is not, and the draft is gone
 * with nothing to recover it from. That is precisely the outcome round 37
 * exists to prevent, so this one THROWS and its caller aborts.
 *
 * If you are tempted to make this consistent with its neighbours: the
 * inconsistency is the design. Read the ordering note in
 * backupDraftBeforeRestore.
 *
 * `content` must already be picked to DRAFT_CONTENT_KEYS by the caller —
 * effectiveContent does that, and doing it here would put a second picker
 * beside the one draftState.js exists to be.
 */
export async function backupDraftVersion({ pageId, content, actor }) {
  const key = String(pageId ?? '');
  if (!key) throw new Error('backupDraftVersion: missing pageId');
  if (!content || typeof content !== 'object' || !Object.keys(content).length) {
    throw new Error('backupDraftVersion: refusing to back up empty content');
  }
  const row = await PageVersion.create({
    pageId: key,
    snapshot: content,
    label: DRAFT_BACKUP_LABEL,
    actor: actor ?? { id: '', name: '' },
    // NEVER a number. A backup is not a published version and must not consume
    // one — requirement §6. Null keeps it outside round 35's partial unique
    // index, which is what lets many backups coexist on one page.
    versionNumber: null,
  });
  return { id: String(row._id) };
}
