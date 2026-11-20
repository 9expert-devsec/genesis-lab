'use server';

/**
 * CATALOG PDFs ON PROGRAM AND SKILL PAGES — prepare an upload, record what
 * landed, or clear it.
 *
 * ══ WHERE THE FILE GOES: VERCEL BLOB, EVERY SIZE ════════════════════════════
 *
 * Catalogs used to be browser-direct SIGNED CLOUDINARY uploads. Cloudinary
 * refuses raw files over 10 MB, and catalogs are routinely bigger, so every
 * catalog now goes to Blob through ONE code path whatever its size: a Blob
 * CLIENT upload (Vercel caps a function request body at 4.5 MB, so the bytes
 * go browser → store, never through a function). The public URL does not move:
 * it stays the root-relative path on the config row, served from Blob by one
 * narrow rewrite in next.config.mjs (lib/pageCatalogPaths.mjs).
 *
 * ══ THE WEBROOT REPLACEMENT'S MECHANISM, REUSED ═════════════════════════════
 *
 *   1. preparePageCatalogUpload — derives the target from (kind, id) and issues
 *      a single-use, short-TTL RECEIPT. It returns the server-derived Blob
 *      pathname; the client passes it to upload() unchanged.
 *   2. /api/admin/page-catalogs/upload — burns the receipt, re-derives the
 *      pathname from it and refuses unless the client asked for exactly that.
 *   3. recordPageCatalogUpload — re-checks permission, checks the receipt was
 *      burned for THIS page and not yet recorded, checks the URL is exactly this
 *      page's Blob URL, HEADs it (PDF, real size), and only then writes the
 *      record. Blob's onUploadCompleted callback is NOT used: it never reaches
 *      localhost, so nothing load-bearing may depend on it.
 *
 * ══ requireAdmin('page_configs'), NOT requirePageAction ═════════════════════
 * Same reason course-outlines.js gives: the audit sweep pairs the recorded
 * menu against the requireAdmin LITERAL in the same body.
 *
 * ── THE RULE THE WHOLE FEATURE RESTS ON ─────────────────────────────────────
 * The filename, the public path and the Blob pathname come from
 * catalogTarget(kind, id) and are never accepted from the client. Re-upload
 * overwrites the same Blob key (allowOverwrite), so whoever names the path
 * names the object that gets replaced; the only thing a caller can influence
 * is WHICH program or skill — which the page guard already governs.
 *
 * ── WHAT HAPPENS TO THE OLD FILE ────────────────────────────────────────────
 * REPLACED: overwritten in place at the same Blob key — the URL is unchanged
 * and `version` counts it. A catalog that was on Cloudinary before this round
 * is copied to Blob once by scripts/migrate-page-catalogs-to-blob.mjs; the
 * Cloudinary original is left untouched and is simply no longer served.
 * REMOVED: the config's field is cleared and the bytes are LEFT in the store,
 * deliberately — nothing links to the derived key once the field is empty, and
 * the next upload overwrites it. The honest cost: the public URL keeps
 * resolving until a new file replaces it.
 */

import { randomUUID } from 'node:crypto';
import { head } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { catalogTarget, emptyCatalog, refuseNonPdf } from '@/lib/pageCatalog';
import { refusePageCatalogSize } from '@/lib/pageCatalogPaths.mjs';
import {
  buildPageCatalogReceipt,
  refusePageCatalogHead,
  refusePageCatalogRecord,
} from '@/lib/pageCatalogUploadFlow.mjs';
import {
  claimPageCatalogReceiptForRecord,
  issuePageCatalogReceipt,
  readPageCatalogReceipt,
} from '@/lib/pageCatalogReceiptStore';

const ADMIN_PATH = '/admin/page-configs';

/** The model and key field for a kind. `catalogTarget` has already validated `kind`. */
function storeFor(kind) {
  return kind === 'skill'
    ? { Model: SkillPageConfig, keyField: 'skillId', entity: 'skill_config', prefix: '/skill/' }
    : { Model: ProgramPageConfig, keyField: 'programId', entity: 'program_config', prefix: '/program/' };
}

/**
 * The public pages that show this catalog. The custom slug renders at the
 * bare URL and the default at the prefixed one; both are force-dynamic
 * routes, so this is belt-and-braces beside the admin list.
 */
function revalidatePages({ prefix }, id, doc) {
  revalidatePath(ADMIN_PATH);
  if (doc?.urlSlug) revalidatePath(`/${doc.urlSlug}`);
  revalidatePath(`${prefix}${id}`);
}

/**
 * Prepare a Blob client upload of one catalog PDF for a program or a skill.
 *
 * `filename` and `contentType` are the PICKED file's, as the browser reports
 * them, and exist only to be refused — the target's name is derived. The size
 * check is THIS field's (64 MB), not the shared Cloudinary policy: these files
 * are not on Cloudinary, and /admin/media keeps its own 10 MB rule untouched.
 */
export async function preparePageCatalogUpload({ kind, id, filename, contentType, bytes } = {}) {
  const session = await requireAdmin('page_configs');

  const target = catalogTarget(kind, id);
  if (!target.ok) return { ok: false, error: target.error };

  // The picked file, not the derived name: the derived name is always a PDF
  // name, so a check on it would pass everything.
  const notPdf = refuseNonPdf({ filename, contentType });
  if (notPdf) return { ok: false, error: notPdf };

  const tooBig = refusePageCatalogSize(bytes);
  if (tooBig) return { ok: false, error: tooBig };

  // crypto.randomUUID() and nothing derivable — a guessable receipt is not one.
  const doc = buildPageCatalogReceipt({
    receiptId: randomUUID(),
    kind: target.kind,
    key: target.key,
    rawId: String(id).trim(),
    issuedBy: session.user?.name || session.user?.id || '',
    now: Date.now(),
  });
  try {
    await issuePageCatalogReceipt(doc);
  } catch (err) {
    return { ok: false, error: `ออกใบอนุญาตอัปโหลดไม่สำเร็จ — ${err?.message ?? err}` };
  }

  recordAdminActionAfter({
    menu: 'page_configs',
    action: 'update',
    entity: storeFor(target.kind).entity,
    recordId: target.key,
    recordLabel: `catalog upload prepared — ${target.publicPath}`,
    after: { publicPath: target.publicPath, blobPathname: target.blobPathname, bytes: Number(bytes) || 0 },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return {
    ok: true,
    // Server-derived. The client passes it to upload() as-is; the token route
    // re-derives it from the receipt and refuses any other value.
    blobPathname: target.blobPathname,
    publicPath: target.publicPath,
    fileName: target.fileName,
    // The ONLY value the token route trusts, spent the first time it is used.
    receiptId: doc.receiptId,
    receiptExpiresAt: doc.expiresAt,
  };
}

/**
 * Record what landed on Blob, on the config row. Called by the browser AFTER
 * upload() resolves, with what Blob returned (`url`, `pathname`) and the
 * receipt. Everything is re-derived or re-checked; nothing is trusted.
 *
 * Upserts the config: a program that has never had its URL or SEO touched
 * still gets a row, keyed exactly as saveProgramConfig would key it.
 */
export async function recordPageCatalogUpload({ kind, id, receiptId, url, pathname } = {}) {
  const session = await requireAdmin('page_configs');

  const target = catalogTarget(kind, id);
  if (!target.ok) return { ok: false, error: target.error };
  const store = storeFor(target.kind);

  // ── the receipt, the URL and the pathname — before any network or write ──
  let receipt = null;
  try {
    receipt = await readPageCatalogReceipt(receiptId);
  } catch (err) {
    return { ok: false, error: `อ่านใบอนุญาตอัปโหลดไม่สำเร็จ — ${err?.message ?? err}` };
  }
  const refused = refusePageCatalogRecord({
    receipt,
    kind: target.kind,
    key: target.key,
    url,
    pathname,
    blobBase: process.env.BLOB_PUBLIC_BASE,
  });
  if (refused) return { ok: false, error: refused };

  // ── what is ACTUALLY in the store at that URL ────────────────────────────
  let blob = null;
  try {
    blob = await head(String(url), { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    return { ok: false, error: `ตรวจสอบไฟล์ใน Blob ไม่สำเร็จ — ${err?.message ?? err}` };
  }
  const badHead = refusePageCatalogHead(blob);
  if (badHead) return { ok: false, error: badHead };
  const bytes = Number(blob.size) || 0;

  try {
    // ONE guarded claim — a second record call for the same receipt (a double
    // click, a retry) matches nothing and cannot bump `version` twice.
    const claimed = await claimPageCatalogReceiptForRecord(
      receiptId, { kind: target.kind, key: target.key }, Date.now(),
    );
    if (!claimed) return { ok: false, error: 'การอัปโหลดนี้ถูกบันทึกไปแล้ว' };

    await dbConnect();
    // Keyed on the id AS TYPED — that is the value page-configs.js keys on and
    // the resolver matches case-insensitively; the lowercased form belongs to
    // the path only.
    const key = String(id).trim();
    const updated = await store.Model.findOneAndUpdate(
      { [store.keyField]: key },
      {
        $set: {
          // UNCHANGED: the public path, served from Blob by the rewrite.
          'catalogPdf.path': target.publicPath,
          'catalogPdf.bytes': bytes,
          'catalogPdf.uploadedAt': new Date(),
          'catalogPdf.uploadedBy': String(session.user?.name || session.user?.id || ''),
        },
        // Starts at 1 on the first upload and counts replacements thereafter.
        $inc: { 'catalogPdf.version': 1 },
        $setOnInsert: { [store.keyField]: key },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    recordAdminActionAfter({
      menu: 'page_configs',
      action: 'update',
      entity: store.entity,
      recordId: target.key,
      recordLabel: `catalog v${updated?.catalogPdf?.version ?? 1} — ${target.publicPath}`,
      after: {
        publicPath: target.publicPath,
        blobPathname: target.blobPathname,
        bytes,
        contentType: String(blob.contentType || ''),
        version: updated?.catalogPdf?.version ?? 1,
      },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    revalidatePages(store, key, updated);
    return {
      ok: true,
      publicPath: target.publicPath,
      catalogPdf: JSON.parse(JSON.stringify(updated?.catalogPdf ?? emptyCatalog())),
    };
  } catch (err) {
    // The file IS uploaded at this point. Failing to record it must not read as
    // a failed upload, or the admin re-uploads bytes that are already there.
    return {
      ok: false,
      recorded: false,
      publicPath: target.publicPath,
      error: `อัปโหลดสำเร็จ แต่บันทึกไม่สำเร็จ — ${err?.message ?? err}`,
    };
  }
}

/**
 * Clear the catalog from a config. The button disappears; the bytes stay in the
 * store until the next upload overwrites them — see the header.
 */
export async function removePageCatalog({ kind, id } = {}) {
  const session = await requireAdmin('page_configs');

  const target = catalogTarget(kind, id);
  if (!target.ok) return { ok: false, error: target.error };
  const store = storeFor(target.kind);

  try {
    await dbConnect();
    const key = String(id).trim();
    const updated = await store.Model.findOneAndUpdate(
      { [store.keyField]: key },
      { $set: { catalogPdf: emptyCatalog() } },
      { new: true },
    ).lean();

    recordAdminActionAfter({
      menu: 'page_configs',
      action: 'update',
      entity: store.entity,
      recordId: target.key,
      recordLabel: `catalog removed — ${target.publicPath}`,
      after: { publicPath: '' },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    revalidatePages(store, key, updated);
    return { ok: true, catalogPdf: emptyCatalog() };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'ลบไม่สำเร็จ' };
  }
}
