/**
 * Pull /promotions from the upstream API and upsert each item into the
 * Promotion collection.
 *
 * Admin-controlled fields (`is_active`, `display_order`) are written
 * with `$setOnInsert`, so they are only initialised on first insert
 * and never clobbered by subsequent syncs. Everything else is
 * overwritten on every sync.
 *
 * Called by:
 *   - Manual sync   → POST /api/admin/promotions/sync
 *   - Cron sync     → GET  /api/cron/promotions-sync
 *   - Server action → triggerPromotionSync()
 *
 * Intentionally NOT marked "use server" — server-internal helper.
 */

import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import { listPromotions } from '@/lib/api/promotions';

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function shapeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => ({
      label: toString(t?.label),
      color: toString(t?.color),
    }))
    .filter((t) => t.label);
}

/**
 * Build the upsert payload for one upstream item. Everything in `$set`
 * gets overwritten on every sync; everything in `$setOnInsert` is
 * preserved across syncs (admin-controlled).
 *
 * Insert-time `is_active` mirrors the upstream's "show by default" rule
 * (published + currently active). Expired / unpublished / scheduled rows
 * still get cached so admins can see and toggle them, but they're hidden
 * from the public list until the admin opts in.
 */
function shapeUpsert(item, syncedAt) {
  const promotion_id = toString(item?._id);
  if (!promotion_id) return null;

  const upstreamLive =
    Boolean(item?.is_published) &&
    toString(item?.time_status).toLowerCase() === 'active';

  return {
    filter: { promotion_id },
    update: {
      $set: {
        promotion_id,
        title:          toString(item?.name),
        thumbnail_url:  toString(item?.image_url),
        image_alt:      toString(item?.image_alt),
        api_slug:       toString(item?.slug),
        external_url:   toString(item?.external_url),
        start_date:     toDate(item?.start_at),
        end_date:       toDate(item?.end_at),
        html_content:   toString(item?.detail_html),
        detail_plain:   toString(item?.detail_plain),
        tags:           shapeTags(item?.tags),
        // Upstream sends `related_public_courses` as an array of objects
        // ({ _id, course_id, course_name }). We store the human-readable
        // `course_id` (e.g. "MSE-AI") so it joins against our CoursePromoLink
        // and ExtensionEditor key. Mongo `_id` would not match.
        // Empty = "applies to every course".
        related_course_ids: Array.isArray(item?.related_public_courses)
          ? item.related_public_courses
              .map((c) => {
                if (typeof c === 'string') return c.trim();
                return String(c?.course_id ?? '').trim();
              })
              .filter(Boolean)
          : [],
        is_published:   Boolean(item?.is_published),
        is_pinned:      Boolean(item?.is_pinned),
        publish_status: toString(item?.publish_status),
        time_status:    toString(item?.time_status),
        synced_at:      syncedAt,
      },
      $setOnInsert: {
        is_active:     upstreamLive,
        display_order: 0,
      },
    },
  };
}

export async function syncPromotions() {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  let items = [];
  try {
    // Pull EVERYTHING — the upstream's default response hides expired,
    // unpublished, and scheduled rows. We want all of them in the cache
    // so admins can curate via Promotion.is_active. The public list page
    // uses getActivePromotions() which already filters by is_active.
    const resp = await listPromotions({
      includeExpired:     true,
      includeUnpublished: true,
      includeScheduled:   true,
    });
    items = Array.isArray(resp?.items) ? resp.items : [];
  } catch (err) {
    errors.push(`listPromotions: ${err?.message ?? 'failed'}`);
    return { ok: false, synced: 0, syncedAt, errors };
  }

  let synced = 0;
  for (const item of items) {
    const shaped = shapeUpsert(item, syncedAt);
    if (!shaped) {
      errors.push(`skip: missing _id on item ${item?.slug ?? '?'}`);
      continue;
    }
    try {
      await Promotion.updateOne(shaped.filter, shaped.update, { upsert: true });
      synced += 1;
    } catch (err) {
      errors.push(
        `upsert ${shaped.filter.promotion_id}: ${err?.message ?? 'failed'}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[syncPromotions] synced=${synced}/${items.length} errors=${errors.length}`
  );
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncPromotions] errors:', errors);
  }

  return { ok: errors.length === 0, synced, total: items.length, syncedAt, errors };
}
