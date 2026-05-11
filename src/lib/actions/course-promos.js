'use server';

/**
 * Server actions for the CoursePromoLink + EarlyBirdConfig collections.
 *
 * Reads used by the public course detail page are not auth-gated.
 * All mutations and admin-only reads require an authenticated admin session.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import CoursePromoLink from '@/models/CoursePromoLink';
import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import Promotion from '@/models/Promotion';
import { auth } from '@/lib/auth/options';

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

function revalidateCourse(courseId) {
  const slug = String(courseId).toLowerCase();
  revalidatePath(`/${slug}-training-course`);
  revalidatePath(`/admin/courses/${courseId}`);
}

// ── CoursePromoLink ────────────────────────────────────────────────

/**
 * Public read — get active promo links for a course,
 * with Promotion data joined in.
 * Returns array of { link, promotion } objects.
 */
export async function getActiveCoursePromos(courseId) {
  if (!courseId) return [];
  await dbConnect();
  const links = await CoursePromoLink
    .find({ course_id: courseId, is_active: true })
    .sort({ display_order: 1 })
    .lean();
  if (!links.length) return [];

  const promoIds = links.map((l) => l.promotion_id);
  const promos = await Promotion
    .find({ promotion_id: { $in: promoIds }, is_active: true })
    .lean();
  const promoMap = Object.fromEntries(promos.map((p) => [p.promotion_id, p]));

  const combined = links
    .map((l) => ({ link: l, promotion: promoMap[l.promotion_id] ?? null }))
    .filter((r) => r.promotion !== null);

  // Display priority: pinned promotions first, then newest by start_date
  // (fall back to createdAt). The CoursePromoLink's `display_order` is
  // intentionally ignored here — pinning at the Promotion level is the
  // editorial signal, while display_order on the link is only used as a
  // tie-breaker within the admin tab.
  combined.sort((a, b) => {
    const aPinned = a.promotion.is_pinned ? 1 : 0;
    const bPinned = b.promotion.is_pinned ? 1 : 0;
    if (bPinned !== aPinned) return bPinned - aPinned;
    const aDate = new Date(a.promotion.start_date ?? a.promotion.createdAt ?? 0);
    const bDate = new Date(b.promotion.start_date ?? b.promotion.createdAt ?? 0);
    return bDate - aDate;
  });

  return serialize(combined);
}

/** Admin read — get all promo links for a course (active + inactive). */
export async function getAllCoursePromoLinks(courseId) {
  await requireAdmin();
  await dbConnect();
  const links = await CoursePromoLink
    .find({ course_id: courseId })
    .sort({ display_order: 1 })
    .lean();
  return serialize(links);
}

export async function createCoursePromoLink(courseId, data) {
  await requireAdmin();
  await dbConnect();
  try {
    const count = await CoursePromoLink.countDocuments({ course_id: courseId });
    await CoursePromoLink.create({
      course_id: courseId,
      promotion_id: data.promotion_id,
      schedule_ids: Array.isArray(data.schedule_ids)
        ? data.schedule_ids.filter(Boolean)
        : [],
      is_active: data.is_active !== false,
      display_order: count,
    });
    revalidateCourse(courseId);
    return { ok: true };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'โปรโมชันนี้ผูกกับหลักสูตรนี้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function updateCoursePromoLink(linkId, data) {
  await requireAdmin();
  await dbConnect();
  const link = await CoursePromoLink.findById(linkId).lean();
  if (!link) return { ok: false, error: 'ไม่พบข้อมูล' };
  await CoursePromoLink.findByIdAndUpdate(linkId, {
    $set: {
      schedule_ids: Array.isArray(data.schedule_ids)
        ? data.schedule_ids.filter(Boolean)
        : [],
      is_active: data.is_active !== false,
    },
  });
  revalidateCourse(link.course_id);
  return { ok: true };
}

export async function deleteCoursePromoLink(linkId) {
  await requireAdmin();
  await dbConnect();
  const link = await CoursePromoLink.findById(linkId).lean();
  if (!link) return { ok: false, error: 'ไม่พบข้อมูล' };
  await CoursePromoLink.findByIdAndDelete(linkId);
  revalidateCourse(link.course_id);
  return { ok: true };
}

export async function reorderCoursePromoLinks(courseId, orderedIds) {
  await requireAdmin();
  await dbConnect();
  await CoursePromoLink.bulkWrite(
    orderedIds.map((id, i) => ({
      updateOne: { filter: { _id: id }, update: { $set: { display_order: i } } },
    }))
  );
  revalidateCourse(courseId);
  return { ok: true };
}

// ── EarlyBirdConfig ────────────────────────────────────────────────

/**
 * Public read — returns null if not active or deadline already passed.
 * Joins the linked Promotion doc as `promotion` so the banner has the
 * thumbnail and any other promo metadata in one round trip.
 */
export async function getEarlyBirdByCourse(courseId) {
  if (!courseId) return null;
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({
    course_id: courseId,
    is_active: true,
  }).lean();
  if (!doc) return null;
  if (doc.deadline && new Date(doc.deadline) < new Date()) return null;

  let promotion = null;
  if (doc.promotion_id) {
    promotion = await Promotion.findOne({ promotion_id: doc.promotion_id }).lean();
  }
  return serialize({ ...doc, promotion });
}

/** Admin read — always returns (even if inactive/expired). */
export async function getEarlyBirdAdminByCourse(courseId) {
  await requireAdmin();
  await dbConnect();
  const doc = await EarlyBirdConfig.findOne({ course_id: courseId }).lean();
  return serialize(doc);
}

export async function saveEarlyBird(courseId, data) {
  await requireAdmin();
  await dbConnect();
  const update = {
    promotion_id:  String(data?.promotion_id ?? '').trim(),
    schedule_id:   String(data?.schedule_id ?? '').trim(),
    label_th:      String(data?.label_th ?? 'Early Bird').trim() || 'Early Bird',
    special_price: data?.special_price ? Number(data.special_price) : null,
    deadline:      data?.deadline ? new Date(data.deadline) : null,
    is_active:     Boolean(data?.is_active),
  };
  await EarlyBirdConfig.findOneAndUpdate(
    { course_id: courseId },
    { $set: update },
    { upsert: true, new: true, runValidators: true }
  );
  revalidateCourse(courseId);
  return { ok: true };
}
