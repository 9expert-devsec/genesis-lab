'use server';

/**
 * CATALOG PDFs ON PROGRAM AND SKILL PAGES — sign an upload, record what
 * landed, or clear it.
 *
 * ══ THE OUTLINE ACTIONS, WITH THE LANGUAGE REMOVED ══════════════════════════
 *
 * lib/actions/course-outlines is the precedent and this follows it hop for
 * hop: a browser-direct signed upload to Cloudinary at a public_id DERIVED
 * from the entity's key, signed `overwrite: true` + `invalidate: true` so a
 * replacement lands at the same URL and is served within a second; then a
 * second call that records what actually landed. What differs: no `lang`
 * (Thai only, one file — see lib/pageCatalog), the record lands on the page
 * config row itself rather than in a side collection, and there IS a remove
 * action, because the config editor saves field-by-field rather than through
 * a form whose hidden input the outline's "clear" button could empty.
 *
 * ══ WHY ITS OWN MODULE AND NOT page-configs.js ══════════════════════════════
 * page-configs.js is the URL/SEO editor's read-and-save surface. Cloudinary
 * signing, the shared upload policy and the derived-path contract are a
 * different storage story, and keeping them in one module — as the outline
 * does — is what lets a source-scan guard assert that nothing here builds a
 * path or a public_id of its own (test/fs/pageCatalogDerivation).
 *
 * ══ requireAdmin, NOT requirePageAction ═════════════════════════════════════
 * Same reason course-outlines.js gives: the audit sweep pairs the recorded
 * menu against the requireAdmin LITERAL in the same body.
 *
 * ── THE RULE THE WHOLE FEATURE RESTS ON ─────────────────────────────────────
 * The filename and the public_id come from catalogTarget(kind, id) and are
 * never accepted from the client. `overwrite: true` means whoever names the
 * path names the asset that gets destroyed, so the only thing a caller can
 * influence is WHICH program or skill it writes to — which the page guard
 * already governs.
 *
 * ── WHAT HAPPENS TO THE OLD FILE ────────────────────────────────────────────
 * REPLACED: overwritten in place at the same public_id — nothing is orphaned,
 * and `version` counts it. REMOVED: the config's field is cleared and the
 * bytes are LEFT at the derived id, deliberately, as the outline's clear
 * does. Nothing links to that id once the field is empty (the path is derived,
 * never shared), the next upload overwrites it, and a destroy here would be a
 * second deletion idiom beside /admin/media's guarded one. The honest cost:
 * the old URL keeps resolving until a new file replaces it.
 */

import { v2 as cloudinary } from 'cloudinary';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { catalogTarget, emptyCatalog, refuseNonPdf } from '@/lib/pageCatalog';
import { refuseUpload } from '@/lib/legacyUploadPolicy.mjs';

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
 * Sign a browser-direct upload of one catalog PDF for a program or a skill.
 *
 * `filename` and `contentType` are the PICKED file's, as the browser reports
 * them, and exist only to be refused — the target's name is derived. Returns
 * the same envelope signCourseOutlineUpload does, so the client component can
 * be the outline's with the language removed.
 */
export async function signPageCatalogUpload({ kind, id, filename, contentType, bytes } = {}) {
  const session = await requireAdmin('page_configs');

  const target = catalogTarget(kind, id);
  if (!target.ok) return { ok: false, error: target.error };

  // The picked file, not the derived name: the derived name is always .pdf,
  // so a check on it would pass everything. A picker filter is a convenience;
  // this is the validation.
  const notPdf = refuseNonPdf({ filename, contentType });
  if (notPdf) return { ok: false, error: notPdf };

  // The SHARED policy for the size ceiling and the empty-file case — not a
  // second opinion that can drift from what /admin/media enforces.
  const refusal = refuseUpload({ filename: target.fileName, bytes });
  if (refusal) return { ok: false, error: refusal };

  const timestamp = Math.round(Date.now() / 1000);
  // EXACTLY the params the browser will send, or the signature will not match.
  const toSign = {
    public_id: target.publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  recordAdminActionAfter({
    menu: 'page_configs',
    action: 'update',
    entity: storeFor(target.kind).entity,
    recordId: target.key,
    recordLabel: `catalog — ${target.publicPath}`,
    after: { publicPath: target.publicPath, publicId: target.publicId, bytes: Number(bytes) || 0 },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  return {
    ok: true,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/upload`,
    apiKey: process.env.CLOUDINARY_API_KEY,
    params: { ...toSign, signature },
    resourceType: 'raw',
    publicId: target.publicId,
    publicPath: target.publicPath,
    fileName: target.fileName,
  };
}

/**
 * Record what Cloudinary accepted, on the config row. Called by the browser
 * AFTER the upload, because only the browser knows whether it finished. The
 * target is re-derived rather than trusted from the request.
 *
 * Upserts the config: a program that has never had its URL or SEO touched
 * still gets a row, keyed exactly as saveProgramConfig would key it.
 */
export async function recordPageCatalogUpload({ kind, id, bytes, contentType } = {}) {
  const session = await requireAdmin('page_configs');

  const target = catalogTarget(kind, id);
  if (!target.ok) return { ok: false, error: target.error };
  const store = storeFor(target.kind);

  try {
    await dbConnect();
    // Keyed on the id AS TYPED — that is the value page-configs.js keys on and
    // the resolver matches case-insensitively; the lowercased form belongs to
    // the path only.
    const key = String(id).trim();
    const updated = await store.Model.findOneAndUpdate(
      { [store.keyField]: key },
      {
        $set: {
          'catalogPdf.path': target.publicPath,
          'catalogPdf.bytes': Number(bytes) || 0,
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
        bytes: Number(bytes) || 0,
        contentType: String(contentType || 'application/pdf'),
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
 * Clear the catalog from a config. The button disappears; the bytes stay at
 * the derived id until the next upload overwrites them — see the header.
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
