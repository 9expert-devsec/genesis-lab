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

export async function handleCourseEvent(event, data) {
  // We don't mirror course detail rows into Mongo — public pages fetch
  // via aiFetch with cache tags + ISR. Bust the tags so the next
  // render hits upstream. The landing-sync cron handles the snapshot.
  const courseId = toStr(data?._id);
  safeRevalidateTag('public-courses');
  if (courseId) safeRevalidateTag(`course:${courseId}`);

  safeRevalidate('/[...slug]', 'page');
  safeRevalidate('/search');
  const slug = toStr(data?.url_slug || data?.slug);
  if (slug) safeRevalidate(`/${slug.replace(/^\/+/, '')}`);
}

export async function handleScheduleEvent(/* event, data */) {
  // Genesis does not cache schedules in Mongo — public pages call
  // listSchedulesByCourse() at request time with a 30-min revalidate.
  // Bust the tag + page caches so the next request fetches fresh data.
  safeRevalidateTag('schedules');
  safeRevalidate('/[...slug]', 'page');
  safeRevalidate('/search');
}

export async function handlePromotionEvent(event, data) {
  await dbConnect();

  // Anti-loop: if this payload originated from Genesis itself (we stamp
  // source: 'genesis' on dual-write), MSDB is just echoing our write
  // back. Skip the upsert — the local row already exists — and only
  // revalidate the public surface.
  if (toStr(data?.source) === 'genesis') {
    safeRevalidate('/promotions');
    safeRevalidate('/promotions/[slug]', 'page');
    return;
  }

  const promotion_id = toStr(data?._id);
  if (!promotion_id) {
    throw new Error('promotion payload missing _id');
  }

  if (event === 'promotion.deleted') {
    await Promotion.findOneAndDelete({ promotion_id });
  } else {
    const upstreamLive =
      Boolean(data?.is_published) &&
      toStr(data?.time_status).toLowerCase() === 'active';

    await Promotion.updateOne(
      { promotion_id },
      {
        $set: {
          promotion_id,
          title:          toStr(data?.name),
          thumbnail_url:  toStr(data?.image_url),
          image_alt:      toStr(data?.image_alt),
          api_slug:       toStr(data?.slug),
          external_url:   toStr(data?.external_url),
          start_date:     toDate(data?.start_at),
          end_date:       toDate(data?.end_at),
          html_content:   toStr(data?.detail_html),
          detail_plain:   toStr(data?.detail_plain),
          tags:           shapeTags(data?.tags),
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
          source:        'msdb',
        },
      },
      { upsert: true }
    );
  }

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
