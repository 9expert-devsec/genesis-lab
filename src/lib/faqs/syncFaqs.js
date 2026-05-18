/**
 * Pull /faqs from the upstream API and upsert each item into the
 * Faq collection.
 *
 * Admin-controlled fields (`is_active`, `display_order`, `category_override`)
 * are written with `$setOnInsert`, so they are only initialised on first insert
 * and never clobbered by subsequent syncs. Everything else is overwritten on
 * every sync.
 *
 * Called by:
 *   - Manual sync   → POST /api/admin/faqs/sync
 *   - Cron sync     → GET  /api/cron/faqs-sync
 *   - Server action → triggerFaqSync()
 *
 * Intentionally NOT marked "use server" — server-internal helper.
 */

import { dbConnect } from '@/lib/db/connect';
import Faq from '@/models/Faq';
import { listFaqs } from '@/lib/api/faqs';

function toString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

/**
 * Build the upsert payload for one upstream item. Everything in `$set`
 * gets overwritten on every sync; everything in `$setOnInsert` is
 * preserved across syncs (admin-controlled).
 *
 * Insert-time `is_active` mirrors the upstream's published flag — published
 * FAQs are shown by default, unpublished rows are cached but hidden until
 * the admin opts in.
 */
function shapeUpsert(item, syncedAt) {
  const faq_id = toString(item?._id);
  if (!faq_id) return null;

  return {
    filter: { faq_id },
    update: {
      $set: {
        faq_id,
        question:          toString(item?.question),
        answer_html:       toString(item?.answer_html),
        answer_plain:      toString(item?.answer_plain),
        upstream_category: toString(item?.category),
        is_published:      Boolean(item?.is_published),
        upstream_order:    Number.isFinite(item?.order) ? item.order : 0,
        synced_at:         syncedAt,
      },
      $setOnInsert: {
        is_active:         Boolean(item?.is_published),
        display_order:     Number.isFinite(item?.order) ? item.order : 0,
        category_override: null,
      },
    },
  };
}

export async function syncFaqs() {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  let items = [];
  try {
    const resp = await listFaqs();
    items = Array.isArray(resp?.items) ? resp.items : [];
  } catch (err) {
    errors.push(`listFaqs: ${err?.message ?? 'failed'}`);
    return { ok: false, synced: 0, syncedAt, errors };
  }

  let synced = 0;
  for (const item of items) {
    const shaped = shapeUpsert(item, syncedAt);
    if (!shaped) {
      errors.push(`skip: missing _id on item ${item?.question?.slice(0, 30) ?? '?'}`);
      continue;
    }
    try {
      await Faq.updateOne(shaped.filter, shaped.update, { upsert: true });
      synced += 1;
    } catch (err) {
      errors.push(`upsert ${shaped.filter.faq_id}: ${err?.message ?? 'failed'}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[syncFaqs] synced=${synced}/${items.length} errors=${errors.length}`
  );
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncFaqs] errors:', errors);
  }

  return { ok: errors.length === 0, synced, total: items.length, syncedAt, errors };
}