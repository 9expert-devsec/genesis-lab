'use server';

/**
 * Promotion banners — multiple slides, sorted by display_order.
 * Each row is one carousel image. Reads are public; writes need an
 * authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import PromotionBanner from '@/models/PromotionBanner';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const PUBLIC_PATH = '/promotions';
const ADMIN_PATH  = '/admin/promotions/banner';

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

// ── Reads ──────────────────────────────────────────────────────────

export async function getActivePromotionBanners() {
  await dbConnect();
  const docs = await PromotionBanner.find({ is_active: true })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function listPromotionBanners() {
  await requireAdmin();
  await dbConnect();
  const docs = await PromotionBanner.find({})
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

// ── Mutations ──────────────────────────────────────────────────────

/**
 * Create a new banner. Accepts FormData (admin form) or a plain object.
 * Required: an image file (`image_file`) OR a pre-set `image_url`.
 */
export async function savePromotionBanner(formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  let image_url       = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = isForm ? formDataOrObj.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'promotion-banners');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  if (!image_url) {
    return { ok: false, error: 'กรุณาเลือกรูปภาพแบนเนอร์' };
  }

  // New banner goes to the end of the list. Computing max+1 keeps a
  // stable order even if some rows have been hand-tuned.
  const last = await PromotionBanner.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const data = {
    image_url,
    image_public_id,
    alt_text:  String(get('alt_text') ?? '').trim(),
    link_url:  String(get('link_url') ?? '').trim(),
    is_active: get('is_active') === true || get('is_active') === 'true' || get('is_active') === 'on',
    display_order,
  };

  const doc = await PromotionBanner.create(data);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function updatePromotionBanner(id, formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const existing = await PromotionBanner.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบแบนเนอร์' };

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = isForm ? formDataOrObj.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'promotion-banners');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
    alt_text:  String(get('alt_text') ?? existing.alt_text ?? '').trim(),
    link_url:  String(get('link_url') ?? existing.link_url ?? '').trim(),
  };
  // Only flip `is_active` if explicitly provided. Empty FormData entry
  // would otherwise silently disable the row.
  const activeRaw = get('is_active');
  if (activeRaw !== undefined && activeRaw !== null) {
    update.is_active = activeRaw === true || activeRaw === 'true' || activeRaw === 'on';
  }

  const doc = await PromotionBanner.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function deletePromotionBanner(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await PromotionBanner.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await PromotionBanner.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function updatePromotionBannerOrder(orderedIds) {
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
  await PromotionBanner.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
