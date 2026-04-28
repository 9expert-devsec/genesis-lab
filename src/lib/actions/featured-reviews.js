'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedReview } from '@/models/FeaturedReview';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';

const ADMIN_PATH = '/admin/featured-reviews';

export async function getFeaturedReviews() {
  await dbConnect();
  const items = await FeaturedReview.find({})
    .sort({ sort_order: 1, createdAt: -1 })
    .lean();
  return JSON.parse(JSON.stringify(items));
}

export async function getActiveFeaturedReviewIds() {
  await dbConnect();
  const items = await FeaturedReview.find({ active: true })
    .sort({ sort_order: 1 })
    .lean();
  return items.map((i) => i.review_id);
}

export async function addFeaturedReview(formData) {
  await dbConnect();

  const rawId = formData.get('review_id');
  const review_id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!review_id) return { ok: false, error: 'กรุณาเลือกรีวิว' };

  const exists = await FeaturedReview.findOne({ review_id });
  if (exists) return { ok: false, error: 'รีวิวนี้อยู่ในรายการแล้ว' };

  const count = await FeaturedReview.countDocuments();
  await FeaturedReview.create({
    review_id,
    sort_order: count,
    active: true,
  });

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  return { ok: true };
}

export async function updateFeaturedReview(id, formData) {
  await dbConnect();

  const sort_order = Number(formData.get('sort_order') ?? 0);
  const active = formData.get('active') === 'true';

  await FeaturedReview.findByIdAndUpdate(id, { sort_order, active });
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  return { ok: true };
}

export async function deleteFeaturedReview(id) {
  await dbConnect();
  await FeaturedReview.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  return { ok: true };
}
