'use server';

/**
 * Server actions for /about-us — Instructor CRUD + AboutConfig text.
 * Reads are public (consumed by the page); writes require admin auth.
 *
 * Cloudinary uploads only happen when a fresh `image_file` is present
 * in the FormData; otherwise the existing image_url is preserved.
 * Local /Instructors/* paths have no `image_public_id`, so the delete
 * helper treats Cloudinary cleanup as best-effort.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';
import AboutConfig from '@/models/AboutConfig';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const PUBLIC_PATH = '/about-us';
const ADMIN_PATH  = '/admin/about';

const DEFAULT_CONFIG = {
  tagline:     'Universe of Learning Technology',
  description: '',
  mission:     '',
  vision:      '',
};

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

// ── Instructors — Reads ────────────────────────────────────────────

export async function getInstructors() {
  await dbConnect();
  const docs = await Instructor.find({ is_active: true })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function getAllInstructors() {
  await requireAdmin();
  await dbConnect();
  const docs = await Instructor.find({})
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

// ── Instructors — Mutations ────────────────────────────────────────

export async function saveInstructor(formData) {
  await requireAdmin();
  await dbConnect();

  const get = (k) => formData.get(k);

  let image_url       = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = formData.get('image_file');
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'instructors');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const name = String(get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'กรุณากรอกชื่ออาจารย์' };
  if (!image_url) return { ok: false, error: 'กรุณาเลือกรูปอาจารย์' };

  const last = await Instructor.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const data = {
    name,
    title:           String(get('title') ?? '').trim(),
    image_url,
    image_public_id,
    display_order,
    is_active:       get('is_active') === 'true' || get('is_active') === 'on' || get('is_active') === true,
  };

  const doc = await Instructor.create(data);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function updateInstructor(id, formData) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const existing = await Instructor.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบอาจารย์' };

  const get = (k) => formData.get(k);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = formData.get('image_file');
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'instructors');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
  };

  // Apply text fields only when explicitly provided. Toggle-only updates
  // (from the active switch) shouldn't blank out the name/title.
  const nameRaw = get('name');
  if (nameRaw !== null && nameRaw !== undefined) {
    const trimmed = String(nameRaw).trim();
    if (!trimmed) return { ok: false, error: 'กรุณากรอกชื่ออาจารย์' };
    update.name = trimmed;
  }

  const titleRaw = get('title');
  if (titleRaw !== null && titleRaw !== undefined) {
    update.title = String(titleRaw).trim();
  }

  const activeRaw = get('is_active');
  if (activeRaw !== null && activeRaw !== undefined) {
    update.is_active = activeRaw === 'true' || activeRaw === 'on' || activeRaw === true;
  }

  const doc = await Instructor.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function deleteInstructor(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await Instructor.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await Instructor.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateInstructorOrder(orderedIds) {
  await requireAdmin();
  await dbConnect();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { display_order: index } },
    },
  }));
  await Instructor.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function toggleInstructorActive(id, value) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  await Instructor.findByIdAndUpdate(id, { is_active: Boolean(value) });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── AboutConfig ────────────────────────────────────────────────────

export async function getAboutConfig() {
  await dbConnect();
  const doc = await AboutConfig.findOne({}).lean();
  if (!doc) return { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG, ...serialize(doc) };
}

export async function saveAboutConfig(data) {
  await requireAdmin();
  await dbConnect();

  const update = {
    tagline:     String(data?.tagline ?? '').trim() || DEFAULT_CONFIG.tagline,
    description: String(data?.description ?? '').trim(),
    mission:     String(data?.mission ?? '').trim(),
    vision:      String(data?.vision ?? '').trim(),
  };

  const doc = await AboutConfig.findOneAndUpdate({}, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}
