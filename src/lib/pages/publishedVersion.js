/**
 * Who published the version that is currently live, and when.
 *
 * ── DELIBERATELY NOT A SERVER ACTION ──────────────────────────────────────
 * lib/actions/pageBuilder.js carries `'use server'`, so EVERY export in it is a
 * server action — an endpoint callable by id from any browser. `getPageVersions`
 * and `getPageVersionSnapshot` are safe there because both open with
 * `requireAdmin('pages')`.
 *
 * This read is called from a PUBLIC route, after a preview cookie has been
 * verified. Putting it in that file would mean either gating it with
 * requireAdmin (which the preview visitor does not have and must not need) or
 * shipping an UNGATED action that hands any caller an editor's name and a
 * publish time for any page id they can guess. Neither is acceptable, so it is
 * a plain server-only module instead — imported and called directly, reachable
 * only through code that already ran the gate. The public catch-all route
 * already imports models this way.
 *
 * Server-only: it imports a mongoose model, so it can never be pulled into a
 * client bundle.
 *
 * READ-ONLY. One indexed findOne on `{ pageId: 1, createdAt: -1 }`, projecting
 * three small fields and NEVER `snapshot` — the same reasoning round 34 used to
 * make the snapshot a separate fetch-one: a snapshot is a whole page document,
 * and nothing here renders one.
 */

import { dbConnect } from '@/lib/db/connect';
import PageVersion from '@/models/PageVersion';
// ADDED beside the two statements above rather than folded into either — the
// standing rule in this repo.
import { DRAFT_BACKUP_LABEL } from '@/lib/pageBuilder/versionLabel';

/**
 * The newest version row's metadata, or null when the page has no history.
 *
 * `actor` is denormalised at publish time and defaults to `{ id: '', name: '' }`,
 * so `publisher` can legitimately be an empty string — a session with no name
 * published it. The caller renders nothing rather than inventing a placeholder;
 * that decision is not made here, because this function's job is to report what
 * is stored.
 */
export async function getPublishedVersionMeta(pageId) {
  const key = String(pageId ?? '');
  if (!key) return null;
  await dbConnect();
  /**
   * ── BACKUPS ARE EXCLUDED IN THE QUERY, NOT AFTER IT ───────────────────────
   * Round 37 put draft backups in this collection, and a backup is newer than
   * the publish it protects. Without this filter, the FIRST restore-over-a-draft
   * would make a backup the newest row — and this function feeds a PUBLIC page
   * that names a publisher and a publish time. It would credit the author who
   * happened to restore, at the moment they restored, as the person who
   * published what visitors are reading.
   *
   * `$ne` on the backup label rather than `label: 'publish'`: rows written
   * before the label vocabulary settled carry '' and are genuine publishes, so
   * an allow-list would silently drop them. Excluding the one kind that is
   * definitely not a publish is the filter that is correct for both.
   *
   * Filtered in the QUERY so a backup's actor never leaves the database on this
   * path at all — the same reasoning `-draft` gets on every public page read.
   */
  const row = await PageVersion.find({ pageId: key, label: { $ne: DRAFT_BACKUP_LABEL } })
    .select('versionNumber actor createdAt')   // NEVER snapshot
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();
  const newest = Array.isArray(row) ? row[0] : row;
  if (!newest) return null;
  return {
    versionNumber: Number.isInteger(newest.versionNumber) ? newest.versionNumber : null,
    publisher: String(newest.actor?.name ?? ''),
    publishedAt: newest.createdAt ? new Date(newest.createdAt).toISOString() : null,
  };
}
