'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import SchedulePDF from '@/models/SchedulePDF';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const KEY = 'schedule_pdf';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — generous for a PDF

async function requireAdmin() {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  return session;
}

export async function getSchedulePDF() {
  await dbConnect();
  const doc = await SchedulePDF.findOne({ key: KEY }).lean();
  return doc ? JSON.parse(JSON.stringify(doc)) : null;
}

export async function uploadSchedulePDF(formData) {
  const session = await requireAdmin();

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

  const uploaded = await uploadToCloudinary(file, 'schedule', {
    resourceType: 'raw',
    publicId: `schedule-${Date.now()}`,
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
  await requireAdmin();
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
