'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { Banner } from '@/models/Banner';
import { bannerSchema } from '@/lib/schemas/banner';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';

export async function getBanners() {
  await dbConnect();
  const banners = await Banner.find({})
    .sort({ weight: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(banners));
}

export async function getActiveBanners() {
  await dbConnect();
  const now = new Date();
  const banners = await Banner.find({
    active: true,
    $or: [
      { starts_at: null, ends_at: null },
      { starts_at: { $lte: now }, ends_at: null },
      { starts_at: null, ends_at: { $gte: now } },
      { starts_at: { $lte: now }, ends_at: { $gte: now } },
    ],
  })
    .sort({ weight: 1 })
    .lean();
  return JSON.parse(JSON.stringify(banners));
}

export async function createBanner(formData) {
  await dbConnect();

  let image_url = formData.get('image_url') || '';
  let image_public_id = formData.get('image_public_id') || '';
  const file = formData.get('image_file');

  if (file && typeof file === 'object' && file.size > 0) {
    const uploaded = await uploadToCloudinary(file, 'banners');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const data = {
    title:      formData.get('title'),
    type:       formData.get('type'),
    youtube_id: formData.get('youtube_id') || '',
    slide_text: formData.get('slide_text') || '',
    image_url,
    image_public_id,
    link_url:   formData.get('link_url') || '',
    link_text:  formData.get('link_text') || '',
    weight:     formData.get('weight') ?? 0,
    active:     formData.get('active') === 'true',
  };

  const parsed = bannerSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  await Banner.create(parsed.data);
  revalidatePath('/');
  revalidatePath('/admin/banners');
  triggerLandingSync();
  return { ok: true };
}

export async function updateBanner(id, formData) {
  await dbConnect();

  const existing = await Banner.findById(id);
  if (!existing) return { ok: false, errors: { _: ['ไม่พบ Banner'] } };

  let image_url = formData.get('image_url') || existing.image_url;
  let image_public_id = formData.get('image_public_id') || existing.image_public_id;
  const file = formData.get('image_file');

  if (file && typeof file === 'object' && file.size > 0) {
    if (existing.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'banners');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  const data = {
    title:      formData.get('title'),
    type:       formData.get('type'),
    youtube_id: formData.get('youtube_id') || '',
    slide_text: formData.get('slide_text') || '',
    image_url,
    image_public_id,
    link_url:   formData.get('link_url') || '',
    link_text:  formData.get('link_text') || '',
    weight:     formData.get('weight') ?? existing.weight,
    active:     formData.get('active') === 'true',
  };

  const parsed = bannerSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  await Banner.findByIdAndUpdate(id, parsed.data);
  revalidatePath('/');
  revalidatePath('/admin/banners');
  triggerLandingSync();
  return { ok: true };
}

export async function deleteBanner(id) {
  await dbConnect();
  const banner = await Banner.findById(id);
  if (banner?.image_public_id) {
    await deleteFromCloudinary(banner.image_public_id);
  }
  await Banner.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath('/admin/banners');
  triggerLandingSync();
  return { ok: true };
}
