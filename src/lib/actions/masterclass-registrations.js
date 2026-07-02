'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import MasterclassBatch        from '@/models/MasterclassBatch';
import MasterclassCourse       from '@/models/MasterclassCourse';
import { requireAdmin }         from '@/lib/actions/auth';
import { buildLicenseModel }   from '@/lib/email/buildLicenseModel';

const ADMIN_PATH = '/admin/masterclass/registrations';
const PAGE_SIZE  = 20;

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

// ── List (paginated + filtered) ───────────────────────────────────

export async function listMasterclassRegistrations({
  page    = 1,
  status  = 'all',
  q       = '',
  courseId = '',
  batchId  = '',
} = {}) {
  await requireAdmin('mc_registrations');
  await dbConnect();

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (courseId) filter.course_id = courseId;
  if (batchId)  filter.batch_id  = batchId;
  if (q && q.trim()) {
    const term = q.trim();
    filter.$or = [
      { course_title:          { $regex: term, $options: 'i' } },
      { 'attendee.firstName':  { $regex: term, $options: 'i' } },
      { 'attendee.lastName':   { $regex: term, $options: 'i' } },
      { 'attendee.email':      { $regex: term, $options: 'i' } },
      { 'attendee.phone':      { $regex: term, $options: 'i' } },
    ];
  }

  const skip  = (Math.max(1, page) - 1) * PAGE_SIZE;
  const total = await MasterclassRegistration.countDocuments(filter);
  const docs  = await MasterclassRegistration.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(PAGE_SIZE)
    .select('course_title batch_label batch_date_label venue_name attendee license_choice license_level status payment pricing createdAt')
    .lean();

  return {
    items:     serialize(docs),
    total,
    page:      Math.max(1, page),
    pageSize:  PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

// ── Status counts ─────────────────────────────────────────────────

export async function getMasterclassRegStatusCounts({ range = 'all' } = {}) {
  await requireAdmin('mc_registrations');
  await dbConnect();

  const now = new Date();
  let from = null;
  if (range === 'today') {
    from = new Date(now); from.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  } else if (range === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }
  const dateFilter = from ? { createdAt: { $gte: from } } : {};

  const [total, pending, confirmed, paid, cancelled] = await Promise.all([
    MasterclassRegistration.countDocuments(dateFilter),
    MasterclassRegistration.countDocuments({ ...dateFilter, status: 'pending' }),
    MasterclassRegistration.countDocuments({ ...dateFilter, status: 'confirmed' }),
    MasterclassRegistration.countDocuments({ ...dateFilter, status: 'paid' }),
    MasterclassRegistration.countDocuments({ ...dateFilter, status: 'cancelled' }),
  ]);
  return serialize({ total, pending, confirmed, paid, cancelled, range });
}

// ── Single registration ───────────────────────────────────────────

export async function getMasterclassRegistrationById(id) {
  await requireAdmin('mc_registrations');
  await dbConnect();
  if (!id) return null;
  const doc = await MasterclassRegistration.findById(id).lean();
  if (!doc) return null;
  // Compute a license-summary view-field (incl. conditions) for admin parity.
  // Not stored — derived from the course's license_options on read.
  const courseDoc = await MasterclassCourse.findById(doc.course_id)
    .select('license_options')
    .lean();
  const out = serialize(doc);
  out.licenseSummary = buildLicenseModel(doc, courseDoc); // flat model | null
  return out;
}

// ── Update status ─────────────────────────────────────────────────

export async function updateMasterclassRegistrationStatus(id, newStatus) {
  await requireAdmin('mc_registrations');
  if (!['pending', 'confirmed', 'paid', 'cancelled'].includes(newStatus)) {
    return { ok: false, error: 'invalid_status' };
  }
  await dbConnect();
  const doc = await MasterclassRegistration.findByIdAndUpdate(
    id,
    { $set: { status: newStatus } },
    { new: true }
  ).lean();
  if (!doc) return { ok: false, error: 'not_found' };
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── Delete ────────────────────────────────────────────────────────

export async function deleteMasterclassRegistration(id) {
  await requireAdmin('mc_registrations');
  await dbConnect();
  const doc = await MasterclassRegistration.findByIdAndDelete(id).lean();
  if (!doc) return { ok: false, error: 'not_found' };
  // Decrement registered_count on the batch
  await MasterclassBatch.findByIdAndUpdate(doc.batch_id, {
    $inc: { registered_count: -1 },
  });
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── Course + batch selectors (for filter dropdowns) ───────────────

export async function getMasterclassCourseOptions() {
  await requireAdmin('mc_registrations');
  await dbConnect();
  const docs = await MasterclassCourse.find({ is_published: true })
    .select('_id title_th')
    .sort({ display_order: 1 })
    .lean();
  return serialize(docs);
}

export async function getMasterclassBatchOptions(courseId) {
  await requireAdmin('mc_registrations');
  await dbConnect();
  const filter = courseId ? { course_id: courseId } : {};
  const docs = await MasterclassBatch.find(filter)
    .select('_id batch_label batch_no course_id')
    .sort({ batch_no: 1 })
    .lean();
  return serialize(docs);
}
