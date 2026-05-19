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
import { msdbCreate, msdbUpdate, msdbDelete } from '@/lib/api/msdb-write';

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
 * Shape the form payload for MSDB. Field mapping (curl-verified):
 *   name                   ← title             (required, display name)
 *   label                  ← label             (required, e.g. "ลด 20%")
 *   slug                   ← slug              (optional)
 *   image_url              ← image_url
 *   detail_plain           ← description       (plain-text body)
 *   detail_html            ← description_html  (rich body)
 *   start_at               ← start_date
 *   end_at                 ← end_date
 *   is_published           ← is_published
 *   is_pinned              ← is_pinned
 *   related_public_courses ← related_courses   (ObjectId[])
 *
 * MSDB has no discount_type / discount_value fields — drop them. The
 * old form fields are accepted as aliases for migration.
 */
function shapeBody(formData) {
  const get = (k) =>
    formData instanceof FormData ? formData.get(k) : formData?.[k];
  const getAll = (k) => {
    if (formData instanceof FormData) return formData.getAll(k);
    const v = formData?.[k];
    return Array.isArray(v) ? v : [];
  };

  return {
    name:           toStr(get('name')        || get('title')),
    label:          toStr(get('label'))      || 'โปรโมชัน',
    slug:           toStr(get('slug')) || undefined,
    image_url:      toStr(get('image_url')),
    detail_plain:   toStr(get('detail_plain') || get('description')),
    detail_html:    toStr(get('detail_html')  || get('description_html')),
    start_at:       toStr(get('start_at')    || get('start_date')) || null,
    end_at:         toStr(get('end_at')      || get('end_date'))   || null,
    is_published:   toBool(get('is_published')),
    is_pinned:      toBool(get('is_pinned')),
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
  await requireAdmin();
  await dbConnect();

  const body = shapeBody(formData);
  if (!body.name)  return { ok: false, error: 'กรุณากรอกชื่อโปรโมชั่น' };
  if (!body.label) return { ok: false, error: 'กรุณากรอกป้ายกำกับ' };

  // 1. Local insert (placeholder promotion_id until MSDB ack'd)
  let localDoc;
  try {
    localDoc = await Promotion.create({
      promotion_id:    `genesis-pending-${Date.now()}`,
      title:           body.name,
      thumbnail_url:   body.image_url,
      html_content:    body.detail_html,
      detail_plain:    body.detail_plain,
      start_date:      toDateOrNull(body.start_at),
      end_date:        toDateOrNull(body.end_at),
      related_course_ids: body.related_public_courses,
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
  return { ok: true, data: { ...serialize(localDoc), msdb_id: upstreamId } };
}

export async function updatePromotion(localId, formData) {
  await requireAdmin();
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing promotion id' };

  const promo = await Promotion.findById(localId).lean();
  if (!promo) return { ok: false, error: 'ไม่พบโปรโมชั่น' };

  const body = shapeBody(formData);
  if (!body.name)  return { ok: false, error: 'กรุณากรอกชื่อโปรโมชั่น' };
  if (!body.label) return { ok: false, error: 'กรุณากรอกป้ายกำกับ' };

  // 1. Local update
  await Promotion.updateOne(
    { _id: localId },
    {
      $set: {
        title:              body.name,
        thumbnail_url:      body.image_url,
        html_content:       body.detail_html,
        detail_plain:       body.detail_plain,
        start_date:         toDateOrNull(body.start_at),
        end_date:           toDateOrNull(body.end_at),
        related_course_ids: body.related_public_courses,
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
      await msdbUpdate('promotions', upstreamId, body);
    } catch (err) {
      return {
        ok: false,
        error: `อัปเดต MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
      };
    }
  }

  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}

export async function deletePromotion(localId) {
  await requireAdmin();
  await dbConnect();
  if (!localId) return { ok: false, error: 'Missing promotion id' };

  const promo = await Promotion.findById(localId).lean();
  if (!promo) return { ok: false, error: 'ไม่พบโปรโมชั่น' };

  const upstreamId = promo.msdb_id || promo.promotion_id;
  if (upstreamId) {
    try {
      await msdbDelete('promotions', upstreamId);
    } catch (err) {
      // Do not delete locally if upstream delete failed — the admin
      // sees the error and can retry once the upstream is healthy.
      return {
        ok: false,
        error: `ลบจาก MSDB ไม่สำเร็จ: ${err?.message ?? 'unknown'}`,
      };
    }
  }

  await Promotion.deleteOne({ _id: localId });
  await PromotionConfig.deleteOne({ promotion_id: promo.promotion_id });

  revalidatePath(ADMIN_PATH);
  revalidatePath('/promotions');
  return { ok: true };
}
