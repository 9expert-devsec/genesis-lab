'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic from '@/models/RegisterPublic';
import { auth } from '@/lib/auth/options';

const ADMIN_PATH = '/admin/registrations';
const PAGE_SIZE  = 20;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
}

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

// ── List (paginated + filtered) ────────────────────────────────────

/**
 * Returns one page of registrations plus pagination metadata.
 *
 * @param {object} opts
 * @param {number}  opts.page    1-indexed page number (default 1)
 * @param {string}  opts.status  filter: 'all' | 'pending' | 'confirmed' | 'paid' | 'cancelled'
 * @param {string}  opts.q       search term matched against courseName, coordinator name/email, referenceNumber suffix
 */
export async function listRegistrations({ page = 1, status = 'all', q = '' } = {}) {
  await requireAdmin();
  await dbConnect();

  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (q && q.trim()) {
    const term = q.trim();
    // Match against courseName, coordinator firstName/lastName/email,
    // or the last-8-chars reference (stored as _id suffix — match by hex).
    filter.$or = [
      { courseName:              { $regex: term, $options: 'i' } },
      { 'coordinator.firstName': { $regex: term, $options: 'i' } },
      { 'coordinator.lastName':  { $regex: term, $options: 'i' } },
      { 'coordinator.email':     { $regex: term, $options: 'i' } },
    ];
  }

  const skip  = (Math.max(1, page) - 1) * PAGE_SIZE;
  const total = await RegisterPublic.countDocuments(filter);
  const docs  = await RegisterPublic.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(PAGE_SIZE)
    .select(
      'courseName classDate scheduleType attendanceMode coordinator ' +
      'attendeesCount requestInvoice status createdAt'
    )
    .lean();

  return {
    items:    serialize(docs),
    total,
    page:     Math.max(1, page),
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

// ── Detail ─────────────────────────────────────────────────────────

export async function getRegistrationById(id) {
  await requireAdmin();
  await dbConnect();
  if (!id) return null;
  const doc = await RegisterPublic.findById(id).lean();
  return serialize(doc);
}

// ── Status update ──────────────────────────────────────────────────

const VALID_STATUSES = new Set(['pending', 'confirmed', 'paid', 'cancelled']);

export async function updateRegistrationStatus(id, status) {
  await requireAdmin();
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();
  const doc = await RegisterPublic.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}