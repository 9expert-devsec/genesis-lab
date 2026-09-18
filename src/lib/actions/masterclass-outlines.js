'use server';
/**
 * MASTERCLASS OUTLINE PDF — sign a browser-direct upload to /files.
 *
 * A fork of course-outlines.js with one step instead of two. The template's
 * second step (`record…Upload`) exists to write its ledger collection
 * (CourseOutlineFile) and the course version history; there is no ledger
 * here, on purpose:
 *
 *   · MasterclassCourse is genesis-owned — no MSDB, no sync that could
 *     overwrite the stored path — so `course_outline_url` on the course row
 *     IS the record of which file the page links to, and the form save that
 *     writes it already records an audit row with the value in `after`.
 *   · There is no masterclass version history to feed, and nothing reads a
 *     per-upload bytes/version log for masterclasses.
 *
 * Adding a collection nobody reads would be a copy of the template's shape
 * without its reason. The sign step records its own audit row (signing a
 * destructive overwrite is an event) and that, plus the course save, is the
 * whole trail.
 *
 * ── THE RULE THE WHOLE FEATURE RESTS ON ─────────────────────────────────────
 * The filename and the public_id are DERIVED from (slug, lang) by
 * src/lib/masterclass/masterclassOutline.js and never accepted from the
 * client. Uploads are signed with overwrite:true, so whoever names the path
 * names the asset that gets destroyed. test/fs/masterclassOutlineDerivation
 * asserts nothing here builds a path or a public_id of its own.
 */
import { v2 as cloudinary } from 'cloudinary';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import {
  isMasterclassOutlineLang,
  masterclassOutlineFileName,
  masterclassOutlinePublicPath,
  masterclassOutlineSlugKey,
} from '@/lib/masterclass/masterclassOutline';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';
import { extensionOf, refuseUpload } from '@/lib/legacyUploadPolicy.mjs';

function deriveOutlineTarget(slug, lang) {
  if (!isMasterclassOutlineLang(lang)) {
    return { ok: false, error: `ภาษาไม่ถูกต้อง (${String(lang)}) — รองรับเฉพาะ th และ en` };
  }
  const key = masterclassOutlineSlugKey(slug);
  if (!key.ok) return { ok: false, error: key.reason };
  const language = String(lang).toLowerCase();
  const fileName = masterclassOutlineFileName(key.value, language);
  const publicPath = masterclassOutlinePublicPath(key.value, language);
  const { publicId } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);
  return { ok: true, slugKey: key.value, lang: language, fileName, publicPath, publicId };
}

/**
 * Sign a browser-direct upload to the derived public_id. Writes nothing of
 * ours; the form save writes `course_outline_url` = `publicPath`.
 */
export async function signMasterclassOutlineUpload({ courseId, slug, lang, bytes } = {}) {
  const session = await requireAdmin('masterclass');

  const target = deriveOutlineTarget(slug, lang);
  if (!target.ok) return { ok: false, error: target.error };

  const refusal = refuseUpload({ filename: target.fileName, bytes });
  if (refusal) return { ok: false, error: refusal };
  if (extensionOf(target.fileName) !== 'pdf') {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ PDF' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  // overwrite + invalidate are in the SIGNED set, so the browser cannot drop
  // them: a request without them fails the signature check.
  const toSign = {
    public_id: target.publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  recordAdminActionAfter({
    menu: 'masterclass',
    action: 'update',
    entity: 'course',
    recordId: String(courseId || target.slugKey),
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
