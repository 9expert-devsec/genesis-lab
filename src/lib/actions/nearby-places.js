'use server';

/**
 * Server actions for /restaurant-and-hotel-nearby-9expert-training.
 * Reads (active only) are public; admin reads + writes require an
 * authenticated admin session. Mirrors the shape of portfolio.js so
 * the admin UI patterns line up cleanly.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import NearbyPlace from '@/models/NearbyPlace';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const PUBLIC_PATH = '/restaurant-and-hotel-nearby-9expert-training';
const ADMIN_PATH  = '/admin/nearby-places';

const TYPE_LABELS = {
  hotel: 'โรงแรม',
  food:  'ร้านอาหาร',
  cafe:  'ร้านกาแฟ',
  bar:   'ผับและร้านอาหาร',
  drink: 'เครื่องดื่ม',
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

function toBool(raw) {
  return raw === true || raw === 'true' || raw === 'on';
}

// ── Reads ──────────────────────────────────────────────────────────

export async function getActiveNearbyPlaces() {
  await dbConnect();
  const docs = await NearbyPlace.find({ is_active: true })
    .sort({ display_order: 1, distance: 1 })
    .lean();
  return serialize(docs);
}

export async function getAllNearbyPlaces() {
  await requireAdmin();
  await dbConnect();
  const docs = await NearbyPlace.find({})
    .sort({ display_order: 1, distance: 1 })
    .lean();
  return serialize(docs);
}

// ── Create ─────────────────────────────────────────────────────────

export async function createNearbyPlace(formData) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  const name = String(get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'กรุณาระบุชื่อสถานที่' };

  const type = String(get('type') ?? '').trim();
  if (!TYPE_LABELS[type]) return { ok: false, error: 'ประเภทไม่ถูกต้อง' };

  const distance = Number(get('distance'));
  if (!Number.isFinite(distance) || distance < 0) {
    return { ok: false, error: 'กรุณาระบุระยะทาง (เมตร)' };
  }

  const walk = Number(get('walk'));
  if (!Number.isFinite(walk) || walk < 1) {
    return { ok: false, error: 'กรุณาระบุเวลาเดิน (นาที)' };
  }

  let image_url       = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'nearby-places');
    image_url       = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const last = await NearbyPlace.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const labelRaw = String(get('label') ?? '').trim();

  const doc = await NearbyPlace.create({
    name,
    type,
    label:    labelRaw || TYPE_LABELS[type],
    distance,
    walk,
    detail:   String(get('detail') ?? '').trim(),
    hours:    String(get('hours')  ?? '-').trim() || '-',
    phone:    String(get('phone')  ?? '-').trim() || '-',
    maps:     String(get('maps')   ?? '').trim(),
    image_url,
    image_public_id,
    is_active:     get('is_active') == null ? true : toBool(get('is_active')),
    display_order,
  });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

// ── Update ─────────────────────────────────────────────────────────

export async function updateNearbyPlace(id, formData) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const existing = await NearbyPlace.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบสถานที่' };

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'nearby-places');
    image_url       = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = { image_url, image_public_id };

  const nameRaw = get('name');
  if (nameRaw !== undefined && nameRaw !== null) {
    const v = String(nameRaw).trim();
    if (!v) return { ok: false, error: 'กรุณาระบุชื่อสถานที่' };
    update.name = v;
  }

  const typeRaw = get('type');
  if (typeRaw !== undefined && typeRaw !== null) {
    const v = String(typeRaw).trim();
    if (!TYPE_LABELS[v]) return { ok: false, error: 'ประเภทไม่ถูกต้อง' };
    update.type = v;
  }

  const labelRaw = get('label');
  if (labelRaw !== undefined && labelRaw !== null) {
    const v = String(labelRaw).trim();
    update.label = v || TYPE_LABELS[update.type ?? existing.type];
  }

  const distRaw = get('distance');
  if (distRaw !== undefined && distRaw !== null && distRaw !== '') {
    const v = Number(distRaw);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: 'ระยะทางไม่ถูกต้อง' };
    }
    update.distance = v;
  }

  const walkRaw = get('walk');
  if (walkRaw !== undefined && walkRaw !== null && walkRaw !== '') {
    const v = Number(walkRaw);
    if (!Number.isFinite(v) || v < 1) {
      return { ok: false, error: 'เวลาเดินไม่ถูกต้อง' };
    }
    update.walk = v;
  }

  for (const k of ['detail', 'hours', 'phone', 'maps']) {
    const raw = get(k);
    if (raw !== undefined && raw !== null) {
      update[k] = String(raw).trim();
      if ((k === 'hours' || k === 'phone') && !update[k]) update[k] = '-';
    }
  }

  const activeRaw = get('is_active');
  if (activeRaw !== undefined && activeRaw !== null) {
    update.is_active = toBool(activeRaw);
  }

  const orderRaw = get('display_order');
  if (orderRaw !== undefined && orderRaw !== null && orderRaw !== '') {
    const v = Number(orderRaw);
    if (Number.isFinite(v)) update.display_order = v;
  }

  const doc = await NearbyPlace.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

// ── Toggle active ──────────────────────────────────────────────────

export async function toggleNearbyPlaceActive(id, nextValue) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const value = toBool(nextValue);

  const doc = await NearbyPlace.findByIdAndUpdate(
    id,
    { is_active: value },
    { new: true }
  );
  if (!doc) return { ok: false, error: 'ไม่พบสถานที่' };

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

// ── Delete ─────────────────────────────────────────────────────────

export async function deleteNearbyPlace(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await NearbyPlace.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await NearbyPlace.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── Reorder ────────────────────────────────────────────────────────

export async function reorderNearbyPlaces(orderedIds) {
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
  await NearbyPlace.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}