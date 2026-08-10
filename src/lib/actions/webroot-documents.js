'use server';

import { randomUUID } from 'node:crypto';

import { copy, head } from '@vercel/blob';

import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import WebrootDocumentFile from '@/models/WebrootDocumentFile';
import { REPLACE, runReplaceFlow } from '@/lib/webroot/replaceFlow.mjs';
import { buildWebrootReceipt } from '@/lib/webroot/receiptFlow.mjs';
import { issueWebrootReceipt, listPreparedWebrootReceipts } from '@/lib/webroot/receiptStore';
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
 * ── THE ROUTE IS BOUND TO THIS ACTION BY A RECEIPT ──────────────────────────
 * The archive gate is HERE; the upload token is minted by
 * /api/admin/webroot-documents/upload. That used to be a real gap — a client
 * calling the route directly got a token with no archive behind it, and the
 * frozen-list check only bounded the damage to one of the three.
 *
 * It is closed: reaching `authorise` (which is only reachable once the archive
 * is VERIFIED) issues a single-use, short-TTL receipt, and the route refuses to
 * mint without burning one. So the ordering proof in replaceFlow.mjs now covers
 * token issuance too — the tests that assert `authorise` was never called are
 * asserting no receipt exists, and no receipt means no token.
 *
 * ── ORPHANS ARE ACCEPTED, AND VISIBLE ───────────────────────────────────────
 * A prepare whose upload never happens leaves an archive copy and an unused
 * receipt. The copy is harmless — archives are never pruned — but it is not
 * silent: `listWebrootReplacements` returns those receipts in a SEPARATE
 * `prepared` list, so a prepared-only attempt can never read as a replacement.
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
 * Archive the current bytes and issue permission to replace them.
 *
 * Returns `{ ok: true, receiptId, receiptExpiresAt, archivePathname, … }` only
 * when the previous bytes are safely copied AND verified. Any other outcome is a
 * refusal the admin can act on, and no upload may follow it — the upload route
 * will not mint a token without the receiptId, so a caller that ignores a
 * refusal simply cannot proceed.
 *
 * The receipt is SINGLE-USE and short-lived (WEBROOT_RECEIPT_TTL_MS). One
 * prepare authorises one overwrite; a second upload needs a second prepare,
 * which takes a second archive.
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

    // ── THE RECEIPT IS MINTED HERE, AND ONLY HERE ─────────────────────────
    //
    // Deliberately inside `authorise` rather than after runReplaceFlow returns.
    // `authorise` is the step the flow reaches ONLY once the archive copy has
    // been made and verified, and the existing tests prove that by asserting a
    // call count of zero on every failure path. Minting here means those tests
    // now prove something stronger than they were written for: no archive, no
    // authorise call, therefore no receipt, therefore no token anywhere.
    //
    // crypto.randomUUID() and nothing derivable. Not the _id of a row, not the
    // stamp, not a counter — a receipt that can be guessed is not a receipt.
    authorise: async (target, { archivePathname, previousBytes }) => {
      const doc = buildWebrootReceipt({
        receiptId: randomUUID(),
        target,
        archivePathname,
        stamp,
        previousBytes,
        issuedBy: session.user?.name || session.user?.id || '',
        now: Date.now(),
      });
      try {
        await issueWebrootReceipt(doc);
      } catch (err) {
        // The archive EXISTS at this point and cannot be un-made; what failed is
        // the permission to use it. Returning a refusal rather than throwing
        // leaves one orphaned archive copy — harmless, since archives are never
        // pruned — instead of a server-action stack trace and an admin who
        // cannot tell whether the file was touched.
        return { ok: false, error: err?.message ?? String(err) };
      }
      return { ok: true, receiptId: doc.receiptId, expiresAt: doc.expiresAt };
    },
  });

  if (result.status !== REPLACE.AUTHORISED) {
    return { ok: false, status: result.status, error: result.error, archivePathname: result.archivePathname ?? '' };
  }

  if (!result.token?.ok) {
    return {
      ok: false,
      status: 'receipt-failed',
      error: `สำรองไฟล์เดิมสำเร็จแล้ว แต่ออกใบอนุญาตอัปโหลดไม่สำเร็จ จึงยังไม่แทนที่ — ${result.token?.error ?? ''}`,
      archivePathname: result.archivePathname,
    };
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
    // What the browser must hand back as clientPayload. It is the ONLY value
    // the upload route trusts, and it is spent the first time it is used.
    receiptId: result.token.receiptId,
    receiptExpiresAt: result.token.expiresAt,
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
 * Every recorded replacement, newest first — PLUS the prepares that never
 * completed. LISTABLE ON PURPOSE.
 *
 * Archives are never pruned, so a retention rule will eventually be wanted.
 * Reading it from this collection means that rule can be written from the
 * record — which archive key belongs to which document and edition — instead
 * of listing the store and inferring which keys are archives from their shape.
 *
 * ══ WHY `prepared` IS A SEPARATE LIST AND NOT A FLAG ON `rows` ══════════════
 *
 * A prepare that is never followed by an upload still made an archive copy. If
 * that attempt appeared among the replacements — even flagged, even with an
 * empty sha256 — it would read as "the bytes changed" to every consumer that
 * did not think to check the flag, and the first such consumer would be a
 * retention rule deciding which archives are still needed.
 *
 * The two live in different collections and come back in different arrays, so
 * confusing them takes a deliberate merge rather than a forgotten condition.
 * A prepared entry carries no `bytes`, no `sha256` and no `version`, because it
 * has none: nothing landed.
 *
 * `receiptId` is NOT returned. An unused, unexpired receipt is a live
 * credential; printing it in a listing hands it to whatever renders the listing.
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
        // Empty on an ordinary replacement; the source archive key on a
        // restore. Projected so the history can say which rows are rollbacks.
        restoredFrom: 1,
      })
      .sort({ uploadedAt: -1 })
      .limit(200)
      .lean();

    const now = Date.now();
    const receipts = await listPreparedWebrootReceipts({ filename });

    return {
      ok: true,
      rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
      prepared: receipts.map((r) => ({
        _id: String(r._id),
        filename: r.filename,
        archivePathname: r.archivePathname,
        issuedAt: r.issuedAt,
        issuedBy: r.issuedBy,
        expiresAt: r.expiresAt,
        // Past its window and never used: this one is certainly abandoned, and
        // its archive copy is an orphan. Still unexpired means it may yet be
        // completed, so the distinction is worth carrying.
        expired: Number(new Date(r.expiresAt)) <= now,
      })),
    };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'อ่านประวัติไม่สำเร็จ', rows: [], prepared: [] };
  }
}
