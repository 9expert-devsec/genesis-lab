/**
 * Pull /instructors from the upstream API and upsert each item into
 * the Instructor collection. Mirrors the FAQ / Promotion sync pattern.
 *
 * Admin-controlled fields (`is_active`, `display_order`) are written
 * with `$setOnInsert` so admin toggles survive subsequent syncs.
 */

import { revalidatePath } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Instructor from '@/models/Instructor';
import { listInstructors } from '@/lib/api/instructors';
import { bustUpstream, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';

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

  // BEFORE the read — see the note in syncFaqs.js. Nothing else busts this tag.
  bustUpstream(UPSTREAM_TAGS.INSTRUCTORS);

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

  /**
   * REGENERATE THE PAGE THAT BAKED THE OLD ROSTER — same invariant as
   * syncLandingData:436.
   *
   * triggerInstructorSync:16 revalidates `/admin/instructors` and nothing else.
   * That path is ƒ Dynamic, so it needed no invalidation, and the PUBLIC
   * surface got none at all — from every caller, including the trigger.
   *
   * Scope measured, and deliberately NARROW. Instructors reach exactly one
   * statically cached public surface:
   *
   *   /about-us              ○ Static (1h)   ← via actions/about.js:37
   *   /masterclass/[slug]    ƒ Dynamic       ← getInstructorsByIds, no cache
   *   /[...slug]             ƒ Dynamic       ← pageBuilder resolveSectionData
   *
   * So `revalidatePath('/about-us')` covers it. This one does NOT widen to
   * '/' + 'layout' the way the nav menu and career paths do: instructors are
   * not in the header, so nothing outside /about-us goes stale, and dropping
   * the whole public layout cache on a 6-hourly sync would be a cost with no
   * corresponding staleness to fix.
   *
   * Guarded like syncLandingData.
   */
  try {
    revalidatePath('/about-us');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[syncInstructors] revalidatePath("/about-us") skipped:',
      err?.message ?? err
    );
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
