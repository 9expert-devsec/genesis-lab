'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import SchedulePDF from '@/models/SchedulePDF';
import { requireAdmin } from '@/lib/actions/auth';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const KEY = 'schedule_pdf';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — generous for a PDF

export async function getSchedulePDF() {
  await dbConnect();
  const doc = await SchedulePDF.findOne({ key: KEY }).lean();
  return doc ? JSON.parse(JSON.stringify(doc)) : null;
}

export async function uploadSchedulePDF(formData) {
  const session = await requireAdmin('schedule_pdf');

  const file = formData.get('file');
  if (!file || typeof file !== 'object' || !file.size) {
    return { ok: false, error: 'ไม่ได้แนบไฟล์' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `ไฟล์ใหญ่เกิน ${MAX_BYTES / 1024 / 1024} MB` };
  }
  if (file.type && file.type !== 'application/pdf') {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ PDF' };
  }

  await dbConnect();
  const previous = await SchedulePDF.findOne({ key: KEY }).lean();

  /**
   * THE `.pdf` IS LOAD-BEARING — it is what makes the file open instead of save.
   *
   * For `resource_type: 'raw'` Cloudinary does NOT keep a separate `format`
   * field the way it does for images: the public_id IS the delivery path, so an
   * extensionless public_id produces an extensionless URL, and with nothing to
   * infer a type from Cloudinary answers
   *
   *   content-type: application/octet-stream
   *   content-disposition: attachment; filename="schedule-1777452321941"
   *
   * A browser must save that. No markup can override it — /schedule's button
   * already carries `target="_blank"` and no `download` attribute, and the file
   * downloaded anyway, because the header wins. Measured against this account,
   * uploading the same PDF three ways:
   *
   *   public_id `x`            → application/octet-stream + attachment
   *   public_id `x.pdf`        → application/pdf, no disposition
   *   public_id `x` + format   → application/pdf, no disposition
   *
   * The last two are the same thing: for a raw upload `format: 'pdf'` simply
   * appends the extension to the stored public_id, so both end up at `x.pdf`.
   * The suffix is chosen over `format` because `uploadToCloudinary` already
   * passes `publicId` through, so this stays one token in one file — widening
   * the shared helper with a `format` option would touch every other caller of
   * it for no additional behaviour.
   *
   * `uploaded.public_id` therefore comes back WITH the extension and is what
   * gets stored, so the delete path keeps addressing the same asset.
   */
  const uploaded = await uploadToCloudinary(file, 'schedule', {
    resourceType: 'raw',
    publicId: `schedule-${Date.now()}.pdf`,
  });

  await SchedulePDF.findOneAndUpdate(
    { key: KEY },
    {
      url: uploaded.secure_url,
      publicId: uploaded.public_id,
      filename: file.name ?? '',
      uploadedAt: new Date(),
      uploadedBy: session.user?.email ?? '',
    },
    { upsert: true, new: true }
  );

  // Best-effort cleanup of the previous file. We don't fail the upload
  // if the destroy fails — the new doc is already saved.
  if (previous?.publicId) {
    deleteFromCloudinary(previous.publicId).catch(() => {});
  }

  revalidatePath('/schedule');
  revalidatePath('/admin/schedule-pdf');
  return { ok: true, url: uploaded.secure_url };
}

export async function deleteSchedulePDF() {
  await requireAdmin('schedule_pdf');
  await dbConnect();
  const doc = await SchedulePDF.findOne({ key: KEY });
  if (!doc) return { ok: true };
  if (doc.publicId) {
    deleteFromCloudinary(doc.publicId).catch(() => {});
  }
  await SchedulePDF.deleteOne({ key: KEY });
  revalidatePath('/schedule');
  revalidatePath('/admin/schedule-pdf');
  return { ok: true };
}
