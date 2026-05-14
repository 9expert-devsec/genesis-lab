'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
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

/** Returns the correct Mongoose model based on source param */
function getModel(source) {
  return source === 'inhouse' ? RegisterInhouse : RegisterPublic;
}

// ── List (paginated + filtered) ────────────────────────────────────

export async function listRegistrations({ page = 1, status = 'all', q = '', source = 'public' } = {}) {
  await requireAdmin();
  await dbConnect();

  const Model  = getModel(source);
  const filter = {};

  if (status && status !== 'all') {
    filter.status = status;
  }

  if (q && q.trim()) {
    const term = q.trim();
    if (source === 'inhouse') {
      filter.$or = [
        { companyName:        { $regex: term, $options: 'i' } },
        { contactFirstName:   { $regex: term, $options: 'i' } },
        { contactLastName:    { $regex: term, $options: 'i' } },
        { contactEmail:       { $regex: term, $options: 'i' } },
      ];
    } else {
      filter.$or = [
        { courseName:              { $regex: term, $options: 'i' } },
        { 'coordinator.firstName': { $regex: term, $options: 'i' } },
        { 'coordinator.lastName':  { $regex: term, $options: 'i' } },
        { 'coordinator.email':     { $regex: term, $options: 'i' } },
      ];
    }
  }

  const skip  = (Math.max(1, page) - 1) * PAGE_SIZE;
  const total = await Model.countDocuments(filter);

  let docs;
  if (source === 'inhouse') {
    docs = await Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .select('companyName contactFirstName contactLastName contactEmail coursesInterested participantsCount trainingFormat status createdAt')
      .lean();
  } else {
    docs = await Model.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .select('courseName classDate scheduleType attendanceMode coordinator attendeesCount requestInvoice status createdAt')
      .lean();
  }

  return {
    items:    serialize(docs),
    total,
    page:     Math.max(1, page),
    pageSize: PAGE_SIZE,
    pageCount: Math.ceil(total / PAGE_SIZE),
  };
}

// ── Detail ─────────────────────────────────────────────────────────

export async function getRegistrationById(id, source = 'public') {
  await requireAdmin();
  await dbConnect();
  if (!id) return null;
  const Model = getModel(source);
  const doc   = await Model.findById(id).lean();
  return serialize(doc);
}

// ── Status update ──────────────────────────────────────────────────

const PUBLIC_STATUSES  = new Set(['pending', 'confirmed', 'paid', 'cancelled']);
const INHOUSE_STATUSES = new Set(['new', 'contacted', 'quoted', 'closed-won', 'closed-lost']);

export async function updateRegistrationStatus(id, status, source = 'public') {
  await requireAdmin();
  const validSet = source === 'inhouse' ? INHOUSE_STATUSES : PUBLIC_STATUSES;
  if (!validSet.has(status)) return { ok: false, error: 'สถานะไม่ถูกต้อง' };

  await dbConnect();
  const Model = getModel(source);
  const doc   = await Model.findByIdAndUpdate(id, { status }, { new: true, runValidators: false });
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}

// ── Update fields ──────────────────────────────────────────────────

export async function updateRegistration(id, data, source = 'public') {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing id' };

  const update = {};

  if (source === 'inhouse') {
    // Inhouse editable fields
    const inhouseFields = [
      'coursesInterested','participantsCount','skillLevel','objective','contentMode','contentDetails',
      'scheduleMode','preferredMonth','preferredDateFrom','preferredDateTo','scheduleNote',
      'trainingFormat','onsiteAddress','onsiteProvince','onsiteDistrict','onsiteEquipment',
      'onlineRegion','onlineTimezone',
      'contactFirstName','contactLastName','contactRole','contactDepartment','companyName',
      'contactEmail','contactPhone','contactLine',
      'quotationCountry','quotationCompany','taxId','branch',
      'thaiAddress','internationalAddress','message','adminNotes',
    ];
    for (const f of inhouseFields) {
      if (data[f] !== undefined) update[f] = data[f];
    }
  } else {
    // Public editable fields
    if (data.classDate      !== undefined) update.classDate      = String(data.classDate ?? '').trim();
    if (data.scheduleType   !== undefined) update.scheduleType   = data.scheduleType;
    if (data.attendanceMode !== undefined) update.attendanceMode = data.attendanceMode;

    if (data.coordinator) {
      const c = data.coordinator;
      if (c.firstName !== undefined) update['coordinator.firstName'] = String(c.firstName).trim();
      if (c.lastName  !== undefined) update['coordinator.lastName']  = String(c.lastName).trim();
      if (c.email     !== undefined) update['coordinator.email']     = String(c.email).trim().toLowerCase();
      if (c.phone     !== undefined) update['coordinator.phone']     = String(c.phone).trim();
    }
    if (data.attendeesListProvided !== undefined) update.attendeesListProvided = Boolean(data.attendeesListProvided);
    if (data.attendeesCount !== undefined) {
      const n = parseInt(data.attendeesCount, 10);
      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;
    }
    if (data.attendees !== undefined) {
      if (!Array.isArray(data.attendees)) return { ok: false, error: 'รูปแบบข้อมูลผู้เข้าอบรมไม่ถูกต้อง' };
      for (const a of data.attendees) {
        if (!a.firstName?.trim() || !a.lastName?.trim() || !a.email?.trim() || !a.phone?.trim()) {
          return { ok: false, error: 'กรุณากรอกข้อมูลผู้เข้าอบรมให้ครบทุกช่อง' };
        }
      }
      update.attendees = data.attendees.map((a) => ({
        firstName: String(a.firstName).trim(),
        lastName:  String(a.lastName).trim(),
        email:     String(a.email).trim().toLowerCase(),
        phone:     String(a.phone).trim(),
      }));
    }
    if (data.invoice !== undefined) {
      if (data.invoice === null) {
        update.requestInvoice = false;
        update.invoice = null;
      } else {
        update.requestInvoice = true;
        const inv = data.invoice;
        if (inv.type        !== undefined) update['invoice.type']        = inv.type;
        if (inv.country     !== undefined) update['invoice.country']     = inv.country;
        if (inv.firstName   !== undefined) update['invoice.firstName']   = String(inv.firstName ?? '').trim();
        if (inv.lastName    !== undefined) update['invoice.lastName']    = String(inv.lastName ?? '').trim();
        if (inv.companyName !== undefined) update['invoice.companyName'] = String(inv.companyName ?? '').trim();
        if (inv.branch      !== undefined) update['invoice.branch']      = String(inv.branch ?? '').trim();
        if (inv.taxId       !== undefined) update['invoice.taxId']       = String(inv.taxId ?? '').trim();
        if (inv.thaiAddress !== undefined) {
          update['invoice.thaiAddress'] = inv.thaiAddress;
          if (inv.country === 'TH') update['invoice.internationalAddress'] = null;
        }
        if (inv.internationalAddress !== undefined) {
          update['invoice.internationalAddress'] = inv.internationalAddress;
          if (inv.country === 'OTHER') update['invoice.thaiAddress'] = null;
        }
      }
    }
    if (data.notes !== undefined) {
      update.notes = String(data.notes ?? '').trim().slice(0, 500) || undefined;
    }
  }

  if (Object.keys(update).length === 0) return { ok: false, error: 'ไม่มีข้อมูลที่จะอัปเดต' };

  await dbConnect();
  const Model = getModel(source);
  const doc   = await Model.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: false });
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  revalidatePath(`${ADMIN_PATH}/${id}`);
  return { ok: true };
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteRegistration(id, source = 'public') {
  await requireAdmin();
  if (!id) return { ok: false, error: 'Missing id' };

  await dbConnect();
  const Model = getModel(source);
  const doc   = await Model.findByIdAndDelete(id);
  if (!doc) return { ok: false, error: 'ไม่พบรายการ' };

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── Status counts for stat strip ──────────────────────────────────

export async function getRegistrationStatusCounts({ range = 'all', source = 'public' } = {}) {
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

  const dateFilter = from ? { createdAt: { $gte: from } } : {};
  const Model = getModel(source);

  if (source === 'inhouse') {
    const [total, newCount, contacted, closedWon, closedLost] = await Promise.all([
      Model.countDocuments(dateFilter),
      Model.countDocuments({ ...dateFilter, status: 'new' }),
      Model.countDocuments({ ...dateFilter, status: 'contacted' }),
      Model.countDocuments({ ...dateFilter, status: 'closed-won' }),
      Model.countDocuments({ ...dateFilter, status: 'closed-lost' }),
    ]);
    return serialize({ total, new: newCount, contacted, closedWon, closedLost, range, source });
  } else {
    const [total, pending, confirmed, paid, cancelled] = await Promise.all([
      Model.countDocuments(dateFilter),
      Model.countDocuments({ ...dateFilter, status: 'pending' }),
      Model.countDocuments({ ...dateFilter, status: 'confirmed' }),
      Model.countDocuments({ ...dateFilter, status: 'paid' }),
      Model.countDocuments({ ...dateFilter, status: 'cancelled' }),
    ]);
    return serialize({ total, pending, confirmed, paid, cancelled, range, source });
  }
}