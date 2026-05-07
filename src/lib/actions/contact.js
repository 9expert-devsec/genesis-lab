'use server';

/**
 * Server actions for /contact-us — ContactVideo (singleton) and
 * TransportCard (multi-doc). Reads are public; writes require an
 * authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ContactVideo from '@/models/ContactVideo';
import TransportCard from '@/models/TransportCard';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const PUBLIC_PATH = '/contact-us';
const ADMIN_PATH  = '/admin/contact';

const DEFAULT_VIDEO = {
  youtube_url: '',
  title_th:    '',
  title_en:    '',
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

// ── ContactVideo (singleton) ───────────────────────────────────────

export async function getContactVideo() {
  await dbConnect();
  const doc = await ContactVideo.findOne({}).lean();
  if (!doc) return { ...DEFAULT_VIDEO };
  return { ...DEFAULT_VIDEO, ...serialize(doc) };
}

export async function saveContactVideo(formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  const update = {
    youtube_url: String(get('youtube_url') ?? '').trim(),
    title_th:    String(get('title_th') ?? '').trim(),
    title_en:    String(get('title_en') ?? '').trim(),
  };

  const doc = await ContactVideo.findOneAndUpdate({}, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

// ── TransportCard — Reads ──────────────────────────────────────────

export async function getActiveTransportCards() {
  await dbConnect();
  const docs = await TransportCard.find({ is_active: true })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function listTransportCards() {
  await requireAdmin();
  await dbConnect();
  const docs = await TransportCard.find({})
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

// ── TransportCard — Mutations ──────────────────────────────────────

export async function saveTransportCard(formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  let image_url       = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = isForm ? formDataOrObj.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'transport-cards');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const title_th = String(get('title_th') ?? '').trim();
  if (!title_th) return { ok: false, error: 'กรุณากรอกหัวข้อภาษาไทย' };

  const last = await TransportCard.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const data = {
    title_th,
    title_en:       String(get('title_en') ?? '').trim(),
    description_th: String(get('description_th') ?? ''),
    description_en: String(get('description_en') ?? ''),
    icon_name:      String(get('icon_name') ?? 'MapPin').trim() || 'MapPin',
    image_url,
    image_public_id,
    display_order,
    is_active: get('is_active') === true || get('is_active') === 'true' || get('is_active') === 'on',
  };

  const doc = await TransportCard.create(data);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function updateTransportCard(id, formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const existing = await TransportCard.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบการ์ด' };

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = isForm ? formDataOrObj.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'transport-cards');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
  };

  const titleThRaw = get('title_th');
  if (titleThRaw !== null && titleThRaw !== undefined) {
    const trimmed = String(titleThRaw).trim();
    if (!trimmed) return { ok: false, error: 'กรุณากรอกหัวข้อภาษาไทย' };
    update.title_th = trimmed;
  }

  const titleEnRaw = get('title_en');
  if (titleEnRaw !== null && titleEnRaw !== undefined) {
    update.title_en = String(titleEnRaw).trim();
  }

  const descThRaw = get('description_th');
  if (descThRaw !== null && descThRaw !== undefined) {
    update.description_th = String(descThRaw);
  }

  const descEnRaw = get('description_en');
  if (descEnRaw !== null && descEnRaw !== undefined) {
    update.description_en = String(descEnRaw);
  }

  const iconRaw = get('icon_name');
  if (iconRaw !== null && iconRaw !== undefined) {
    update.icon_name = String(iconRaw).trim() || 'MapPin';
  }

  const activeRaw = get('is_active');
  if (activeRaw !== null && activeRaw !== undefined) {
    update.is_active = activeRaw === true || activeRaw === 'true' || activeRaw === 'on';
  }

  const doc = await TransportCard.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function deleteTransportCard(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await TransportCard.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await TransportCard.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updateTransportCardOrder(orderedIds) {
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
  await TransportCard.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function toggleTransportCardActive(id, value) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  await TransportCard.findByIdAndUpdate(id, { is_active: Boolean(value) });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
