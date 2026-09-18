'use server';
/**
 * THE SCHEDULE PDF — one file, one fixed address, signed direct upload.
 *
 *   /files/schedule/9expert-training-schedule.pdf
 *
 * Same shape as the course / career-path / masterclass outline uploads: the
 * server derives the path (there is exactly one, and it never changes), signs
 * a browser-direct Cloudinary upload with overwrite + invalidate, and records
 * what landed. The bytes never pass through a server action any more, so the
 * old 25 MB `MAX_BYTES` and the FormData upload are gone; size is refused at
 * the sign step by the shared `refuseUpload` (10 MB raw), and its Thai message
 * is returned to the admin UI.
 *
 * ── WHY A FIXED NAME AND NO TIMESTAMP ────────────────────────────────────────
 * The site links to ONE schedule. A timestamped name meant a new asset per
 * upload and a stored secure_url that changed every time; the previous file
 * was supposed to be destroyed afterwards and never was (the destroy call
 * omitted `resource_type: 'raw'` — every generation since April is still in
 * Cloudinary). A fixed public_id with `overwrite: true` replaces the bytes in
 * place and `invalidate: true` purges the CDN copy; nothing needs cleaning up
 * because nothing accumulates. The `/files/` document rule in next.config
 * already holds these paths out of the edge cache, so the new bytes are what
 * the next visitor gets.
 *
 * The stored `url` is now the ROOT-RELATIVE path. Both consumers (/schedule's
 * HeroPdfButton and the admin's เปิดไฟล์ link) put it straight into `href`, so
 * the old absolute secure_url keeps working until the first upload replaces it.
 */
import { v2 as cloudinary } from 'cloudinary';
import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import SchedulePDF from '@/models/SchedulePDF';
import { requireAdmin } from '@/lib/actions/auth';
import { recordAdminActionAfter } from '@/lib/audit/recordAdminAction';
import { SCHEDULE_PDF_FILE_NAME, schedulePdfPublicPath } from '@/lib/schedule/schedulePdf';
import { LEGACY_PUBLIC_ID_PREFIX, legacyPathToPublicId } from '@/lib/legacyPublicId';
import { extensionOf, refuseUpload } from '@/lib/legacyUploadPolicy.mjs';

const KEY = 'schedule_pdf';

function revalidate() {
  revalidatePath('/schedule');
  revalidatePath('/admin/schedule-pdf');
}

function deriveTarget() {
  const fileName = SCHEDULE_PDF_FILE_NAME;
  const publicPath = schedulePdfPublicPath();
  const { publicId } = legacyPathToPublicId(publicPath, 'raw', LEGACY_PUBLIC_ID_PREFIX);
  return { fileName, publicPath, publicId };
}

export async function getSchedulePDF() {
  await dbConnect();
  const doc = await SchedulePDF.findOne({ key: KEY }).lean();
  return doc ? JSON.parse(JSON.stringify(doc)) : null;
}

/** Step 1 — sign the browser-direct upload to the one fixed public_id. */
export async function signSchedulePDFUpload({ bytes } = {}) {
  const session = await requireAdmin('schedule_pdf');

  const target = deriveTarget();
  const refusal = refuseUpload({ filename: target.fileName, bytes });
  if (refusal) return { ok: false, error: refusal };
  if (extensionOf(target.fileName) !== 'pdf') {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ PDF' };
  }

  const timestamp = Math.round(Date.now() / 1000);
  const toSign = {
    public_id: target.publicId,
    timestamp,
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  const signature = cloudinary.utils.api_sign_request(toSign, process.env.CLOUDINARY_API_SECRET);

  recordAdminActionAfter({
    menu: 'schedule_pdf',
    action: 'update',
    entity: 'pdf',
    recordId: KEY,
    recordLabel: `schedule PDF — ${target.publicPath}`,
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
 * Step 2 — the browser reports that Cloudinary accepted the bytes; store the
 * path and the same metadata the old action stored (original filename,
 * uploadedAt, uploadedBy), and revalidate the two pages that read it.
 */
export async function recordSchedulePDFUpload({ filename, bytes, contentType } = {}) {
  const session = await requireAdmin('schedule_pdf');
  const target = deriveTarget();

  await dbConnect();
  await SchedulePDF.findOneAndUpdate(
    { key: KEY },
    {
      url: target.publicPath,
      publicId: target.publicId,
      filename: String(filename ?? ''),
      uploadedAt: new Date(),
      uploadedBy: session.user?.email ?? '',
    },
    { upsert: true, new: true }
  );

  recordAdminActionAfter({
    menu: 'schedule_pdf',
    action: 'update',
    entity: 'pdf',
    recordId: KEY,
    recordLabel: `schedule PDF landed — ${target.publicPath}`,
    after: {
      publicPath: target.publicPath,
      filename: String(filename ?? ''),
      bytes: Number(bytes) || 0,
      contentType: String(contentType || 'application/pdf'),
    },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  revalidate();
  return { ok: true, url: target.publicPath };
}

/**
 * Forget the schedule PDF: the row goes, the button disappears. The asset is
 * NOT touched — the next upload overwrites it in place, and an admin who
 * deletes by mistake loses only the link, not the file.
 */
export async function deleteSchedulePDF() {
  const session = await requireAdmin('schedule_pdf');
  await dbConnect();
  const doc = await SchedulePDF.findOne({ key: KEY }).lean();
  if (!doc) return { ok: true };
  await SchedulePDF.deleteOne({ key: KEY });

  recordAdminActionAfter({
    menu: 'schedule_pdf',
    action: 'delete',
    entity: 'pdf',
    recordId: KEY,
    recordLabel: `schedule PDF link removed — ${doc.url ?? ''}`,
    before: { url: doc.url ?? '', filename: doc.filename ?? '' },
    actor: { id: session.user?.id, name: session.user?.name },
  });

  revalidate();
  return { ok: true };
}
