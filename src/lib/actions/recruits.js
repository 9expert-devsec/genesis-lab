'use server';

/**
 * Server actions for /join-us recruits — multi-doc CRUD with slug
 * auto-generation. Reads are public; writes require an authenticated
 * admin session. Mirrors src/lib/actions/about.js for shape and error
 * handling.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Recruit from '@/models/Recruit';
import { auth } from '@/lib/auth/options';

const PUBLIC_PATH = '/join-us';
const ADMIN_PATH  = '/admin/recruits';

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

function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function cleanList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0);
}

const VALID_TYPES = new Set(['full-time', 'part-time', 'contract', 'internship']);

// ── Public reads ───────────────────────────────────────────────────

export async function getActiveRecruits() {
  await dbConnect();
  const docs = await Recruit.find({ active: true })
    .sort({ order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}

// ── Admin reads ────────────────────────────────────────────────────

export async function getAllRecruits() {
  await requireAdmin();
  await dbConnect();
  const docs = await Recruit.find({})
    .sort({ order: 1, createdAt: -1 })
    .lean();
  return serialize(docs);
}

export async function getRecruitById(id) {
  await requireAdmin();
  await dbConnect();
  if (!id) return null;
  const doc = await Recruit.findById(id).lean();
  return serialize(doc);
}

// ── Writes ────────────────────────────────────────────────────────

export async function createRecruit(data) {
  await requireAdmin();
  await dbConnect();

  const title = String(data?.title ?? '').trim();
  const description = String(data?.description ?? '').trim();
  if (!title) return { ok: false, error: 'กรุณากรอกชื่อตำแหน่ง' };
  if (!description) return { ok: false, error: 'กรุณากรอกคำอธิบายตำแหน่ง' };

  let slug = slugify(data?.slug || title);
  if (!slug) slug = `position-${Date.now()}`;

  const employmentType = VALID_TYPES.has(data?.employmentType)
    ? data.employmentType
    : 'full-time';

  const last = await Recruit.findOne({})
    .sort({ order: -1 })
    .select('order')
    .lean();
  const order = (last?.order ?? -1) + 1;

  const payload = {
    slug,
    title,
    department:      String(data?.department ?? '').trim(),
    location:        String(data?.location ?? '').trim(),
    employmentType,
    description,
    responsibilities: cleanList(data?.responsibilities),
    qualifications:   cleanList(data?.qualifications),
    benefits:         cleanList(data?.benefits),
    applyEmail:      String(data?.applyEmail ?? '').trim(),
    active:          data?.active === false ? false : true,
    order,
  };

  try {
    const doc = await Recruit.create(payload);
    revalidatePath(PUBLIC_PATH);
    revalidatePath(ADMIN_PATH);
    return { ok: true, data: serialize(doc) };
  } catch (err) {
    if (err?.code === 11000) {
      // Retry once with timestamped slug to dodge the collision.
      try {
        const doc = await Recruit.create({ ...payload, slug: `${slug}-${Date.now()}` });
        revalidatePath(PUBLIC_PATH);
        revalidatePath(ADMIN_PATH);
        return { ok: true, data: serialize(doc) };
      } catch {
        return { ok: false, error: 'slug ซ้ำ กรุณาแก้ไข slug' };
      }
    }
    return { ok: false, error: err?.message || 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateRecruit(id, data) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const update = {};
  if (data?.title !== undefined) {
    const title = String(data.title).trim();
    if (!title) return { ok: false, error: 'กรุณากรอกชื่อตำแหน่ง' };
    update.title = title;
  }
  if (data?.slug !== undefined) {
    const slug = slugify(data.slug);
    if (!slug) return { ok: false, error: 'slug ไม่ถูกต้อง' };
    update.slug = slug;
  }
  if (data?.department !== undefined) update.department = String(data.department).trim();
  if (data?.location !== undefined)   update.location   = String(data.location).trim();
  if (data?.employmentType !== undefined) {
    if (!VALID_TYPES.has(data.employmentType)) {
      return { ok: false, error: 'ประเภทงานไม่ถูกต้อง' };
    }
    update.employmentType = data.employmentType;
  }
  if (data?.description !== undefined) {
    const desc = String(data.description).trim();
    if (!desc) return { ok: false, error: 'กรุณากรอกคำอธิบายตำแหน่ง' };
    update.description = desc;
  }
  if (data?.responsibilities !== undefined) update.responsibilities = cleanList(data.responsibilities);
  if (data?.qualifications !== undefined)   update.qualifications   = cleanList(data.qualifications);
  if (data?.benefits !== undefined)         update.benefits         = cleanList(data.benefits);
  if (data?.applyEmail !== undefined)       update.applyEmail       = String(data.applyEmail).trim();
  if (data?.active !== undefined)           update.active           = Boolean(data.active);

  try {
    const doc = await Recruit.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });
    if (!doc) return { ok: false, error: 'ไม่พบประกาศงาน' };
    revalidatePath(PUBLIC_PATH);
    revalidatePath(ADMIN_PATH);
    return { ok: true, data: serialize(doc) };
  } catch (err) {
    if (err?.code === 11000) return { ok: false, error: 'slug ซ้ำ กรุณาแก้ไข slug' };
    return { ok: false, error: err?.message || 'บันทึกไม่สำเร็จ' };
  }
}

export async function deleteRecruit(id) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Recruit.findByIdAndDelete(id);
  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function toggleRecruitActive(id, active) {
  await requireAdmin();
  await dbConnect();
  if (!id) return { ok: false, error: 'Missing id' };
  await Recruit.findByIdAndUpdate(id, { active: Boolean(active) }, { new: true });
  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function reorderRecruits(orderedIds) {
  await requireAdmin();
  await dbConnect();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }
  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { order: index } },
    },
  }));
  await Recruit.bulkWrite(ops);
  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
