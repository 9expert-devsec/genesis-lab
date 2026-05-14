'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterInhouse from '@/models/RegisterInhouse';
import { auth } from '@/lib/auth/options';

const ADMIN_LIST_PATH   = '/admin/registrations';
const ADMIN_DETAIL_PATH = '/admin/registrations/inhouse';
const PAGE_SIZE         = 20;

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
 * Returns one page of in-house registrations plus pagination metadata.
 *
 * @param {object} opts
 * @param {number}  opts.page    1-indexed page number (default 1)
 * @param {string}  opts.status  filter: 'all' | 'new' | 'contacted' | 'quoted' | 'closed-won' | 'closed-lost'
 * @param {string}  opts.q       search term matched against companyName, contact name/email
 */
export async function listInhouseRegistrations({ page = 1, status = 'all', q = '' } = {}) {
  await requireAdmin();
  await dbConnect();

  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (q && q.trim()) {
    const term = q.trim();
    filter.$or = [
      { companyName:      { $regex: term, $options: 'i' } },
      { contactFirstName: { $regex: term, $options: 'i' } },
      { contactLastName:  { $regex: term, $options: 'i' } },
      { contactEmail:     { $regex: term, $options: 'i' } },
    ];
  }

  const skip  = (Math.max(1, page) - 1) * PAGE_SIZE;
  const total = await RegisterInhouse.countDocuments(filter);
  const docs  = await RegisterInhouse.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(PAGE_SIZE)
    .select(
      'companyName contactFirstName contactLastName contactEmail contactPhone ' +
      'coursesInterested participantsCount trainingFormat status createdAt'
    )
    .lean();

  return {
    items:     serialize(docs),
    total,
    page:      Math.max(1, page),
    pageSize:  PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

// ── Detail ─────────────────────────────────────────────────────────

export async function getInhouseRegistrationById(id) {
  await requireAdmin();
  await dbConnect();
  if (!id) return null;
  const doc = await RegisterInhouse.findById(id).lean();
  return serialize(doc);
}

// ── Status update ──────────────────────────────────────────────────

const VALID_STATUSES = new Set(['new', 'contacted', 'quoted', 'closed-won', 'closed-lost']);

export async function updateInhouseStatus(id, status) {
  await requireAdmin();
  if (!VALID_STATUSES.has(status)) {
    return { ok: false, error: 'สถานะไม่ถูกต้อง' };
  }
  await dbConnect();
  const doc = await RegisterInhouse.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(ADMIN_LIST_PATH);
  revalidatePath(`${ADMIN_DETAIL_PATH}/${id}`);
  return { ok: true };
}

// ── Admin notes update ─────────────────────────────────────────────

export async function updateInhouseAdminNotes(id, adminNotes) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const doc = await RegisterInhouse.findByIdAndUpdate(
    id,
    { adminNotes: String(adminNotes ?? '').trim().slice(0, 2000) || undefined },
    { new: true, runValidators: false }
  );
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(`${ADMIN_DETAIL_PATH}/${id}`);
  return { ok: true };
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteInhouseRegistration(id) {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing id' };
  await dbConnect();
  const doc = await RegisterInhouse.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };
  revalidatePath(ADMIN_LIST_PATH);
  return { ok: true };
}

// ── Stat strip counts ──────────────────────────────────────────────

/**
 * Returns status counts for the in-house stat strip.
 * @param {'today'|'week'|'month'|'all'} range
 */
export async function getInhouseStatusCounts({ range = 'all' } = {}) {
  await requireAdmin();
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
  const base = from ? { createdAt: { $gte: from } } : {};

  const [total, isNew, contacted, quoted, closedWon, closedLost] = await Promise.all([
    RegisterInhouse.countDocuments(base),
    RegisterInhouse.countDocuments({ ...base, status: 'new' }),
    RegisterInhouse.countDocuments({ ...base, status: 'contacted' }),
    RegisterInhouse.countDocuments({ ...base, status: 'quoted' }),
    RegisterInhouse.countDocuments({ ...base, status: 'closed-won' }),
    RegisterInhouse.countDocuments({ ...base, status: 'closed-lost' }),
  ]);

  return serialize({
    total,
    new: isNew,
    contacted,
    quoted,
    closedWon,
    closedLost,
    range,
  });
}