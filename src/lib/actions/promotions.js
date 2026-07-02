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
import { requireAdmin } from '@/lib/actions/auth';
import { syncPromotions } from '@/lib/promotions/syncPromotions';
import { triggerPromotionSync } from '@/lib/promotions/triggerPromotionSync';
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';
import { resolveCourseObjectIdsVerbose } from '@/lib/api/resolveIds';

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

// ── Mutations ──────────────────────────────────────────────────────

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

// ── Dual-Write CRUD ───────────────────────────────────────────────
//
// Local Mongo is the master once an admin creates a promotion via this
// UI (source: 'genesis'). We mirror the write to MSDB so the upstream
// stays in sync — MSDB then dispatches `promotion.*` webhooks; our
// receiver detects `source === 'genesis'` and skips the upsert to
// avoid a loop (see lib/webhooks/handlers.js handlePromotionEvent).

function toStr(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}
function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toBool(v) {
  if (typeof v === 'boolean') return v;
  return v === 'on' || v === 'true' || v === '1';
}
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(toStr).filter(Boolean);
  if (typeof v === 'string' && v.length > 0) {
    return v.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Strip HTML tags from `html` and collapse whitespace. Used to derive a
 * `detail_plain` when the admin only filled in the rich-text editor —
 * MSDB requires the plain field for card/SEO consumption.
 */
function htmlToPlain(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

/**
 * Shape the form payload for MSDB. Field mapping (curl-verified):
 *   name                   ← title             (required, display name)
 *   label                  ← label             (required, e.g. "ลด 20%")
 *   slug                   ← slug              (optional)
 *   image_url              ← image_url
 *   detail_plain           ← detail_plain      (auto-derived from html if empty)
 *   detail_html            ← detail_html       (rich body)
 *   start_at               ← start_date
 *   end_at                 ← end_date
 *   is_published           ← is_published
 *   is_pinned              ← is_pinned
 *   related_public_courses ← related_courses[] (ObjectId[] — resolved
 *                              from course_id strings by the caller)
 *
 * `related_public_courses` is left as raw course_id strings here so the
 * caller can both (a) resolve them for MSDB and (b) keep them as-is for
 * the local Promotion document's `related_course_ids` field.
 */
function shapeBody(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) => {
    if (formData instanceof FormData) return formData.getAll(k);
    const v = formData?.[k];
    return Array.isArray(v) ? v : [];
  };

  const detailHtml  = toStr(get('detail_html')  || get('description_html'));
  let   detailPlain = toStr(get('detail_plain') || get('description'));
  if (!detailPlain && detailHtml) detailPlain = htmlToPlain(detailHtml);

  return {
    name:           toStr(get('name')        || get('title')),
    label:          toStr(get('label'))      || 'โปรโมชัน',
    slug:           toStr(get('slug')) || undefined,
    image_url:      toStr(get('image_url')),
    detail_plain:   detailPlain,
    detail_html:    detailHtml,
    start_at:       toStr(get('start_at')    || get('start_date')) || null,
    end_at:         toStr(get('end_at')      || get('end_date'))   || null,
    is_published:   toBool(get('is_published')),
    is_pinned:      toBool(get('is_pinned')),
    // Raw course_id strings — resolved to ObjectIds by caller.
    related_public_courses: toStrArr(
      getAll('related_public_courses').length
        ? getAll('related_public_courses')
        : getAll('related_courses')
    ),
    source:         'genesis',
  };
}

/**
 * Create a promotion. Sequence is local-first, then MSDB:
 *   1. Insert the row in our Mongo with source='genesis', placeholder
 *      msdb_id='' until upstream replies.
 *   2. POST to MSDB with the stamp `source: 'genesis'` and our local
 *      _id as `genesis_id` so the webhook receiver can correlate.
 *   3. Record the upstream `_id` back onto the local row so future
 *      updates can target it.
 * If step 2 fails we keep the local row but flag an error — admin can
 * retry from the edit modal.
 */
export async function createPromotion(formData) {
  await requireAdmin('promotions');
  await dbConnect();

  const body = shapeBody(formData);
  if (!body.name)  return { ok: false, error: 'กรุณากรอกชื่อโปรโมชั่น' };
  if (!body.label) return { ok: false, error: 'กรุณากรอกป้ายกำกับ' };

  // course_id strings come straight off the form. MSDB needs ObjectIds,
  // but the LOCAL document keeps the course_id strings (matches what
  // syncPromotions writes from upstream).
  const courseIdStrings = body.related_public_courses;
  const { ids: objectIds, dropped } = await resolveCourseObjectIdsVerbose(courseIdStrings);

  // 1. Local insert (placeholder promotion_id until MSDB ack'd)
  let localDoc;
  try {
    localDoc = await Promotion.create({
      promotion_id:    `genesis-pending-${Date.now()}`,
      title:           body.name,
      thumbnail_url:   body.image_url,
      detail_html:     body.detail_html,
      html_content:    body.detail_html, // legacy mirror
      detail_plain:    body.detail_plain,
      start_date:      toDateOrNull(body.start_at),
      end_date:        toDateOrNull(body.end_at),
      related_course_ids: courseIdStrings,
      is_published:    body.is_published,
      is_pinned:       body.is_pinned,
      is_active:       body.is_published,
      source:          'genesis',
      msdb_id:         '',
    });
  } catch (err) {
    return { ok: false, error: err?.message ?? 'บันทึก local ไม่สำเร็จ' };
  }

  // 2. Write through to MSDB. The receiver detects source=genesis +
  //    genesis_id and skips the inbound-webhook upsert (anti-loop).
  let upstreamId = '';
  try {
    const { item } = await msdbCreate('promotions', {
      ...body,
      related_public_courses: objectIds, // ObjectId[] required upstream
      genesis_id: String(localDoc._id),
    });
    upstreamId = String(item?._id ?? '');
  } catch (err) {
    return {
      ok: false,
      error: `บันทึกลง MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
      data: serialize(localDoc),
    };
  }

  // 3. Stamp upstream id onto local doc
  if (upstreamId) {
    await Promotion.updateOne(
      { _id: localDoc._id },
      { $set: { msdb_id: upstreamId, promotion_id: upstreamId } }
    );
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return {
    ok: true,
    data: { ...serialize(localDoc), msdb_id: upstreamId },
    warning: dropped.length
      ? `ไม่พบ course_id: ${dropped.join(', ')} (ไม่ได้บันทึกใน related_public_courses)`
      : undefined,
  };
}

export async function updatePromotion(localId, formData) {
  await requireAdmin('promotions');
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing promotion id' };

  const promo = await Promotion.findById(localId).lean();
  if (!promo) return { ok: false, error: 'ไม่พบโปรโมชั่น' };

  const body = shapeBody(formData);
  if (!body.name)  return { ok: false, error: 'กรุณากรอกชื่อโปรโมชั่น' };
  if (!body.label) return { ok: false, error: 'กรุณากรอกป้ายกำกับ' };

  const courseIdStrings = body.related_public_courses;
  const { ids: objectIds, dropped } = await resolveCourseObjectIdsVerbose(courseIdStrings);

  // 1. Local update
  await Promotion.updateOne(
    { _id: localId },
    {
      $set: {
        title:              body.name,
        thumbnail_url:      body.image_url,
        detail_html:        body.detail_html,
        html_content:       body.detail_html, // legacy mirror
        detail_plain:       body.detail_plain,
        start_date:         toDateOrNull(body.start_at),
        end_date:           toDateOrNull(body.end_at),
        related_course_ids: courseIdStrings,
        is_published:       body.is_published,
        is_pinned:          body.is_pinned,
      },
    }
  );

  // 2. MSDB write-back — only if we have an upstream id (promotions
  //    owned by MSDB use `promotion_id`; genesis-created rows store the
  //    same value in `msdb_id`).
  const upstreamId = promo.msdb_id || promo.promotion_id;
  if (upstreamId) {
    try {
      await msdbUpdate('promotions', upstreamId, {
        ...body,
        related_public_courses: objectIds,
      });
    } catch (err) {
      return {
        ok: false,
        error: `อัปเดต MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
      };
    }
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return {
    ok: true,
    warning: dropped.length
      ? `ไม่พบ course_id: ${dropped.join(', ')} (ไม่ได้บันทึกใน related_public_courses)`
      : undefined,
  };
}

// MongoDB ObjectIds are 24 hex chars. Anything else is a stale
// placeholder (e.g. `genesis-pending-<timestamp>` left by promotions
// created before the dual-write fix landed) and would make MSDB throw
// `Cast to ObjectId failed` if we forwarded it.
function isObjectIdLike(v) {
  return typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
}

/**
 * Delete a promotion. Local-first:
 *   1. Drop the Mongo row + its PromotionConfig.
 *   2. Best-effort write-back to MSDB, but only if `msdb_id` looks
 *      like a real ObjectId. Orphan rows from the pre-fix era simply
 *      vanish locally; there's nothing valid to delete upstream.
 *   3. Upstream failures are logged + surfaced as a `warning` — they
 *      don't undo the local delete (which would leave the admin
 *      unable to remove broken rows at all).
 */
export async function deletePromotion(localId) {
  await requireAdmin('promotions');
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing promotion id' };

  const promo = await Promotion.findById(localId).lean();
  if (!promo) return { ok: false, error: 'ไม่พบโปรโมชั่น' };

  // 1. Local delete first
  await Promotion.deleteOne({ _id: localId });
  if (promo.promotion_id) {
    await PromotionConfig.deleteOne({ promotion_id: promo.promotion_id });
  }
  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');

  // 2. Pick the most likely real upstream id and write-back if valid.
  const candidates = [promo.msdb_id, promo.promotion_id].filter(Boolean);
  const upstreamId = candidates.find(isObjectIdLike);

  if (!upstreamId) {
    // No usable upstream id (e.g. placeholder `genesis-pending-…` from
    // pre-fix era). Local delete already happened — done.
    return { ok: true };
  }

  try {
    await msdbDelete('promotions', upstreamId);
    return { ok: true };
  } catch (err) {
    console.warn('[deletePromotion] MSDB delete failed:', err?.message);
    return {
      ok: true,
      warning: `ลบ local สำเร็จ แต่ลบที่ MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
    };
  }
}
