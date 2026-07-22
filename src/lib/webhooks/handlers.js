/**
 * MSDB → Genesis webhook event handlers.
 *
 * Each handler is invoked by `/api/webhooks/msdb` once the HMAC has been
 * verified. Handlers SHOULD throw on error — the route catches and logs
 * via WebhookLog, then returns 200 so MSDB does not retry. Handlers
 * MUST NOT call MSDB write APIs (dual-write loop risk).
 *
 * All webhook domains here are strictly inbound (MSDB → Genesis). Promotions
 * used to dual-write back to MSDB with a `source: 'genesis'` anti-loop marker;
 * that path has been removed (MANIFESTO §6 — promotions are read-only), so
 * there is no loop to guard against.
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import CareerPath from '@/models/CareerPath';
import Faq from '@/models/Faq';
import Instructor from '@/models/Instructor';
import CourseExtension from '@/models/CourseExtension';
import {
  coursePathFromId,
  planCourseRevalidation,
} from '@/lib/webhooks/courseRevalidatePlan';

// ── shared utils (mirror the sync libs) ─────────────────────────────

function toStr(v) {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toStrArr(v) {
  if (!Array.isArray(v)) return [];
  return v.map(toStr).filter(Boolean);
}

function shapeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => ({ label: toStr(t?.label), color: toStr(t?.color) }))
    .filter((t) => t.label);
}

// Best-effort revalidate — never let a path-not-found error reach the
// route handler, since that would cause a 5xx and an MSDB retry storm.
// Each returns a record of WHAT was revalidated and WHETHER it succeeded, so a
// handler can surface the outcome into WebhookLog (a swallowed console.warn is
// invisible in the audit trail — which is exactly what made the roadmap-stale
// incident an investigation instead of a one-line query).
function safeRevalidate(path, type) {
  const target = type ? `${path} (${type})` : path;
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
    return { type: 'path', target, ok: true };
  } catch (err) {
    console.warn('[webhook] revalidatePath failed for', path, err?.message);
    return { type: 'path', target, ok: false, error: err?.message ?? String(err) };
  }
}
function safeRevalidateTag(tag) {
  try {
    revalidateTag(tag);
    return { type: 'tag', target: tag, ok: true };
  } catch (err) {
    console.warn('[webhook] revalidateTag failed for', tag, err?.message);
    return { type: 'tag', target: tag, ok: false, error: err?.message ?? String(err) };
  }
}

// ── handlers ────────────────────────────────────────────────────────

/**
 * Resolve every PUBLISHED urlAlias for a course_id. Each is a distinct public
 * URL with its own Full Route (HTML) cache, so each must be revalidated by path.
 * A course may have zero aliases (legacy-only URL) or several. Empty/unset
 * aliases (stored as '' / null) are filtered out.
 *
 * `deps` is a test seam only — production passes nothing and the real
 * db/connect + CourseExtension model are used.
 */
export async function collectCourseAliasPaths(courseId, deps = {}) {
  const {
    dbConnect: _dbConnect = dbConnect,
    CourseExtension: _CourseExtension = CourseExtension,
  } = deps;
  if (!courseId) return [];
  await _dbConnect();
  const exts = await _CourseExtension
    .find({ courseId, isPublished: { $ne: false } })
    .select('urlAlias')
    .lean();
  return (Array.isArray(exts) ? exts : [])
    .map((e) => toStr(e?.urlAlias))
    .filter(Boolean);
}

// Homepage reads from a Mongo LandingCache snapshot built by the landing-sync
// cron. Trigger a one-shot resync in the background so the snapshot reflects the
// change without waiting up to 3h for the next tick. Fire-and-forget.
async function defaultSyncLanding() {
  try {
    const { syncLandingData } = await import('@/lib/landing/syncLandingData');
    syncLandingData().catch((err) =>
      console.warn('[handleCourseEvent] landing sync failed:', err?.message ?? err)
    );
  } catch (err) {
    console.warn('[handleCourseEvent] could not load syncLandingData:', err?.message ?? err);
  }
}

export async function handleCourseEvent(event, data, deps = {}) {
  // We don't mirror course detail rows into Mongo — public pages fetch via
  // aiFetch with cache tags + ISR (revalidate=3600). Bust the tags + every
  // reachable path so the next request hits upstream. Returns a structured
  // record of what was revalidated (surfaced into WebhookLog by the route).
  const { syncLanding = defaultSyncLanding } = deps;
  const courseId = toStr(data?.course_id); // human code, e.g. "MSE-L1"
  const revalidated = [];
  const track = (r) => { if (r) revalidated.push(r); };

  // Resolve alias paths FIRST, isolated in its own try/catch: a DB hiccup here
  // must not cost the tag + legacy-path revalidation below. On failure we record
  // the miss and proceed with an empty alias list (legacy URL still works).
  let aliasPaths = [];
  if (event !== 'course.deleted' && courseId) {
    try {
      aliasPaths = await collectCourseAliasPaths(courseId, deps);
    } catch (err) {
      const msg = err?.message ?? String(err);
      console.warn('[handleCourseEvent] alias lookup failed:', msg);
      track({ type: 'alias-lookup', target: `course_id:${courseId}`, ok: false, error: msg });
    }
  }

  const { tags, paths } = planCourseRevalidation(event, courseId, aliasPaths);
  for (const t of tags) track(safeRevalidateTag(t));
  for (const p of paths) track(safeRevalidate(p));

  if (event !== 'course.deleted') await syncLanding();

  return { revalidated };
}

export async function handleScheduleEvent(_event, data) {
  // Genesis does not cache schedules in Mongo — public pages call
  // listSchedulesByCourse() with ISR (30-min revalidate + 'schedules'
  // tag). Same revalidation for create/update/delete, so `event` is
  // intentionally unused here (renamed `_event` to signal intent).
  //
  // Upstream payload carries the linked course as either an ObjectId
  // string (`data.course`) or a populated object (`{ course_id }`).
  const courseId =
    toStr(data?.course?.course_id) || // populated
    toStr(data?.course_id) ||         // explicit
    '';

  safeRevalidateTag('schedules');
  const path = coursePathFromId(courseId);
  if (path) safeRevalidate(path);
  safeRevalidate('/search');
}

export async function handlePromotionEvent(event, data) {
  await dbConnect();

  const promotion_id = toStr(data?._id);
  if (!promotion_id) {
    throw new Error('promotion payload missing _id');
  }

  // Promotions are strictly read-only from MSDB (MANIFESTO §6): match the
  // local row by the upstream key alone. The old dual-write path stored an
  // `msdb_id` alias and matched on either key — that path is gone.
  const filter = { promotion_id };

  if (event === 'promotion.deleted') {
    await Promotion.findOneAndDelete(filter);
    safeRevalidate('/promotions');
    safeRevalidate('/promotions/[slug]', 'page');
    safeRevalidate('/search');
    return;
  }

  const upstreamLive =
    Boolean(data?.is_published) &&
    toStr(data?.time_status).toLowerCase() === 'active';
  const name = toStr(data?.name);

  await Promotion.findOneAndUpdate(
    filter,
    {
      $set: {
        promotion_id,
        // Display name — write the MSDB field (`name`) AND the legacy
        // Genesis field (`title`) so old readers keep working.
        name,
        title:          name,
        label:          toStr(data?.label),
        // MSDB → Genesis field-name aliases. Only the Genesis-style
        // names are in the schema, so MSDB names (slug, image_url,
        // start_at, end_at) are intentionally not written — they'd
        // be silently dropped by Mongoose strict mode.
        api_slug:       toStr(data?.slug),
        thumbnail_url:  toStr(data?.image_url),
        image_alt:      toStr(data?.image_alt),
        external_url:   toStr(data?.external_url),
        start_date:     toDate(data?.start_at),
        end_date:       toDate(data?.end_at),
        detail_html:    toStr(data?.detail_html),
        html_content:   toStr(data?.detail_html), // legacy mirror
        detail_plain:   toStr(data?.detail_plain),
        tags:           shapeTags(data?.tags),
        // course_id strings extracted from MSDB's populated objects (or
        // pass-through if upstream already sent strings).
        related_course_ids: Array.isArray(data?.related_public_courses)
          ? data.related_public_courses
              .map((c) =>
                typeof c === 'string' ? c.trim() : String(c?.course_id ?? '').trim()
              )
              .filter(Boolean)
          : [],
        is_published:   Boolean(data?.is_published),
        is_pinned:      Boolean(data?.is_pinned),
        publish_status: toStr(data?.publish_status),
        time_status:    toStr(data?.time_status),
        synced_at:      new Date(),
      },
      $setOnInsert: {
        is_active:     upstreamLive,
        display_order: 0,
      },
    },
    { upsert: true, new: true }
  );

  safeRevalidate('/promotions');
  safeRevalidate('/promotions/[slug]', 'page');
  safeRevalidate('/search');
}

/**
 * Merge an upstream curriculum (from MSDB) with the existing Genesis
 * curriculum, preserving per-item Genesis-only fields. Mirrors the
 * helper in syncCareerPaths.js — kept local to avoid a cross-module
 * import on the hot webhook path.
 *
 * MSDB owns the course list (kinds, ordering, course refs). Genesis
 * owns `prerequisites`, `note`, `course_id`, and the populated `snap`.
 * Per-item matching is by `publicCourse` ObjectId or `snap.code`, so
 * an upstream reorder still carries the right prereqs to the right
 * item.
 */
function mergeCurriculumPreserveGenesis(upstreamBlocks, existingBlocks) {
  const safeExisting = Array.isArray(existingBlocks) ? existingBlocks : [];
  return upstreamBlocks.map((upBlock, blockIdx) => {
    const exBlock = safeExisting[blockIdx];
    const items = Array.isArray(upBlock?.items)
      ? upBlock.items.map((upItem) => {
          const upRef  = String(upItem?.publicCourse ?? '');
          const upCode = upItem?.snap?.code ?? '';
          const exItem = Array.isArray(exBlock?.items)
            ? exBlock.items.find((ei) => {
                const eiRef  = String(ei?.publicCourse ?? '');
                const eiCode = ei?.snap?.code ?? ei?.course_id ?? '';
                return (upRef  && eiRef  === upRef) ||
                       (upCode && eiCode === upCode);
              })
            : null;
          if (!exItem) {
            return { ...upItem, prerequisites: [] };
          }
          return {
            ...upItem,
            prerequisites: Array.isArray(exItem.prerequisites)
              ? exItem.prerequisites
              : [],
            note:      exItem.note      ?? upItem?.note      ?? '',
            course_id: exItem.course_id ?? upItem?.course_id ?? '',
            snap:      exItem.snap      ?? upItem?.snap      ?? {},
          };
        })
      : [];
    return { ...upBlock, items };
  });
}

export async function handleCareerPathEvent(event, data) {
  await dbConnect();
  const career_path_id = toStr(data?._id);
  if (!career_path_id) throw new Error('career_path payload missing _id');

  if (event === 'career_path.deleted') {
    await CareerPath.findOneAndDelete({ career_path_id });
  } else {
    const detail = data?.detail ?? {};
    const cover  = data?.coverImage ?? {};
    const road   = data?.roadmapImage ?? {};
    const sortOrder = Number.isFinite(data?.sortOrder) ? data.sortOrder : 0;
    const upstreamActive = toStr(data?.status).toLowerCase() === 'active';

    // Read the existing Genesis curriculum + admin-only scalars so the
    // webhook write preserves them. Without this merge, MSDB's echo of
    // an admin save would wipe `prerequisites` on every curriculum item
    // (MSDB strips unknown fields). Same fix pattern as syncCareerPaths.
    const existing = await CareerPath.findOne({ career_path_id })
      .select('curriculum')
      .lean();

    const mergedCurriculum = mergeCurriculumPreserveGenesis(
      Array.isArray(data?.curriculum) ? data.curriculum : [],
      existing?.curriculum
    );

    await CareerPath.updateOne(
      { career_path_id },
      {
        $set: {
          career_path_id,
          api_slug:          toStr(data?.slug),
          title:             toStr(data?.title),
          short_description: toStr(data?.cardDetail),
          tagline:           toStr(detail?.tagline),
          intro:             toStr(detail?.intro),
          description_html:  toStr(detail?.contentHtml),
          objectives:        toStrArr(detail?.objectives),
          suitable_for:      toStrArr(detail?.suitableFor),
          prerequisites:     toStrArr(detail?.prerequisites),
          benefits:          toStrArr(detail?.benefits),
          hero_image_url:    toStr(cover?.url),
          hero_image_alt:    toStr(cover?.alt),
          roadmap_image_url: toStr(road?.url),
          roadmap_image_alt: toStr(road?.alt),
          links:             data?.links ?? {},
          price:             data?.price ?? {},
          curriculum:        mergedCurriculum,
          upstream_status:   toStr(data?.status),
          upstream_order:    sortOrder,
          synced_at:         new Date(),
        },
        $setOnInsert: {
          is_active:              upstreamActive,
          display_order:          sortOrder,
          // Genesis-only — initialised on first insert only, never
          // touched again by webhook upserts.
          registrationOpen:       false,
          registerBannerUrl:      '',
          registerBannerPublicId: '',
          localCourses:           [],
          requiredSelections:     0,
        },
      },
      { upsert: true }
    );
  }

  bustCareerPathCaches();
}

/**
 * Revalidate every surface that renders career-path data.
 *
 * - `/career-path-project` and `/[...slug]` cover the landing + detail
 *   pages.
 * - The public `(public)` layout is what hosts the site-wide nav. The
 *   header reads `getActiveCareerPaths()` on the server; revalidating
 *   the layout busts that cached read so the dropdown reflects upstream
 *   changes immediately.
 * - `career-paths` is the ISR tag used by the read-side aiFetch
 *   adapter — bust it so any upstream-list call goes through.
 * - `/search` lists career paths in autocomplete results.
 */
function bustCareerPathCaches() {
  safeRevalidateTag('career-paths');
  safeRevalidate('/career-path-project');
  safeRevalidate('/(public)', 'layout');
  safeRevalidate('/[...slug]', 'page');
  safeRevalidate('/search');
}

export async function handleFaqEvent(event, data) {
  await dbConnect();
  const faq_id = toStr(data?._id);
  if (!faq_id) throw new Error('faq payload missing _id');

  if (event === 'faq.deleted') {
    await Faq.findOneAndDelete({ faq_id });
  } else {
    // $set ONLY upstream-owned fields. Local overrides
    // (category_override, is_active, display_order) live in
    // $setOnInsert so an admin's manual tweak isn't blown away.
    await Faq.updateOne(
      { faq_id },
      {
        $set: {
          faq_id,
          question:          toStr(data?.question),
          answer_html:       toStr(data?.answer_html),
          answer_plain:      toStr(data?.answer_plain),
          upstream_category: toStr(data?.category),
          is_published:      Boolean(data?.is_published),
          upstream_order:    Number.isFinite(data?.order) ? data.order : 0,
          synced_at:         new Date(),
        },
        $setOnInsert: {
          is_active:         Boolean(data?.is_published),
          display_order:     Number.isFinite(data?.order) ? data.order : 0,
          category_override: null,
        },
      },
      { upsert: true }
    );
  }

  safeRevalidate('/faq');
}

export async function handleInstructorEvent(event, data) {
  await dbConnect();
  const instructor_id = toStr(data?._id);
  if (!instructor_id) throw new Error('instructor payload missing _id');

  if (event === 'instructor.deleted') {
    await Instructor.findOneAndDelete({ instructor_id });
    return;
  }

  await Instructor.updateOne(
    { instructor_id },
    {
      $set: {
        instructor_id,
        name:        toStr(data?.name),
        title:       toStr(data?.title),
        bio:         toStr(data?.bio),
        image_url:   toStr(data?.image_url),
        specialties: toStrArr(data?.specialties),
        synced_at:   new Date(),
      },
      $setOnInsert: {
        is_active:     data?.is_active !== false,
        display_order: Number.isFinite(data?.display_order) ? data.display_order : 0,
      },
    },
    { upsert: true }
  );
  // No public page renders instructors yet — nothing to revalidate.
}

/**
 * Dispatch a single webhook event to the matching handler. Throws on
 * any unrecognised top-level prefix so the receiver logs and returns
 * 200 (which is the contract — never make MSDB retry).
 */
export async function dispatchEvent(event, data) {
  if (!event || typeof event !== 'string') {
    throw new Error('event missing');
  }
  if (event === 'ping') return;

  const prefix = event.split('.')[0];
  switch (prefix) {
    case 'course':       return handleCourseEvent(event, data);
    case 'schedule':     return handleScheduleEvent(event, data);
    case 'promotion':    return handlePromotionEvent(event, data);
    case 'career_path':  return handleCareerPathEvent(event, data);
    case 'faq':          return handleFaqEvent(event, data);
    case 'instructor':   return handleInstructorEvent(event, data);
    default:
      throw new Error(`Unhandled event prefix: ${prefix}`);
  }
}
