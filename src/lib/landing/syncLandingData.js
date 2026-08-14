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

import { revalidatePath } from 'next/cache';
import { classifyProbe, composeProgramList } from '@/lib/landing/programProbeOutcome';
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
import { bustUpstream, UPSTREAM_TAGS } from '@/lib/api/bustUpstream';
import {
  assessDowngrade,
  sectionCountsOf,
  permitsSnapshotWrite,
} from '@/lib/cache-console/downgradeGuard';

import { getActiveBanners } from '@/lib/actions/banners';
import { getActiveFeaturedCourseIds } from '@/lib/actions/featured-courses';
import { getActiveFeaturedOnlineCourseIds } from '@/lib/actions/featured-online-courses';
import { getActiveFeaturedReviewIds } from '@/lib/actions/featured-reviews';
import {
  getOrderedPrograms,
  getOrderedSkills,
} from '@/lib/actions/program-order';

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

  /**
   * Fall back to the top 8 from the list if no curated featured exist.
   *
   * ── THE sort_order COMPARATOR HERE IS REPLACED, NOT SUPPLEMENTED ──────────
   * This used to be `[...allCourses].sort((a,b) => (a.sort_order ?? 999) - …)`,
   * the ONLY explicit course sort anywhere in genesis. `allCourses` comes from
   * `listPublicCourses({ includeHidden: true })` above, which now returns the
   * arranged order, so re-sorting by upstream's `sort_order` would take the
   * order back off it — a second owner disagreeing with the first, on the home
   * page.
   *
   * So the sort is GONE rather than made secondary: "the top 8" now means the
   * first 8 in the arranged order, which is what the phrase meant all along.
   * test/fs/courseOrderOwnership fails if any array sort returns here.
   */
  const promotedRaw =
    featuredDetails.length > 0 ? featuredDetails : allCourses.slice(0, MAX_NEW_COURSES);

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

/**
 * @param {object} [options]
 * @param {boolean} [options.allowShrink] bypass the downgrade guard for THIS
 *   run only. Set exclusively by the admin override action, which has shown a
 *   human both counts and taken an explicit confirmation. It is a parameter and
 *   not stored state on purpose: a persisted flag is a permanently disabled
 *   guard that nobody remembers turning off.
 * @param {string} [options.actor] who to attribute a refusal to. Defaults to
 *   the reserved `system:cron` id — the cron and the webhook resync are the
 *   overwhelmingly common callers, and a row that cannot be mistaken for a
 *   person is the point of reserving it.
 */
export async function syncLandingData({ allowShrink = false, actor = 'system:cron' } = {}) {
  await dbConnect();
  const errors = [];
  const syncedAt = new Date();

  /**
   * BEFORE THE FIRST READ, NOT AFTER THE WRITE.
   *
   * This job was the last of the six syncs still missing this, and the omission
   * is invisible from its output: every read below is cached for an hour under
   * one of these tags, so without the bust a run re-reads the SAME cached
   * responses the previous run saw, writes them into LandingCache with a fresh
   * `syncedAt`, and reports `status: 'ok'`. A course published upstream ten
   * minutes ago is still missing from the home page afterwards, and the only
   * signal anyone gets is a green sync. That is the exact failure
   * bustUpstream.js:15-19 states the rule against, and the same one
   * syncNavMenuData:99 and syncCareerPaths:167 already fixed.
   *
   * It matters most on the path where it is easiest to miss: the admin
   * "Sync now" button and the webhook's background resync both exist to make
   * a change appear NOW, and both were capable of returning success having
   * changed nothing at all.
   *
   * ── THE FIVE TAGS ARE THE FIXED-TAG READS BELOW, AND ONLY THOSE ───────────
   *   listPublicCourses      → public-courses   (also covers the per-program
   *                            probe reads: a different `?program=` URL is a
   *                            different Data Cache entry carrying the SAME
   *                            tag, and revalidateTag busts every entry under
   *                            it)
   *   getOnlineCourses       → online-courses
   *   listPrograms           → programs
   *   listSkills             → skills
   *   getReviewsById         → reviews
   *
   * The PER-RECORD tags are NOT busted, exactly as syncNavMenuData:94-98
   * documents for the same reason: `course:<id>` (getCourseByCode) and
   * `schedules:course:<oid>` (listSchedulesByCourse) are keyed by ids this job
   * does not know until after the list read above has returned, so there is
   * nothing to name at this point. A stale one costs an out-of-date cover or
   * schedule row on a card that is otherwise present — visibly worse than
   * fresh, but not the missing-entry class this bust exists for. Named here so
   * the gap is a decision rather than an oversight.
   */
  bustUpstream(
    UPSTREAM_TAGS.PUBLIC_COURSES,
    UPSTREAM_TAGS.ONLINE_COURSES,
    UPSTREAM_TAGS.PROGRAMS,
    UPSTREAM_TAGS.SKILLS,
    UPSTREAM_TAGS.REVIEWS
  );

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
    // includeHidden — the snapshot stores the SUPERSET and getLandingData
    // filters on the way out. Same reasoning as syncNavMenuData's buildEntry:
    // this cron runs on the main-built Production deployment, so a write-time
    // filter would not reach the dev-served home page, and it would make
    // re-publishing wait up to three hours for the next sync.
    listPublicCourses({ includeHidden: true }),
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
  const rawPrograms = unwrapSettled(programsResult, { items: [] }, 'listPrograms', errors).items ?? [];
  const rawSkills = unwrapSettled(skillsResult, { items: [] }, 'listSkills', errors).items ?? [];

  // Apply admin-curated order + visibility before caching, so every
  // consumer of the cached snapshot (home page, public header, etc.)
  // gets the same sorted, hidden-filtered list.
  const [programs, skills] = await Promise.all([
    getOrderedPrograms(rawPrograms).catch((err) => {
      errors.push(`getOrderedPrograms: ${err?.message ?? 'failed'}`);
      return rawPrograms;
    }),
    getOrderedSkills(rawSkills).catch((err) => {
      errors.push(`getOrderedSkills: ${err?.message ?? 'failed'}`);
      return rawSkills;
    }),
  ]);

  // Home "Programs" selector is a public-course browser — drop programs
  // with zero public courses (e.g. online-only) so they don't render as
  // dead cards. Probe upstream per program (the same signal the nav-menu
  // sync uses) rather than deriving from allCourses, whose program ref
  // shape is inconsistent. Applied AFTER getOrderedPrograms so admin
  // order + hidden-filtering are preserved.
  const programProbes = await Promise.allSettled(
    programs.map(async (p) => {
      const pid = String(p.program_id ?? p._id ?? '');
      // includeHidden, matching the phase-1 read above: this probe decides
      // whether a PROGRAM appears at all, and it is cross-checked against
      // `allCourses` just below. Filter one side and not the other and the
      // contradiction check fires on every hidden course.
      const { items } = await listPublicCourses({ program: pid, includeHidden: true });
      return { itemCount: items?.length ?? 0 };
    })
  );

  /**
   * THE SECOND OPINION ON A ZERO. `unwrap()` returns `{ items: [] }` for any
   * response it cannot read, so a probe can report "no courses" without
   * anything throwing. The full course list is already in hand from phase 1;
   * if it shows this program owning a course, a zero from the probe is a
   * contradiction, not a fact. Matching is by `_id` because that is the shape
   * the list actually carries (`course.program` is a populated object).
   */
  const programIdsInCourses = new Set(
    allCourses.map((c) => String(c?.program?._id ?? c?.program ?? '')).filter(Boolean)
  );

  // What the CURRENT snapshot says, so an unknown can fall back to it rather
  // than to nothing. Read before the write, once.
  const previousDoc = await LandingCache.findOne({ key: CACHE_KEY }).lean().exec();
  const previousProgramIds = (previousDoc?.data?.programs ?? []).map((p) =>
    String(p?.program_id ?? p?._id ?? '')
  );

  const probeRows = programs.map((p, i) => {
    const settled = programProbes[i];
    const rejected = settled.status === 'rejected';
    return {
      id: String(p.program_id ?? p._id ?? ''),
      program: p,
      outcome: classifyProbe({
        rejected,
        itemCount: rejected ? 0 : settled.value.itemCount,
        referencedByCourses: programIdsInCourses.has(String(p._id ?? '')),
      }),
      reason: rejected
        ? (settled.reason?.message ?? 'probe failed')
        : 'probe reported 0 courses but the course list disagrees',
    };
  });

  const programOutcome = composeProgramList({
    rows: probeRows,
    previousIds: previousProgramIds,
  });
  const publicPrograms = programOutcome.programs;
  // On EVERY run, not just failing ones — see composeProgramList.
  errors.push(...programOutcome.errors);

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
    programs: publicPrograms.length,
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
  /**
   * EVERY PROBE UNKNOWN → publish nothing. If not one program could be
   * established, this run learned nothing about the Programs tab, and the list
   * it computed is an artefact of the outage rather than a view of the data.
   * Forcing `error` routes it into the preserve-previous branch below, so the
   * existing snapshot stays exactly as it is and the failure is recorded.
   */
  const status =
    programOutcome.allUnknown
      ? 'error'
      : errors.length === 0 ? 'ok' : totalContent > 0 ? 'partial' : 'error';
  if (programOutcome.allUnknown) {
    errors.push(
      `programProbeTotalFailure: all ${probeRows.length} program probes were `
      + 'inconclusive — snapshot left untouched'
    );
  }

  // Preserve last-known-good payload on a total failure so the home
  // page doesn't go blank because of a transient outage.
  let dataToWrite = {
    banners,
    programs: publicPrograms,
    skills,
    newCoursesWithSchedules,
    onlineCoursesForSection,
    reviews,
  };
  // `previousDoc` was already read above for the program fallback — reuse it
  // rather than paying for a second round-trip to answer the same question.
  if (status === 'error' && previousDoc?.data) {
    dataToWrite = previousDoc.data;
  }

  /**
   * ── THE DOWNGRADE GUARD, ON THE WRITE ───────────────────────────────────
   *
   * Here rather than in any caller. `syncLandingData` has four — the cron
   * route, the admin sync route, triggerLandingSync, and the webhook's
   * background resync — and b10bd54 is the standing evidence for what an
   * invariant spread across call sites costs: `revalidatePath` ended up in one
   * writer of four and three shipped stale pages for months.
   *
   * COUNTS COME FROM THE PAYLOADS, NOT FROM `sections`. The `sections` object
   * written below reports the NEW counts even on the preserve-previous branch
   * above, so a stored document can hold 27 programs beside a `sections.programs`
   * of 0. Comparing that against the incoming run would find nothing that could
   * shrink and wave through exactly the run this exists to stop.
   */
  const storedCounts = sectionCountsOf(previousDoc?.data);
  const incomingCounts = sectionCountsOf(dataToWrite);
  const downgrade = assessDowngrade({ storedCounts, incomingCounts, allowShrink });

  if (!permitsSnapshotWrite(downgrade.verdict)) {
    /**
     * REFUSED. `data`, `syncedAt`, `status` and `sections` are all left exactly
     * as they were — the only field written is the refusal record, so the
     * stored snapshot is untouched in every sense that matters to a reader.
     *
     * `$set` on a single field, so a refusal REPLACES its predecessor. A run
     * that would still shrink refuses again next cycle and overwrites this;
     * the refusal never expires on a timer and never auto-clears. It goes away
     * when a run writes — because the world recovered, or because an admin
     * overrode.
     */
    await LandingCache.updateOne(
      { key: CACHE_KEY },
      {
        $set: {
          lastRefusal: {
            at: syncedAt,
            actor,
            storedSections: storedCounts,
            incomingSections: incomingCounts,
            shrunk: downgrade.shrunk,
            vanished: downgrade.vanished,
            reason: downgrade.reason,
            syncStatus: status,
            syncErrors: errors,
          },
        },
      }
    );

    // eslint-disable-next-line no-console
    console.warn(`[syncLandingData] ${downgrade.reason}`);

    // NO revalidatePath: nothing was published, so there is nothing to
    // regenerate, and regenerating would only re-render the same stored
    // snapshot at the cost of a full rebuild.
    return {
      ok: false,
      refused: true,
      verdict: downgrade.verdict,
      reason: downgrade.reason,
      shrunk: downgrade.shrunk,
      storedSections: storedCounts,
      incomingSections: incomingCounts,
      syncedAt: previousDoc?.syncedAt ?? null,
      status,
      sections,
      errors,
    };
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
      // Writing clears the refusal: whatever was blocked has either been
      // repaired by a healthy run or deliberately overridden.
      lastRefusal: null,
    },
    { upsert: true, new: true }
  );

  /**
   * REGENERATE THE HOME PAGE. Writing the cache is only half the job.
   *
   * `src/app/page.jsx` exports no `revalidate` and no `dynamic`, so `/` is
   * FULLY STATIC: built once at deploy and refreshed only by an on-demand
   * `revalidatePath('/')`. Until this line, exactly one of the four callers
   * that rewrite this cache did that —
   *
   *   triggerLandingSync.js:30      revalidated ✓
   *   api/cron/landing-sync         did not      (every 3h, the main path)
   *   api/admin/landing/sync        did not      (the admin's "sync now")
   *   webhooks/handlers.js:110      did not      (MSDB course events)
   *
   * — so a cache repaired by the cron never reached a visitor. That is what
   * kept ค้นหาสิ่งที่คุณสนใจ showing its empty state for hours after the data
   * behind it was correct: the snapshot said 8 programs, the served HTML was
   * built when it said none, and nothing existed to reconcile them short of a
   * deploy.
   *
   * Here rather than in each caller because the invariant belongs to the WRITE:
   * whoever rewrites the snapshot has, by definition, made the built page
   * stale. Three of four call sites forgetting it is what a shared invariant
   * spread across call sites looks like.
   *
   * Guarded: `revalidatePath` throws outside a request/render scope, and a
   * failure to regenerate must not fail a sync that has already succeeded —
   * the next write will try again.
   */
  try {
    revalidatePath('/');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[syncLandingData] revalidatePath("/") skipped:', err?.message ?? err);
  }

  // eslint-disable-next-line no-console
  console.log(`[syncLandingData] status=${status} sections=`, sections);
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.warn('[syncLandingData] errors:', errors);
  }

  return { ok: status !== 'error', syncedAt, status, sections, errors };
}
