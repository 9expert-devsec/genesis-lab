'use server';

/**
 * Server actions for the Promotion + PromotionConfig collections.
 *
 * Reads are public; writes require an authenticated admin session.
 * Mutations call `triggerPromotionSync()` to schedule a background
 * resync + revalidation after the response is flushed.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';
import { auth } from '@/lib/auth/options';
import { syncPromotions } from '@/lib/promotions/syncPromotions';
import { triggerPromotionSync } from '@/lib/promotions/triggerPromotionSync';

const ADMIN_PATH = '/admin/promotions';

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

function normalizeSlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^\/+/, '').toLowerCase();
  return trimmed || null;
}

// ── Mutations ──────────────────────────────────────────────────────

export async function togglePromotionActive(promotionId, isActive) {
  await requireAdmin();
  await dbConnect();

  if (!promotionId) return { ok: false, error: 'Missing promotion_id' };

  await Promotion.findOneAndUpdate(
    { promotion_id: promotionId },
    { $set: { is_active: Boolean(isActive) } }
  );
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}

/**
 * Persist a new ordering. `orderedIds` is an array of promotion_id values
 * in the desired display order. Each row's display_order is set to its
 * index in the array.
 */
export async function updatePromotionOrder(orderedIds) {
  await requireAdmin();
  await dbConnect();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: false, error: 'orderedIds must be a non-empty array' };
  }

  const ops = orderedIds.map((id, index) => ({
    updateOne: {
      filter: { promotion_id: String(id) },
      update: { $set: { display_order: index } },
    },
  }));
  await Promotion.bulkWrite(ops);
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}

export async function savePromotionConfig(promotionId, data) {
  await requireAdmin();
  await dbConnect();

  if (!promotionId) return { ok: false, error: 'Missing promotion_id' };

  const url_slug = normalizeSlug(data?.url_slug);
  const update = {
    promotion_id: promotionId,
    url_slug,
    meta_title:       String(data?.meta_title ?? '').trim(),
    meta_description: String(data?.meta_description ?? '').trim(),
    og_image_url:     String(data?.og_image_url ?? '').trim(),
  };

  try {
    const doc = await PromotionConfig.findOneAndUpdate(
      { promotion_id: promotionId },
      update,
      { upsert: true, new: true, runValidators: true }
    );
    revalidatePath(ADMIN_PATH);
    revalidatePath('/promotions');
    if (url_slug) revalidatePath(`/promotions/${url_slug}`);
    revalidatePath(`/promotions/${promotionId}`);
    triggerPromotionSync();
    return { ok: true, data: serialize(doc) };
  } catch (err) {
    if (err?.code === 11000) {
      return { ok: false, error: 'URL Slug นี้ถูกใช้แล้ว' };
    }
    return { ok: false, error: err?.message ?? 'บันทึกไม่สำเร็จ' };
  }
}

export async function deletePromotionConfig(promotionId) {
  await requireAdmin();
  await dbConnect();
  await PromotionConfig.deleteOne({ promotion_id: promotionId });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}

export async function syncPromotionsAction() {
  await requireAdmin();
  const result = await syncPromotions();
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return result;
}

/**
 * Admin-only — minimal list of active promotions used to populate
 * dropdowns in the course-level admin tabs (CoursePromoLinksTab,
 * EarlyBirdTab).
 */
export async function getActivePromotionsForAdmin() {
  await requireAdmin();
  await dbConnect();
  const docs = await Promotion
    .find({ is_active: true })
    .sort({ display_order: 1 })
    .select('promotion_id title thumbnail_url related_course_ids')
    .lean();
  return serialize(docs);
}
