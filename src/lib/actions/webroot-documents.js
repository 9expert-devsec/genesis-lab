'use server';

import { copy, head } from '@vercel/blob';

import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import WebrootDocumentFile from '@/models/WebrootDocumentFile';
import { REPLACE, runReplaceFlow } from '@/lib/webroot/replaceFlow.mjs';
import { webrootUploadTarget } from '@/lib/webrootDocuments.mjs';

/**
 * REPLACING A SITE-ROOT PDF. Archive first, always.
 *
 * ══ THE ORDER IS THE FEATURE ════════════════════════════════════════════════
 *
 * These three objects live at a FIXED Blob key because the key is the URL and
 * the URL is printed on things. A replacement therefore overwrites, and Blob
 * keeps one version — so without an archive taken first, the overwrite destroys
 * the only copy. Same contract as the reference-rewrite revert: the backup
 * exists before the source is touched.
 *
 * The ordering itself lives in src/lib/webroot/replaceFlow.mjs with its
 * dependencies injected, so a test can make the copy fail and prove NO TOKEN
 * WAS ISSUED. That is the claim that matters and it cannot be shown against
 * real Blob.
 *
 * ── requireAdmin('media'), NOT requirePageAction ────────────────────────────
 * Reuses the media PERMISSION without the media flow. requireAdmin because the
 * audit sweep pairs the recorded menu against the requireAdmin literal in the
 * same function body; both resolve through canAccess. Same reasoning as
 * course-outlines.js — do not "fix" it back.
 *
 * ── A RESIDUAL GAP, STATED RATHER THAN HIDDEN ───────────────────────────────
 * The archive gate is HERE; the upload token is issued by
 * /api/admin/webroot-documents/upload. A client that called the route directly
 * would skip the archive. The route is not defenceless — it independently
 * re-derives the pathname from the frozen list and refuses anything else, so
 * the blast radius is "one of the three is overwritten without an archive",
 * not "any object in the store". Closing it properly means the route requiring
 * a receipt this action issues, which is worth doing before this is relied on
 * for anything irreplaceable.
 *
 * ── ARCHIVES ARE NOT PRUNED ─────────────────────────────────────────────────
 * Every previous edition is kept, and `listWebrootReplacements` exists so a
 * retention rule can be written later from the RECORD rather than by listing
 * the store and guessing which keys are archives.
 */

/** Timestamp for the archive key. One stamp, used by both the key and the row. */
function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Archive the current bytes and authorise a replacement.
 *
 * Returns `{ ok: true, archivePathname, … }` only when the previous bytes are
 * safely copied AND verified. Any other outcome is a refusal the admin can act
 * on, and no upload may follow it.
 */
export async function prepareWebrootReplacement({ filename, bytes } = {}) {
  const session = await requireAdmin('media');
  const stamp = stampNow();

  const result = await runReplaceFlow({ filename, bytes, stamp }, {
    headLive: async (pathname) => head(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN }),
    copy: async (from, to) => copy(from, to, {
      access: 'public',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    }),
    headArchive: async (pathname) => head(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN }),
    // The token itself comes from the upload route. Reaching this step IS the
    // authorisation: it is only reachable once the archive is verified.
    authorise: async (target) => ({ authorised: true, blobPathname: target.blobPathname }),
  });

  if (result.status !== REPLACE.AUTHORISED) {
    return { ok: false, status: result.status, error: result.error, archivePathname: result.archivePathname ?? '' };
  }

  recordAdminActionAfter({
    menu: 'media',
    action: 'update',
    entity: 'file',
    recordId: result.target.filename,
    recordLabel: `webroot ${result.target.publicPath} — archived to ${result.archivePathname}`,
    after: {
      archivePathname: result.archivePathname,
      previousBytes: result.previousBytes,
      incomingBytes: Number(bytes) || 0,
    },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return {
    ok: true,
    filename: result.target.filename,
    blobPathname: result.target.blobPathname,
    publicPath: result.target.publicPath,
    archivePathname: result.archivePathname,
    previousBytes: result.previousBytes,
    stamp,
  };
}

/**
 * Record what actually landed, AFTER the browser upload completes.
 *
 * Append-only: one row per replacement, so the history of a document is not
 * itself overwritten. `sha256` is the hash of the new bytes — the value the
 * propagation poll waits to see at the public URL.
 */
export async function recordWebrootReplacement({
  filename, archivePathname, bytes, contentType, sha256,
} = {}) {
  const session = await requireAdmin('media');

  const target = webrootUploadTarget(filename);
  if (!target.ok) return { ok: false, error: target.reason };

  try {
    await dbConnect();
    const previous = await WebrootDocumentFile
      .findOne({ filename: target.filename }, { version: 1 })
      .sort({ version: -1 })
      .lean();
    const version = (previous?.version ?? 0) + 1;

    await WebrootDocumentFile.create({
      filename: target.filename,
      blobPathname: target.blobPathname,
      publicPath: target.publicPath,
      archivePathname: String(archivePathname ?? ''),
      bytes: Number(bytes) || 0,
      contentType: String(contentType || 'application/pdf'),
      sha256: String(sha256 ?? ''),
      uploadedAt: new Date(),
      uploadedBy: String(session.user?.name || session.user?.id || ''),
      version,
    });

    recordAdminActionAfter({
      menu: 'media',
      action: 'update',
      entity: 'file',
      recordId: target.filename,
      recordLabel: `webroot ${target.publicPath} v${version}`,
      after: {
        version,
        bytes: Number(bytes) || 0,
        sha256: String(sha256 ?? ''),
        archivePathname: String(archivePathname ?? ''),
      },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, version, publicPath: target.publicPath };
  } catch (err) {
    // The bytes ARE live at this point. A failed record must not read as a
    // failed upload, or the admin replaces a file that is already replaced.
    return {
      ok: false,
      recorded: false,
      error: `แทนที่ไฟล์สำเร็จแล้ว แต่บันทึกประวัติไม่สำเร็จ — ${err?.message ?? err}`,
    };
  }
}

/**
 * Every recorded replacement, newest first. LISTABLE ON PURPOSE.
 *
 * Archives are never pruned, so a retention rule will eventually be wanted.
 * Reading it from this collection means that rule can be written from the
 * record — which archive key belongs to which document and edition — instead
 * of listing the store and inferring which keys are archives from their shape.
 */
export async function listWebrootReplacements({ filename } = {}) {
  await requireAdmin('media');
  try {
    await dbConnect();
    const query = filename ? { filename } : {};
    const rows = await WebrootDocumentFile
      .find(query, {
        filename: 1, publicPath: 1, archivePathname: 1, bytes: 1,
        sha256: 1, uploadedAt: 1, uploadedBy: 1, version: 1,
      })
      .sort({ uploadedAt: -1 })
      .limit(200)
      .lean();
    return { ok: true, rows: rows.map((r) => ({ ...r, _id: String(r._id) })) };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อ่านประวัติไม่สำเร็จ', rows: [] };
  }
}
