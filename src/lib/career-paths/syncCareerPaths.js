/**
 * Pull /career-path from the upstream API and upsert each item into the
 * CareerPath collection.
 *
 * Admin-controlled fields are NEVER clobbered by sync. Two protection
 * mechanisms:
 *
 *   1. Scalar Genesis-only fields (`is_active`, `display_order`,
 *      `registrationOpen`, `registerBannerUrl`, `registerBannerPublicId`,
 *      `localCourses`, `requiredSelections`) ride in `$setOnInsert` so
 *      they're initialised once and never touched again.
 *
 *   2. The `curriculum` array is MERGED, not overwritten. Upstream
 *      owns the course list (kinds, course refs, snap data, ordering);
 *      Genesis owns per-item admin extensions (`prerequisites`, `note`,
 *      and the resolved `course_id` code). The merge runs item-by-item,
 *      matching by `publicCourse` ObjectId or `snap.code` so reorders
 *      are handled correctly.
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

  // Upstream curriculum is returned separately so the caller can merge
  // it against the existing Genesis doc (preserving per-item admin
  // additions like `prerequisites`). Deliberately NOT placed in $set.
  const upstreamCurriculum = Array.isArray(item?.curriculum) ? item.curriculum : [];

  return {
    filter: { career_path_id },
    upstreamCurriculum,
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
        // `curriculum` is intentionally absent — merged into $set by
        // the sync loop after fetching the existing Genesis doc.
        upstream_status:   toString(item?.status),
        upstream_order:    sortOrder,
        synced_at:         syncedAt,
      },
      $setOnInsert: {
        is_active:              upstreamActive,
        display_order:          sortOrder,
        // Genesis-only — initialised on first insert, never touched
        // again by sync. Admin can flip these via the course-settings
        // page without worrying about the next cron run reverting them.
        registrationOpen:       false,
        registerBannerUrl:      '',
        registerBannerPublicId: '',
        localCourses:           [],
        requiredSelections:     0,
      },
    },
  };
}

/**
 * Merge upstream curriculum with the existing Genesis curriculum,
 * preserving Genesis-only per-item fields (`prerequisites`, `note`,
 * `course_id`, `snap`).
 *
 * Upstream is the authoritative course list — additions/removals/order
 * changes are honored. Matching against existing items is done by
 * `publicCourse` ObjectId or `snap.code` so a re-ordered group still
 * carries forward each item's prerequisites.
 *
 * For new items (no Genesis match), `prerequisites` defaults to `[]`.
 */
function mergeCurriculum(upstreamCurriculum, existingCurriculum) {
  const safeExisting = Array.isArray(existingCurriculum) ? existingCurriculum : [];

  return upstreamCurriculum.map((upstreamBlock, blockIdx) => {
    const existingBlock = safeExisting[blockIdx];
    const upstreamItems = Array.isArray(upstreamBlock?.items)
      ? upstreamBlock.items
      : [];

    const mergedItems = upstreamItems.map((upstreamItem) => {
      const upstreamRef  = String(upstreamItem?.publicCourse ?? '');
      const upstreamCode = upstreamItem?.snap?.code ?? '';

      const existingItem = Array.isArray(existingBlock?.items)
        ? existingBlock.items.find((ei) => {
            const eiRef  = String(ei?.publicCourse ?? '');
            const eiCode = ei?.snap?.code ?? ei?.course_id ?? '';
            return (
              (upstreamRef  && eiRef  === upstreamRef) ||
              (upstreamCode && eiCode === upstreamCode)
            );
          })
        : null;

      if (!existingItem) {
        return { ...upstreamItem, prerequisites: [] };
      }

      return {
        ...upstreamItem,
        prerequisites: Array.isArray(existingItem.prerequisites)
          ? existingItem.prerequisites
          : [],
        note:      existingItem.note      ?? upstreamItem?.note      ?? '',
        course_id: existingItem.course_id ?? upstreamItem?.course_id ?? '',
        snap:      existingItem.snap      ?? upstreamItem?.snap      ?? {},
      };
    });

    return { ...upstreamBlock, items: mergedItems };
  });
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
      // Fetch the existing Genesis doc (if any) so we can merge in
      // per-item admin extensions before writing. On first insert
      // there's nothing to merge — `mergeCurriculum` handles that.
      const existing = await CareerPath.findOne(shaped.filter)
        .select('curriculum')
        .lean();

      shaped.update.$set.curriculum = mergeCurriculum(
        shaped.upstreamCurriculum,
        existing?.curriculum
      );

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