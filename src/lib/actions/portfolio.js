'use server';

/**
 * Server actions for /portfolio — ClientLogo (multi-doc) and
 * AtmospherePhoto (multi-doc). Reads are public, writes require an
 * authenticated admin session. Mirrors the shape of contact.js +
 * promotion-banner.js so the admin UI patterns line up cleanly.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ClientLogo from '@/models/ClientLogo';
import AtmospherePhoto from '@/models/AtmospherePhoto';
import { auth } from '@/lib/auth/options';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';

const PUBLIC_PATH = '/portfolio';
const ADMIN_PATH  = '/admin/portfolio';

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

// ── ClientLogo (multi-doc) ─────────────────────────────────────────

export async function getActiveClientLogos() {
  await dbConnect();
  const docs = await ClientLogo.find({ is_active: true })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function getAllClientLogos() {
  await requireAdmin();
  await dbConnect();
  const docs = await ClientLogo.find({})
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function createClientLogo(formData) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  const company_name = String(get('company_name') ?? '').trim();
  if (!company_name) {
    return { ok: false, error: 'กรุณาระบุชื่อบริษัท' };
  }

  let image_url = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'client-logos');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  if (!image_url) {
    return { ok: false, error: 'กรุณาเลือกรูปโลโก้' };
  }

  const last = await ClientLogo.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const data = {
    company_name,
    image_url,
    image_public_id,
    display_order,
    is_active: get('is_active') == null ? true : toBool(get('is_active')),
  };

  const doc = await ClientLogo.create(data);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function updateClientLogo(id, formData) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const existing = await ClientLogo.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบโลโก้' };

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'client-logos');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
  };

  const nameRaw = get('company_name');
  if (nameRaw !== undefined && nameRaw !== null) {
    update.company_name = String(nameRaw).trim();
  }

  const activeRaw = get('is_active');
  if (activeRaw !== undefined && activeRaw !== null) {
    update.is_active = toBool(activeRaw);
  }

  const doc = await ClientLogo.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function deleteClientLogo(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await ClientLogo.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await ClientLogo.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function reorderClientLogos(orderedIds) {
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
  await ClientLogo.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// ── AtmospherePhoto (multi-doc) ────────────────────────────────────

export async function getActiveAtmospherePhotos() {
  await dbConnect();
  const docs = await AtmospherePhoto.find({ is_active: true })
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function getAllAtmospherePhotos() {
  await requireAdmin();
  await dbConnect();
  const docs = await AtmospherePhoto.find({})
    .sort({ display_order: 1, createdAt: 1 })
    .lean();
  return serialize(docs);
}

export async function createAtmospherePhoto(formData) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  let image_url = String(get('image_url') ?? '');
  let image_public_id = String(get('image_public_id') ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'atmosphere-photos');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  if (!image_url) {
    return { ok: false, error: 'กรุณาเลือกภาพบรรยากาศ' };
  }

  const last = await AtmospherePhoto.findOne({})
    .sort({ display_order: -1 })
    .select('display_order')
    .lean();
  const display_order = (last?.display_order ?? -1) + 1;

  const data = {
    image_url,
    image_public_id,
    caption_th: String(get('caption_th') ?? '').trim(),
    display_order,
    is_active: get('is_active') == null ? true : toBool(get('is_active')),
  };

  const doc = await AtmospherePhoto.create(data);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function updateAtmospherePhoto(id, formData) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };

  const existing = await AtmospherePhoto.findById(id);
  if (!existing) return { ok: false, error: 'ไม่พบภาพ' };

  const isForm = typeof formData?.get === 'function';
  const get = (k) => (isForm ? formData.get(k) : formData?.[k]);

  let image_url       = String(get('image_url') ?? existing.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing.image_public_id ?? '');

  const file = isForm ? formData.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'atmosphere-photos');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
  };

  const captionRaw = get('caption_th');
  if (captionRaw !== undefined && captionRaw !== null) {
    update.caption_th = String(captionRaw).trim();
  }

  const activeRaw = get('is_active');
  if (activeRaw !== undefined && activeRaw !== null) {
    update.is_active = toBool(activeRaw);
  }

  const doc = await AtmospherePhoto.findByIdAndUpdate(id, update, { new: true });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}

export async function deleteAtmospherePhoto(id) {
  await requireAdmin();
  await dbConnect();

  if (!id) return { ok: false, error: 'Missing id' };
  const doc = await AtmospherePhoto.findById(id);
  if (doc?.image_public_id) {
    await deleteFromCloudinary(doc.image_public_id);
  }
  await AtmospherePhoto.findByIdAndDelete(id);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

export async function reorderAtmospherePhotos(orderedIds) {
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
  await AtmospherePhoto.bulkWrite(ops);

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
