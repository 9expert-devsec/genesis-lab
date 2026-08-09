'use server';

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import { FeaturedReview } from '@/models/FeaturedReview';
import { triggerLandingSync } from '@/lib/landing/triggerLandingSync';
import { requireAdmin } from '@/lib/actions/auth';
import { getReviewsById } from '@/lib/api/reviews';

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
  await requireAdmin('featured_reviews');
  await dbConnect();

  const rawId = formData.get('review_id');
  const review_id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!review_id) return { ok: false, error: 'กรุณาเลือกรีวิว' };

  const exists = await FeaturedReview.findOne({ review_id });
  if (exists) return { ok: false, error: 'รีวิวนี้อยู่ในรายการแล้ว' };

  const count = await FeaturedReview.countDocuments();
  const created = await FeaturedReview.create({
    review_id,
    sort_order: count,
    active: true,
  });

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();

  // HYDRATE before returning — the same defect the featured-courses cover had,
  // in a different shape. The page does NOT hand the list raw FeaturedReview
  // documents: it attaches the live review payload
  // (`hydratedFeatured = featured.map(f => ({ ...f, review: allById.get(...) }))`)
  // and the list renders `c.review.reviewerName / .comment / .avatarUrl /
  // .rating / .courseName`. Returning the bare document would splice a row with
  // `review: undefined`, which renders as an empty card until the next read.
  //
  // Awaited, not fired-and-forgotten: `getReviewsById` is tag-cached under
  // `reviews`, so this is normally a Data Cache hit, and a floating promise in
  // a serverless function may never run at all.
  let review = null;
  try {
    const [found] = await getReviewsById([review_id]);
    review = found ?? null;
  } catch (err) {
    // The row is still worth returning: `review: null` is the same shape the
    // page produces for an upstream row it cannot find, and the list already
    // renders a placeholder for it.
    console.warn('[featured-reviews] review hydration failed:', review_id, err?.message ?? err);
  }

  // { ok, data } — see the note in actions/featured-courses.js. The client
  // splices this row into a sibling list whose comparator is
  // { sort_order: 1, createdAt: -1 }, and only the database knows createdAt.
  return {
    ok: true,
    data: { ...JSON.parse(JSON.stringify(created.toObject())), review },
  };
}

export async function updateFeaturedReview(id, formData) {
  await requireAdmin('featured_reviews');
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
  await requireAdmin('featured_reviews');
  await dbConnect();
  await FeaturedReview.findByIdAndDelete(id);
  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  triggerLandingSync();
  return { ok: true };
}
