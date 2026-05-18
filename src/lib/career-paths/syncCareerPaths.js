/**
 * Pull /career-path from the upstream API and upsert each item into the
 * CareerPath collection.
 *
 * Admin-controlled fields (`is_active`, `display_order`) are written
 * with `$setOnInsert`, so they are only initialised on first insert
 * and never clobbered by subsequent syncs. Everything else is
 * overwritten on every sync.
 *
 * Called by:
 *   - Manual sync   → POST /api/admin/career-paths/sync
 *   - Cron sync     → GET  /api/cron/career-paths-sync
 *   - Server action → triggerCareerPathSync()
 *
 * Intentionally NOT marked "use server" — server-internal helper.
 */

import { dbConnect } from '@/lib/db/connect';
import CareerPath from '@/models/CareerPath';
import { listCareerPaths } from '@/lib/api/career-paths';

function toString(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(toString).filter((s) => s.length > 0);
}

function shapeUpsert(item, syncedAt) {
  const career_path_id = toString(item?._id);
  if (!career_path_id) return null;

  const detail = item?.detail ?? {};
  const cover  = item?.coverImage ?? {};
  const road   = item?.roadmapImage ?? {};
  const sortOrder = Number.isFinite(item?.sortOrder) ? item.sortOrder : 0;
  const upstreamActive = toString(item?.status).toLowerCase() === 'active';

  return {
    filter: { career_path_id },
    update: {
      $set: {
        career_path_id,
        api_slug:          toString(item?.slug),
        title:             toString(item?.title),
        short_description: toString(item?.cardDetail),
        tagline:           toString(detail?.tagline),
        intro:             toString(detail?.intro),
        description_html:  toString(detail?.contentHtml),
        objectives:        toStringArray(detail?.objectives),
        suitable_for:      toStringArray(detail?.suitableFor),
        prerequisites:     toStringArray(detail?.prerequisites),
        benefits:          toStringArray(detail?.benefits),
        hero_image_url:    toString(cover?.url),
        hero_image_alt:    toString(cover?.alt),
        roadmap_image_url: toString(road?.url),
        roadmap_image_alt: toString(road?.alt),
        links:             item?.links ?? {},
        price:             item?.price ?? {},
        curriculum:        Array.isArray(item?.curriculum) ? item.curriculum : [],
        upstream_status:   toString(item?.status),
        upstream_order:    sortOrder,
        synced_at:         syncedAt,
      },
      $setOnInsert: {
        is_active:     upstreamActive,
        display_order: sortOrder,
      },
    },
  };
}

export async function syncCareerPaths() {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  let items = [];
  try {
    // status=all so cached collection includes unpublished rows — admins
    // can toggle them on without a follow-up sync.
    const resp = await listCareerPaths({ status: 'all', limit: 100 });
    items = Array.isArray(resp?.items) ? resp.items : [];
  } catch (err) {
    errors.push(`listCareerPaths: ${err?.message ?? 'failed'}`);
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
      await CareerPath.updateOne(shaped.filter, shaped.update, { upsert: true });
      synced += 1;
    } catch (err) {
      errors.push(
        `upsert ${shaped.filter.career_path_id}: ${err?.message ?? 'failed'}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[syncCareerPaths] synced=${synced}/${items.length} errors=${errors.length}`
  );
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncCareerPaths] errors:', errors);
  }

  return { ok: errors.length === 0, synced, total: items.length, syncedAt, errors };
}