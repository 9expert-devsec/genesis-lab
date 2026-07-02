'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import MasterclassRegistration from '@/models/MasterclassRegistration';
import MasterclassBatch        from '@/models/MasterclassBatch';
import MasterclassCourse       from '@/models/MasterclassCourse';
import { requireAdmin }         from '@/lib/actions/auth';
import { buildLicenseModel }   from '@/lib/email/buildLicenseModel';
import { recomputeBatchSeats } from '@/lib/masterclass/recomputeBatchSeats';

const ADMIN_PATH = '/admin/masterclass/registrations';
const PAGE_SIZE  = 20;          // fallback / SSR default
const MIN_PPP    = 5;
const MAX_PPP    = 100;

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

// ── List (paginated + filtered) ───────────────────────────────────

export async function listMasterclassRegistrations({
  page    = 1,
  status  = 'all',
  q       = '',
  courseId = '',
  batchId  = '',
  licenseScope = '',
  perPage = PAGE_SIZE,
} = {}) {
  await requireAdmin('mc_registrations');
  await dbConnect();

  const pageSize = Math.min(MAX_PPP, Math.max(MIN_PPP, Number(perPage) || PAGE_SIZE));

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (courseId) filter.course_id = courseId;
  if (batchId)  filter.batch_id  = batchId;
  if (licenseScope === 'all' || licenseScope === 'per_attendee') {
    filter.license_scope = licenseScope;
  }
  if (q && q.trim()) {
    const term = q.trim();
    filter.$or = [
      { course_title:            { $regex: term, $options: 'i' } },
      { 'attendee.firstName':    { $regex: term, $options: 'i' } },
      { 'attendee.lastName':     { $regex: term, $options: 'i' } },
      { 'attendee.email':        { $regex: term, $options: 'i' } },
      { 'attendee.phone':        { $regex: term, $options: 'i' } },
      { 'coordinator.firstName': { $regex: term, $options: 'i' } },
      { 'coordinator.lastName':  { $regex: term, $options: 'i' } },
      { 'coordinator.email':     { $regex: term, $options: 'i' } },
      { 'coordinator.phone':     { $regex: term, $options: 'i' } },
      { 'attendees.firstName':   { $regex: term, $options: 'i' } },
      { 'attendees.lastName':    { $regex: term, $options: 'i' } },
      { 'attendees.email':       { $regex: term, $options: 'i' } },
    ];
  }

  const skip  = (Math.max(1, page) - 1) * pageSize;
  const total = await MasterclassRegistration.countDocuments(filter);
  const docs  = await MasterclassRegistration.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .select('course_title batch_label batch_date_label venue_name coordinator attendee attendees attendeesCount attendeesListProvided license_choice license_level license_detail license_scope license_per_attendee status payment pricing createdAt')
    .lean();

  return {
    items:     serialize(docs),
    total,
    page:      Math.max(1, page),
    pageSize,
    pageCount: Math.ceil(total / pageSize),
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
  await recomputeBatchSeats(doc.batch_id);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── Delete ────────────────────────────────────────────────────────

export async function deleteMasterclassRegistration(id) {
  await requireAdmin('mc_registrations');
  await dbConnect();
  const doc = await MasterclassRegistration.findByIdAndDelete(id).lean();
  if (!doc) return { ok: false, error: 'not_found' };
  // Recompute seats from source of truth (fixes negative-count drift).
  await recomputeBatchSeats(doc.batch_id);
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

// ── Update attendees list + per-attendee license (admin edit) ─────
// `rows` is [{ firstName, lastName, email, phone, license? }] where
// license = { choice, level, detail } | null, index-aligned with attendees.
export async function updateMasterclassRegistrationAttendees(id, rows, opts = {}) {
  await requireAdmin('mc_registrations');
  await dbConnect();
  if (!id) return { ok: false, error: 'missing_id' };
  if (!Array.isArray(rows)) return { ok: false, error: 'invalid_payload' };

  const { perAttendeeIntent = false } = opts;
  const VALID_CHOICE = new Set(['own', '9expert']);

  // Sanitize attendee fields.
  const attendees = rows.map((a) => ({
    firstName: String(a?.firstName ?? '').trim(),
    lastName:  String(a?.lastName  ?? '').trim(),
    email:     String(a?.email     ?? '').trim().toLowerCase(),
    phone:     String(a?.phone     ?? '').trim(),
  }));

  // Sanitize per-attendee license (index-aligned). A row with no valid choice
  // becomes { choice: null, level: null, detail: null }.
  const licensePerAttendee = rows.map((a) => {
    const l = a?.license ?? {};
    const choice = VALID_CHOICE.has(l.choice) ? l.choice : null;
    return {
      choice,
      level:  choice === 'own'      ? (String(l.level  ?? '').trim() || null) : null,
      detail: choice === '9expert'  ? (String(l.detail ?? '').trim() || null) : null,
    };
  });

  const anyLicense = licensePerAttendee.some((l) => l.choice);

  const update = {
    attendees,
    attendeesCount: attendees.length,
  };
  // Promote to per-attendee scope ONLY when the caller signals intent (the admin
  // diverged a row from the shared license, or it was already per-attendee) AND at
  // least one valid choice exists. Otherwise leave license_scope untouched so an
  // "all" registration stays "all" on incidental saves (e.g. name edits).
  if (perAttendeeIntent && anyLicense) {
    update.license_scope        = 'per_attendee';
    update.license_per_attendee = licensePerAttendee;
  }

  const doc = await MasterclassRegistration.findByIdAndUpdate(
    id,
    { $set: update },
    { new: true }
  ).lean();
  if (!doc) return { ok: false, error: 'not_found' };
  await recomputeBatchSeats(doc.batch_id);
  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}
