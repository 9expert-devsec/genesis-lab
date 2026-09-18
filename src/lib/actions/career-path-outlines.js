'use server';
/**
 * CAREER-PATH OUTLINE PDFs — sign an upload, then record what landed.
 *
 * A one-for-one mirror of course-outlines.js, for the same reasons that module
 * gives for standing apart from courses.js: career-paths.js writes through
 * MSDB and never touches Mongo, and this feature's storage story is Cloudinary
 * for the bytes + Mongo for the ledger + MSDB never involved. The PATH that
 * MSDB stores (`links.outlineUrl`) travels through the form save, exactly as
 * the course outline path travels through shapePayload().
 *
 * ── THE RULE THE WHOLE FEATURE RESTS ON ─────────────────────────────────────
 * The filename and the public_id are DERIVED from (api_slug, lang) by
 * src/lib/career-paths/careerPathOutline.js and never accepted from the client.
 * Uploads are signed with overwrite:true, so whoever names the path names the
 * asset that gets destroyed — and MEASURED 2026-09-18, the ten existing
 * career-path outlines sit at exactly the public_id this derives (10/10 via
 * the Admin API), so an upload replaces the file rather than minting a second
 * one beside it. test/fs/careerPathOutlineDerivation.test.mjs asserts nothing
 * here builds a path or a public_id of its own.
 *
 * ── requireAdmin('career_paths'), the menu the form is under ────────────────
 * The audit rows record the same literal, which is what the coverage guard
 * pairs against.
 */
import { v2 as cloudinary } from 'cloudinary';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { dbConnect } from '@/lib/db/connect';
import CareerPathOutlineFile from '@/models/CareerPathOutlineFile';
import {
  careerOutlineFileName,
  careerOutlinePublicPath,
  careerOutlineSlugKey,
  isCareerOutlineLang,
} from '@/lib/career-paths/careerPathOutline';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';
import { extensionOf, refuseUpload } from '@/lib/legacyUploadPolicy.mjs';

/**
 * (api_slug, lang) → everything the upload needs, or a refusal. The only place
 * in this module that knows what a target looks like, and it knows it by
 * delegating.
 */
function deriveOutlineTarget(apiSlug, lang) {
  if (!isCareerOutlineLang(lang)) {
    return { ok: false, error: `ภาษาไม่ถูกต้อง (${String(lang)}) — รองรับเฉพาะ th และ en` };
  }
  const key = careerOutlineSlugKey(apiSlug);
  if (!key.ok) return { ok: false, error: key.reason };
  const language = String(lang).toLowerCase();
  const fileName = careerOutlineFileName(key.value, language);
  const publicPath = careerOutlinePublicPath(key.value, language);
  const { publicId } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);
  return { ok: true, slugKey: key.value, lang: language, fileName, publicPath, publicId };
}

/**
 * Step 1 — sign a browser-direct upload to the derived public_id.
 *
 * Writes nothing of ours (not Mongo, not MSDB) but records an audit row all
 * the same: signing a destructive overwrite is an event worth a line whether
 * or not the bytes ever arrive.
 */
export async function signCareerPathOutlineUpload({ careerPathId, apiSlug, lang, bytes } = {}) {
  const session = await requireAdmin('career_paths');

  const target = deriveOutlineTarget(apiSlug, lang);
  if (!target.ok) return { ok: false, error: target.error };

  const refusal = refuseUpload({ filename: target.fileName, bytes });
  if (refusal) return { ok: false, error: refusal };
  if (extensionOf(target.fileName) !== 'pdf') {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ PDF' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  // overwrite + invalidate are in the SIGNED set, so the browser cannot drop
  // them: a request without them would fail the signature check.
  const toSign = {
    public_id: target.publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  recordAdminActionAfter({
    menu: 'career_paths',
    action: 'update',
    entity: 'career_path',
    recordId: String(careerPathId || target.slugKey),
    recordLabel: `outline ${target.lang.toUpperCase()} — ${target.publicPath}`,
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
 * Step 2 — the browser reports that Cloudinary accepted the bytes; record the
 * ledger row. The public LINK is not written here: the form carries
 * `publicPath` into `links.outlineUrl` and the save writes it to MSDB.
 */
export async function recordCareerPathOutlineUpload({ careerPathId, apiSlug, lang, bytes, contentType } = {}) {
  const session = await requireAdmin('career_paths');

  const target = deriveOutlineTarget(apiSlug, lang);
  if (!target.ok) return { ok: false, error: target.error };

  try {
    await dbConnect();
    const updated = await CareerPathOutlineFile.findOneAndUpdate(
      { slugKey: target.slugKey, lang: target.lang },
      {
        $set: {
          careerPathId: String(careerPathId || ''),
          publicId: target.publicId,
          legacyPath: target.publicPath,
          bytes: Number(bytes) || 0,
          contentType: String(contentType || 'application/pdf'),
          uploadedAt: new Date(),
          uploadedBy: String(session.user?.name || session.user?.id || ''),
        },
        $inc: { version: 1 },
        $setOnInsert: { slugKey: target.slugKey, lang: target.lang },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    recordAdminActionAfter({
      menu: 'career_paths',
      action: 'update',
      entity: 'career_path',
      recordId: String(careerPathId || target.slugKey),
      recordLabel: `outline ${target.lang.toUpperCase()} v${updated?.version ?? 1} — ${target.publicPath}`,
      after: { publicPath: target.publicPath, bytes: Number(bytes) || 0, version: updated?.version ?? 1 },
      actor: { id: session.user?.id, name: session.user?.name },
    });

    return { ok: true, publicPath: target.publicPath, version: updated?.version ?? 1 };
  } catch (err) {
    return {
      ok: false,
      recorded: false,
      publicPath: target.publicPath,
      error: `อัปโหลดสำเร็จ แต่บันทึกประวัติไม่สำเร็จ — ${err?.message ?? err}`,
    };
  }
}
