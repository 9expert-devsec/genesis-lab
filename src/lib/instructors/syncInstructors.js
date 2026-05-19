/**
 * Pull /instructors from the upstream API and upsert each item into
 * the Instructor collection. Mirrors the FAQ / Promotion sync pattern.
 *
 * Admin-controlled fields (`is_active`, `display_order`) are written
 * with `$setOnInsert` so admin toggles survive subsequent syncs.
 */

import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';
import { listInstructors } from '@/lib/api/instructors';

function toStr(v) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function toStrArr(v) {
  if (!Array.isArray(v)) return [];
  return v.map(toStr).filter(Boolean);
}

function shapeUpsert(item, syncedAt) {
  const instructor_id = toStr(item?._id);
  if (!instructor_id) return null;

  return {
    filter: { instructor_id },
    update: {
      $set: {
        instructor_id,
        name:        toStr(item?.name),
        title:       toStr(item?.title),
        bio:         toStr(item?.bio),
        image_url:   toStr(item?.image_url),
        specialties: toStrArr(item?.specialties),
        synced_at:   syncedAt,
      },
      $setOnInsert: {
        is_active:     item?.is_active !== false,
        display_order: Number.isFinite(item?.display_order) ? item.display_order : 0,
      },
    },
  };
}

export async function syncInstructors() {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  let items = [];
  try {
    const resp = await listInstructors();
    items = Array.isArray(resp?.items) ? resp.items : [];
  } catch (err) {
    errors.push(`listInstructors: ${err?.message ?? 'failed'}`);
    return { ok: false, synced: 0, syncedAt, errors };
  }

  let synced = 0;
  for (const item of items) {
    const shaped = shapeUpsert(item, syncedAt);
    if (!shaped) {
      errors.push(`skip: missing _id on item ${item?.name ?? '?'}`);
      continue;
    }
    try {
      await Instructor.updateOne(shaped.filter, shaped.update, { upsert: true });
      synced += 1;
    } catch (err) {
      errors.push(
        `upsert ${shaped.filter.instructor_id}: ${err?.message ?? 'failed'}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[syncInstructors] synced=${synced}/${items.length} errors=${errors.length}`
  );
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncInstructors] errors:', errors);
  }

  return { ok: errors.length === 0, synced, total: items.length, syncedAt, errors };
}
