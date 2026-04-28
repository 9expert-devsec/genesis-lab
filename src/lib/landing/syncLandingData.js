/**
 * Pull every piece of data the home page needs from the upstream APIs,
 * reshape it into the same enriched form the page would have built at
 * request time, and upsert the result into the LandingCache document.
 *
 * Called by:
 *   - Manual sync   → POST /api/admin/landing/sync
 *   - Cron sync     → GET  /api/cron/landing-sync (Vercel Cron)
 *
 * Intentionally NOT marked `"use server"` — that would expose every
 * export as a Server Action callable from any client component. This
 * file is server-internal; only the route handlers above invoke it.
 *
 * Failure policy:
 *   - Each upstream call uses Promise.allSettled, so one bad endpoint
 *     does not abort the whole sync.
 *   - On total failure (no successful section), we still upsert with
 *     status='error' + the error list, but we keep the previous
 *     `data` in place by reading the existing cache first and merging
 *     non-empty sections forward. This way a temporarily broken
 *     upstream never wipes out a working snapshot.
 */

import { dbConnect } from '@/lib/db/connect';
import LandingCache from '@/models/LandingCache';

import {
  listPublicCourses,
  getCourseByCode,
} from '@/lib/api/public-courses';
import { getOnlineCourses } from '@/lib/api/online-courses';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { getReviewsById } from '@/lib/api/reviews';

import { getActiveBanners } from '@/lib/actions/banners';
import { getActiveFeaturedCourseIds } from '@/lib/actions/featured-courses';
import { getActiveFeaturedOnlineCourseIds } from '@/lib/actions/featured-online-courses';
import { getActiveFeaturedReviewIds } from '@/lib/actions/featured-reviews';

const CACHE_KEY = 'homepage_v1';
const MAX_NEW_COURSES = 8;
const MAX_ONLINE_COURSES = 8;
const MAX_SCHEDULES_PER_COURSE = 3;
const DETAIL_CHUNK = 10;

/** Convert allSettled result to value-or-fallback while collecting errors. */
function unwrapSettled(result, fallback, label, errors) {
  if (result.status === 'fulfilled') return result.value ?? fallback;
  errors.push(`${label}: ${result.reason?.message ?? 'failed'}`);
  return fallback;
}

/**
 * Build the home-page "คอร์สใหม่แนะนำ" payload — featured courses
 * enriched with detail fields (cover/teaser/levels/etc.) and the next
 * up to N upcoming schedules per course. Falls back to top-N from the
 * full list when no admin curation exists.
 */
async function buildNewCoursesWithSchedules({
  allCourses,
  featuredCourseIds,
  skills,
  errors,
}) {
  // Fetch each featured ID's *detail* shape directly — list rows omit
  // course_cover_url / course_teaser / levels, which the card needs.
  const featuredDetailsResults = await Promise.allSettled(
    featuredCourseIds
      .slice(0, MAX_NEW_COURSES)
      .map((id) => getCourseByCode(id))
  );
  const featuredDetails = featuredDetailsResults
    .map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      errors.push(
        `getCourseByCode(${featuredCourseIds[i]}): ${r.reason?.message ?? 'failed'}`
      );
      return null;
    })
    .filter(Boolean);

  // Fall back to the top 8 from the list if no curated featured exist.
  const sorted = [...allCourses].sort(
    (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
  );
  const promotedRaw =
    featuredDetails.length > 0 ? featuredDetails : sorted.slice(0, MAX_NEW_COURSES);

  // Detail-by-id map for cheap lookups during enrichment.
  const detailById = new Map(featuredDetails.map((d) => [d.course_id, d]));

  // When falling back, list rows lack detail fields — backfill them now.
  const toEnrich = featuredDetails.length > 0 ? [] : promotedRaw;
  for (let i = 0; i < toEnrich.length; i += DETAIL_CHUNK) {
    const chunk = toEnrich.slice(i, i + DETAIL_CHUNK);
    const results = await Promise.allSettled(
      chunk.map((c) => getCourseByCode(c.course_id))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        detailById.set(chunk[idx].course_id, r.value);
      } else if (r.status === 'rejected') {
        errors.push(
          `getCourseByCode(${chunk[idx].course_id}): ${r.reason?.message ?? 'failed'}`
        );
      }
    });
  }

  // Pre-fetch up to N upcoming schedules per course in parallel.
  const scheduleResults = await Promise.allSettled(
    promotedRaw.map((c) =>
      listSchedulesByCourse(c._id, { limit: MAX_SCHEDULES_PER_COURSE })
    )
  );
  const schedulesByCourse = new Map();
  scheduleResults.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      schedulesByCourse.set(promotedRaw[idx]._id, r.value?.items ?? []);
    } else {
      errors.push(
        `listSchedulesByCourse(${promotedRaw[idx]._id}): ${r.reason?.message ?? 'failed'}`
      );
    }
  });

  // Skill ID → object lookup so cards don't have to resolve at render time.
  const skillsById = new Map(skills.map((s) => [s._id, s]));

  return promotedRaw.map((c) => {
    const d = detailById.get(c.course_id);
    const base = d
      ? {
          ...c,
          course_cover_url: d.course_cover_url ?? null,
          course_teaser: d.course_teaser ?? null,
          course_levels: d.course_levels ?? null,
          course_traininghours:
            d.course_traininghours ??
            (c.course_trainingdays ? c.course_trainingdays * 6 : null),
          course_workshop_status: d.course_workshop_status ?? null,
          course_certificate_status: d.course_certificate_status ?? null,
          course_type_public: d.course_type_public ?? null,
          course_type_inhouse: d.course_type_inhouse ?? null,
          skills: d.skills ?? c.skills,
        }
      : c;

    return {
      ...base,
      skills: Array.isArray(base.skills)
        ? base.skills
            .map((s) => (typeof s === 'string' ? skillsById.get(s) : s))
            .filter(Boolean)
        : [],
      schedules: schedulesByCourse.get(c._id) ?? [],
    };
  });
}

/**
 * Build the home-page "คอร์สออนไลน์" payload — admin-curated subset of
 * online courses, ordered by the admin's `sort_order`, with skill IDs
 * resolved to skill objects.
 */
function buildOnlineCoursesForSection({
  allOnline,
  featuredOnlineIds,
  skills,
}) {
  const byId = new Map(
    allOnline.map((c) => [
      typeof c.o_course_id === 'string' ? c.o_course_id.trim() : '',
      c,
    ])
  );
  const skillsById = new Map(skills.map((s) => [s._id, s]));

  return featuredOnlineIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .slice(0, MAX_ONLINE_COURSES)
    .map((c) => ({
      ...c,
      skills: Array.isArray(c.skills)
        ? c.skills
            .map((s) => (typeof s === 'string' ? skillsById.get(s) : s))
            .filter(Boolean)
        : [],
    }));
}

export async function syncLandingData() {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  // Phase 1 — fetch every "leaf" data source in parallel. Anything that
  // depends on the result of these (per-course detail, schedules, etc.)
  // happens in phase 2.
  const [
    coursesResult,
    onlineResult,
    programsResult,
    skillsResult,
    bannersResult,
    featuredCourseIdsResult,
    featuredOnlineIdsResult,
    featuredReviewIdsResult,
  ] = await Promise.allSettled([
    listPublicCourses(),
    getOnlineCourses(),
    listPrograms(),
    listSkills(),
    getActiveBanners(),
    getActiveFeaturedCourseIds(),
    getActiveFeaturedOnlineCourseIds(),
    getActiveFeaturedReviewIds(),
  ]);

  const allCourses = unwrapSettled(coursesResult, { items: [] }, 'listPublicCourses', errors).items ?? [];
  const allOnline = unwrapSettled(onlineResult, { items: [] }, 'getOnlineCourses', errors).items ?? [];
  const programs = unwrapSettled(programsResult, { items: [] }, 'listPrograms', errors).items ?? [];
  const skills = unwrapSettled(skillsResult, { items: [] }, 'listSkills', errors).items ?? [];
  const banners = unwrapSettled(bannersResult, [], 'getActiveBanners', errors);
  const featuredCourseIds = unwrapSettled(
    featuredCourseIdsResult, [], 'getActiveFeaturedCourseIds', errors
  );
  const featuredOnlineIds = unwrapSettled(
    featuredOnlineIdsResult, [], 'getActiveFeaturedOnlineCourseIds', errors
  );
  const featuredReviewIds = unwrapSettled(
    featuredReviewIdsResult, [], 'getActiveFeaturedReviewIds', errors
  );

  // Phase 2 — derived sections that depend on phase-1 results.
  const [newCoursesWithSchedules, reviewsResult] = await Promise.all([
    buildNewCoursesWithSchedules({
      allCourses,
      featuredCourseIds,
      skills,
      errors,
    }),
    getReviewsById(featuredReviewIds).catch((err) => {
      errors.push(`getReviewsById: ${err?.message ?? 'failed'}`);
      return [];
    }),
  ]);

  const onlineCoursesForSection = buildOnlineCoursesForSection({
    allOnline,
    featuredOnlineIds,
    skills,
  });

  const reviews = reviewsResult ?? [];

  const sections = {
    banners: banners.length,
    programs: programs.length,
    skills: skills.length,
    newCourses: newCoursesWithSchedules.length,
    onlineCourses: onlineCoursesForSection.length,
    reviews: reviews.length,
  };

  // Status semantics:
  //   ok      — no upstream errors at all
  //   partial — some sections came back populated, but at least one failed
  //   error   — total wipeout (every key section is empty)
  const totalContent =
    sections.banners +
    sections.programs +
    sections.newCourses +
    sections.onlineCourses +
    sections.reviews;
  const status =
    errors.length === 0 ? 'ok' : totalContent > 0 ? 'partial' : 'error';

  // Preserve last-known-good payload on a total failure so the home
  // page doesn't go blank because of a transient outage.
  let dataToWrite = {
    banners,
    programs,
    skills,
    newCoursesWithSchedules,
    onlineCoursesForSection,
    reviews,
  };
  if (status === 'error') {
    const previous = await LandingCache.findOne({ key: CACHE_KEY }).lean().exec();
    if (previous?.data) dataToWrite = previous.data;
  }

  await LandingCache.findOneAndUpdate(
    { key: CACHE_KEY },
    {
      key: CACHE_KEY,
      data: dataToWrite,
      syncedAt,
      status,
      syncErrors: errors, // schema field renamed to dodge Mongoose reserved `errors`
      sections,
      schemaVersion: 1,
      source: 'external_api',
    },
    { upsert: true, new: true }
  );

  // eslint-disable-next-line no-console
  console.log(`[syncLandingData] status=${status} sections=`, sections);
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncLandingData] errors:', errors);
  }

  return { ok: status !== 'error', syncedAt, status, sections, errors };
}
