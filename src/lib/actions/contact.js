'use server';

/**
 * Server actions for /contact-us — ContactVideo (singleton) and
 * TransportMap (singleton). Reads are public; writes require an
 * authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import ContactVideo from '@/models/ContactVideo';
import TransportMap from '@/models/TransportMap';
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

// ── Transport Map (singleton) ──────────────────────────────────────

export async function getTransportMap() {
  await dbConnect();
  const doc = await TransportMap.findOne({}).lean();
  if (!doc) return { image_url: '', image_public_id: '', caption_th: '' };
  return serialize(doc);
}

export async function saveTransportMap(formDataOrObj) {
  await requireAdmin();
  await dbConnect();

  const isForm = typeof formDataOrObj?.get === 'function';
  const get = (k) => (isForm ? formDataOrObj.get(k) : formDataOrObj?.[k]);

  const existing = await TransportMap.findOne({});

  let image_url       = String(get('image_url') ?? existing?.image_url ?? '');
  let image_public_id = String(get('image_public_id') ?? existing?.image_public_id ?? '');

  // New file replaces the old image. Delete the previous Cloudinary
  // asset on a best-effort basis — failure to delete shouldn't block
  // the save.
  const file = isForm ? formDataOrObj.get('image_file') : null;
  if (file && typeof file === 'object' && file.size > 0) {
    if (existing?.image_public_id) {
      try {
        await deleteFromCloudinary(existing.image_public_id);
      } catch {
        // best-effort — ignore
      }
    }
    const uploaded = await uploadToCloudinary(file, 'transport-map');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const update = {
    image_url,
    image_public_id,
    caption_th: String(get('caption_th') ?? '').trim(),
  };

  const doc = await TransportMap.findOneAndUpdate({}, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  revalidatePath(PUBLIC_PATH);
  revalidatePath(ADMIN_PATH);
  return { ok: true, data: serialize(doc) };
}
