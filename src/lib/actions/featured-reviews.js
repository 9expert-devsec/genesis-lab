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

  /**
   * `skipSync` — set on all-but-one call by FeaturedReviewList's
   * deferred-save reorder batch, which calls this action once per CHANGED
   * row via Promise.allSettled. Without this, N changed rows would each
   * schedule their own triggerLandingSync() — N overlapping 5-15s
   * landing-snapshot rebuilds for one save. The batch designates exactly one
   * of its calls to carry skipSync=false, so a save collapses to ONE sync
   * regardless of how many rows moved — and because the batch only reaches
   * its "fully succeeded" branch when every call (including the
   * skipSync=false one) has landed, that one call is guaranteed to have run
   * whenever a sync is expected. `handleToggle`'s own single-row call never
   * sets this flag, so an active/inactive toggle still syncs immediately, as
   * before. Same shape as featured-courses.js's updateFeaturedCourse.
   */
  const skipSync = formData.get('skipSync') === 'true';

  /**
   * TRY/CATCH ADDED (was previously absent — a thrown Mongo error propagated
   * as an unhandled rejection to whichever caller awaited this, with no
   * {ok:false} to check). Every caller was enumerated before this change
   * (FeaturedReviewList.jsx: the reorder-save batch, handleToggle; no caller
   * anywhere else in the repo) and each now handles ok:false explicitly.
   */
  try {
    await FeaturedReview.findByIdAndUpdate(id, { sort_order, active });
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }

  revalidatePath('/');
  revalidatePath(ADMIN_PATH);
  if (!skipSync) triggerLandingSync();
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
