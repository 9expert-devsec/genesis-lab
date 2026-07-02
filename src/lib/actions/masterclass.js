'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import MasterclassCourse   from '@/models/MasterclassCourse';
import MasterclassBatch    from '@/models/MasterclassBatch';
import { requireAdmin }    from '@/lib/actions/auth';

function serialize(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

const ADMIN_COURSE_PATH  = '/admin/masterclass';
const PUBLIC_LISTING     = '/masterclass';

function bustCaches(slug) {
  revalidatePath(ADMIN_COURSE_PATH);
  revalidatePath(PUBLIC_LISTING);
  if (slug) revalidatePath(`${PUBLIC_LISTING}/${slug}`);
}

// ── MasterclassCourse ─────────────────────────────────────────────────────────

export async function createMasterclassCourse(data) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.create(data);
  bustCaches();
  return { ok: true, id: String(doc._id) };
}

export async function updateMasterclassCourse(id, data) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true }
  ).lean();
  if (!doc) return { ok: false, error: 'Not found' };
  bustCaches(doc.slug);
  return { ok: true };
}

export async function deleteMasterclassCourse(id) {
  await requireAdmin('masterclass');
  await dbConnect();
  const doc = await MasterclassCourse.findByIdAndDelete(id).lean();
  if (doc?.slug) bustCaches(doc.slug);
  // Also delete all batches for this course
  await MasterclassBatch.deleteMany({ course_id: id });
  return { ok: true };
}

// ── MasterclassBatch ──────────────────────────────────────────────────────────

export async function createMasterclassBatch(courseId, data) {
  await requireAdmin('masterclass');
  await dbConnect();
  // Auto-increment batch_no if not provided
  if (!data.batch_no) {
    const last = await MasterclassBatch.findOne({ course_id: courseId })
      .sort({ batch_no: -1 })
      .lean();
    data.batch_no = (last?.batch_no ?? 0) + 1;
  }
  if (!data.batch_label) {
    data.batch_label = `รุ่นที่ ${data.batch_no}`;
  }
  // Populate course_slug from the course doc if not provided
  if (!data.course_slug) {
    const courseDoc = await MasterclassCourse.findById(courseId).select('slug').lean();
    if (courseDoc?.slug) data.course_slug = courseDoc.slug;
  }
  const doc = await MasterclassBatch.create({ ...data, course_id: courseId });
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true, id: String(doc._id) };
}

export async function updateMasterclassBatch(batchId, data) {
  await requireAdmin('masterclass');
  await dbConnect();

  // Auto-compute status if status_override is false
  const existing = await MasterclassBatch.findById(batchId).lean();
  if (!existing) return { ok: false, error: 'Not found' };

  if (!data.status_override && data.status_override !== undefined ? !data.status_override : !existing.status_override) {
    const regCount = data.registered_count ?? existing.registered_count;
    const cap      = data.capacity        ?? existing.capacity;
    if (regCount >= cap) {
      data.status = 'full';
    } else if (existing.status === 'full') {
      data.status = 'open';
    }
  }

  await MasterclassBatch.findByIdAndUpdate(batchId, { $set: data });
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true };
}

export async function deleteMasterclassBatch(batchId) {
  await requireAdmin('masterclass');
  await dbConnect();
  await MasterclassBatch.findByIdAndDelete(batchId);
  revalidatePath(ADMIN_COURSE_PATH);
  return { ok: true };
}

// LocalFaq actions moved to src/lib/actions/local-faqs.js (per-course scoping).
