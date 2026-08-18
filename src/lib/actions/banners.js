'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { Banner } from '@/models/Banner';
import { bannerSchema } from '@/lib/schemas/banner';
import { parseBannerFormData, IMAGE_INPUTS } from '@/lib/banners/bannerFormPayload';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { requireAdmin } from '@/lib/actions/auth';

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

/**
 * Resolve the image pair, uploading a new file if one was posted.
 *
 * Split out because it is the ONE part of building the payload that is not
 * pure — it talks to Cloudinary — and keeping it here is what lets
 * `parseBannerFormData` live in a module the test tier can call directly.
 *
 * `existing` is the stored document on an update, so a save that posts no file
 * and no hidden inputs (because the type does not render the image field at
 * all) keeps the stored art rather than blanking it.
 */
async function resolveImage(formData, existing) {
  let image_url = formData.get(IMAGE_INPUTS.URL) || existing?.image_url || '';
  let image_public_id =
    formData.get(IMAGE_INPUTS.PUBLIC_ID) || existing?.image_public_id || '';

  const file = formData.get(IMAGE_INPUTS.FILE);
  if (file && typeof file === 'object' && file.size > 0) {
    // Replacing art on an existing record deletes the old asset first, so the
    // Cloudinary folder does not accumulate an orphan per edit.
    if (existing?.image_public_id) {
      await deleteFromCloudinary(existing.image_public_id);
    }
    const uploaded = await uploadToCloudinary(file, 'banners');
    image_url = uploaded.secure_url;
    image_public_id = uploaded.public_id;
  }

  return { image_url: String(image_url), image_public_id: String(image_public_id) };
}

/**
 * Build the document a save WOULD write, without writing it.
 *
 * ── WHY THIS IS SEPARATE FROM THE TWO MUTATIONS ────────────────────────────
 * "Show me the document this form state produces" is a question worth being
 * able to answer without a database round-trip and without a write — it is how
 * the four types were verified before the first course record existed, and it
 * is what a probe calls. Both `createBanner` and `updateBanner` go through it,
 * so what the probe prints is what the mutation writes, by construction rather
 * than by a fixture that agrees with it today.
 *
 * Returns the zod result, so the caller decides what to do with a failure.
 * `'use server'` requires every export to be async; this one genuinely is,
 * because resolving the image may upload.
 */
export async function buildBannerDocument(formData, existing = null) {
  const image = await resolveImage(formData, existing);
  const data = parseBannerFormData(formData, { existing, image });
  return bannerSchema.safeParse(data);
}

export async function createBanner(formData) {
  await requireAdmin('banners');
  await dbConnect();

  const parsed = await buildBannerDocument(formData, null);
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
  await requireAdmin('banners');
  await dbConnect();

  const existing = await Banner.findById(id);
  if (!existing) return { ok: false, errors: { _: ['ไม่พบ Banner'] } };

  const parsed = await buildBannerDocument(formData, existing);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }

  // `$set` of exactly the keys zod produced. Keys the payload deliberately did
  // NOT include — `image_focal` today, which nothing in this form writes — are
  // left alone rather than nulled, which is what makes it safe for a later
  // slice to add a control for one without this action knowing about it.
  await Banner.findByIdAndUpdate(id, parsed.data);
  revalidatePath('/');
  revalidatePath('/admin/banners');
  triggerLandingSync();
  return { ok: true };
}

export async function deleteBanner(id) {
  await requireAdmin('banners');
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
