'use server';

/**
 * Server actions for the Promotion + PromotionConfig collections.
 *
 * Promotions are strictly READ-ONLY from MSDB (MANIFESTO §6): this module
 * never creates, edits, or deletes a Promotion, and never writes back to
 * MSDB. The only admin-controlled Promotion fields are `is_active` and
 * `display_order` (curation), preserved across syncs. A promotion's detail
 * page is authored in the Page Builder and linked by id — that link lives on
 * the PageBuilder doc (`promotionId`), written by setPromotionPageLink below.
 *
 * (PromotionConfig — url_slug / SEO — is frozen legacy kept as-is; it will
 * be retired in a later phase once the builder renderer supersedes it.)
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import PromotionConfig from '@/models/PromotionConfig';
import PageBuilder from '@/models/PageBuilder';
import { requireAdmin } from '@/lib/actions/auth';
import { syncPromotions } from '@/lib/promotions/syncPromotions';
import { triggerPromotionSync } from '@/lib/promotions/triggerPromotionSync';

const ADMIN_PATH = '/admin/promotions';

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function normalizeSlug(input) {
  if (!input) return null;
  const trimmed = String(input).trim().replace(/^\/+/, '').toLowerCase();
  return trimmed || null;
}

// ── Curation (the only admin-controlled Promotion fields) ──────────

export async function togglePromotionActive(promotionId, isActive) {
  await requireAdmin('promotions');
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
  await requireAdmin('promotions');
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
  await requireAdmin('promotions');
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
  await requireAdmin('promotions');
  await dbConnect();
  await PromotionConfig.deleteOne({ promotion_id: promotionId });
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}

export async function syncPromotionsAction() {
  await requireAdmin('promotions');
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
  await requireAdmin('promotions');
  await dbConnect();
  const docs = await Promotion
    .find({ is_active: true })
    .sort({ display_order: 1 })
    .select('promotion_id title thumbnail_url related_course_ids')
    .lean();
  return serialize(docs);
}

// ── Page Builder link ──────────────────────────────────────────────
//
// The link between a promotion and its detail page lives on the PageBuilder
// doc (`promotionId`). These actions write ONLY the PageBuilder side — the
// Promotion doc stays read-only.

/**
 * List builder pages of type `promotion` for the link selector, with the
 * minimal shape the admin row needs (id, title, slug, status, current link).
 */
export async function getLinkablePromotionPages() {
  await requireAdmin('promotions');
  await dbConnect();
  const docs = await PageBuilder
    .find({ pageType: 'promotion' })
    .select('title slug status promotionId')
    .sort({ updatedAt: -1 })
    .lean();
  return serialize(docs);
}

/**
 * Link (or unlink) a builder page to a promotion by writing the PageBuilder
 * doc's `promotionId` — NEVER the Promotion doc. One page per promotion:
 * linking page X first clears the link from any other page pointing at the
 * same promotion. An empty `pageBuilderId` just clears the current link.
 */
export async function setPromotionPageLink(promotionId, pageBuilderId) {
  await requireAdmin('promotions');
  if (!promotionId) return { ok: false, error: 'Missing promotion_id' };
  await dbConnect();

  // Enforce one-to-one: drop any page currently linked to this promotion.
  await PageBuilder.updateMany(
    { promotionId: String(promotionId) },
    { $set: { promotionId: '' } }
  );

  if (pageBuilderId) {
    const linked = await PageBuilder.findByIdAndUpdate(
      pageBuilderId,
      { $set: { promotionId: String(promotionId) } },
      { new: true }
    );
    if (!linked) return { ok: false, error: 'ไม่พบหน้าเพจ' };
  }

  revalidateTag('page-builder');
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}
