/**
 * MSDB → Genesis webhook event handlers.
 *
 * Each handler is invoked by `/api/webhooks/msdb` once the HMAC has been
 * verified. Handlers SHOULD throw on error — the route catches and logs
 * via WebhookLog, then returns 200 so MSDB does not retry. Handlers
 * MUST NOT call MSDB write APIs (dual-write loop risk).
 *
 * Anti-loop:
 *   When Genesis writes a record into MSDB, it stamps `source: 'genesis'`
 *   on the payload. MSDB then dispatches the same payload back to us.
 *   The promotion handler checks for that marker and skips the upsert
 *   (we already have the local row from the original write).
 */

import { revalidatePath, revalidateTag } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Promotion from '@/models/Promotion';
import CareerPath from '@/models/CareerPath';
import Faq from '@/models/Faq';
import Instructor from '@/models/Instructor';

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
function safeRevalidate(path, type) {
  try {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  } catch (err) {
    console.warn('[webhook] revalidatePath failed for', path, err?.message);
  }
}
function safeRevalidateTag(tag) {
  try {
    revalidateTag(tag);
  } catch (err) {
    console.warn('[webhook] revalidateTag failed for', tag, err?.message);
  }
}

// ── handlers ────────────────────────────────────────────────────────

/**
 * Build the public detail-page path for a course code. The public
 * route at `/[...slug]` matches `<slug>-training-course`; the slug is
 * `course_id` lowercased with underscores → dashes.
 *   "MSE-L1"     → "/mse-l1-training-course"
 *   "POWER_BI"   → "/power-bi-training-course"
 */
function coursePathFromId(courseId) {
  if (!courseId) return null;
  const slug = String(courseId).toLowerCase().replace(/_/g, '-');
  return `/${slug}-training-course`;
}

export async function handleCourseEvent(event, data) {
  // We don't mirror course detail rows into Mongo — public pages fetch
  // via aiFetch with cache tags + ISR (revalidate=3600). Bust the
  // tags + paths so the next request hits upstream.
  const courseId = toStr(data?.course_id); // human code, e.g. "MSE-L1"

  if (event === 'course.deleted') {
    // Detail page will 404 on its own once MSDB no longer returns the
    // course — we just need the list surfaces refreshed.
    safeRevalidateTag('public-courses');
    safeRevalidate('/search');
    safeRevalidate('/');
    return;
  }

  // created or updated → flush detail + list caches
  if (courseId) {
    safeRevalidateTag(`course:${courseId}`); // tag used by getCourseByCode
  }
  safeRevalidateTag('public-courses');
  const path = coursePathFromId(courseId);
  if (path) safeRevalidate(path);
  safeRevalidate('/search');
  safeRevalidate('/');

  // Homepage reads from a Mongo LandingCache snapshot built by the
  // landing-sync cron. Trigger a one-shot resync in the background so
  // the snapshot reflects the change without waiting up to 3h for the
  // next cron tick. Fire-and-forget: errors are non-critical.
  try {
    const { syncLandingData } = await import('@/lib/landing/syncLandingData');
    syncLandingData().catch((err) =>
      console.warn('[handleCourseEvent] landing sync failed:', err?.message ?? err)
    );
  } catch (err) {
    console.warn('[handleCourseEvent] could not load syncLandingData:', err?.message ?? err);
  }
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

  // Genesis-created rows live under TWO different keys on the local
  // doc until MSDB ack returns: `promotion_id` may still be the
  // placeholder `genesis-pending-…` while `msdb_id` holds the real
  // upstream `_id`. Match on either so an inbound `promotion.updated`
  // for that row hits the right Mongo document.
  const filter = {
    $or: [
      { promotion_id },
      { msdb_id: promotion_id },
    ],
  };

  if (event === 'promotion.deleted') {
    await Promotion.findOneAndDelete(filter);
    safeRevalidate('/promotions');
    safeRevalidate('/promotions/[slug]', 'page');
    safeRevalidate('/search');
    return;
  }

  // Anti-loop applies ONLY to `promotion.created` — MSDB echoes back
  // our own POST, and the local row already exists from the dual-write
  // server action. `promotion.updated` must still upsert, even when
  // `source === 'genesis'`: it could be an MSDB admin editing a row
  // that was originally created from Genesis.
  if (toStr(data?.source) === 'genesis' && event === 'promotion.created') {
    safeRevalidate('/promotions');
    safeRevalidate('/promotions/[slug]', 'page');
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
        msdb_id:        promotion_id,
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
        source:         toStr(data?.source) || 'msdb',
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
          curriculum:        Array.isArray(data?.curriculum) ? data.curriculum : [],
          upstream_status:   toStr(data?.status),
          upstream_order:    sortOrder,
          synced_at:         new Date(),
        },
        $setOnInsert: {
          is_active:     upstreamActive,
          display_order: sortOrder,
        },
      },
      { upsert: true }
    );
  }

  safeRevalidate('/career-path-project');
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
