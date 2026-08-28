/**
 * Read the home-page snapshot built by `syncLandingData()`.
 *
 * Always returns a complete, render-safe payload — even when the cache
 * is missing, the schema version is stale, or the DB read fails. The
 * home page renders an empty state in those cases rather than 500.
 *
 * Schema-version guard: if a future deploy increases
 * `CURRENT_SCHEMA_VERSION` (e.g., the data shape changes), this
 * function refuses to serve the old document until a fresh sync
 * writes one with the new version. Keeps stale readers from
 * crashing on a moved field.
 */

import { dbConnect } from '@/lib/db/connect';
import LandingCache from '@/models/LandingCache';
import { dropHiddenCourses, loadHiddenCourseIds } from '@/lib/courses/hiddenCourses';
import { siteTodayKey } from '@/lib/articlePublishTime';
import { excludeStartedRounds } from '@/lib/schedule/roundHasStarted';

/**
 * Drop rounds that have already begun from every course in the snapshot.
 *
 * ── ON THE READ, NOT ON THE WRITE, AND THAT IS THE WHOLE POINT ──────────────
 * `syncLandingData` also calls `listSchedulesByCourse`, which now excludes
 * started rounds by default — so the snapshot is already filtered when it is
 * written. That is not enough. The cron runs `0 * /3 * * *`: filtering only at
 * write time would leave a round that started at midnight sitting on THE MOST
 * VISITED PAGE ON THE SITE for up to three hours, against ~30 minutes
 * everywhere else. Re-applying it here costs one pass over a handful of arrays
 * and makes the home page's staleness its own ISR window rather than the cron's.
 *
 * Exactly the reasoning `dropHiddenCourses` is applied here for, and the shape
 * is deliberately the same so the two read-time narrowings sit side by side
 * instead of one being a special case.
 *
 * The cron's OUTPUT IS NOT CHANGED. The snapshot may hold a round this function
 * hides; that is intended, because "has it started" is a question about NOW and
 * a snapshot cannot answer it for a moment that has not happened yet.
 */
function dropStartedRounds(courses) {
  if (!Array.isArray(courses)) return [];
  const todayKey = siteTodayKey();
  return courses.map((c) => ({
    ...c,
    schedules: excludeStartedRounds(c?.schedules, todayKey),
  }));
}

const CACHE_KEY = 'homepage_v1';
const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_DATA = {
  banners: [],
  programs: [],
  skills: [],
  newCoursesWithSchedules: [],
  onlineCoursesForSection: [],
  reviews: [],
};

export async function getLandingData() {
  try {
    await dbConnect();
    const [cache, hidden] = await Promise.all([
      LandingCache.findOne({ key: CACHE_KEY }).lean().exec(),
      /**
       * THE HIDDEN-COURSE FILTER, ON THE READ. Same reasoning as
       * getNavMenuData: syncLandingData runs as a cron on the main-built
       * Production deployment while the home page under test is served from
       * dev, so a write-time filter would not reach it. Reading it here also
       * means re-publishing a course restores its card on the next request
       * rather than at the next 3-hour sync.
       *
       * Paired into the same Promise.all as the snapshot read so it adds no
       * serial latency, and it cannot reject — loadHiddenCourseIds returns an
       * empty set on failure rather than throwing the home page into its
       * empty-state branch.
       */
      loadHiddenCourseIds(),
    ]);

    if (!cache?.data) {
      // eslint-disable-next-line no-console
      console.warn('[getLandingData] no cache present — returning empty defaults');
      return {
        ...DEFAULT_DATA,
        _meta: { status: 'missing', syncedAt: null, snapshotAvailable: false },
      };
    }

    if (cache.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      // eslint-disable-next-line no-console
      console.warn(
        `[getLandingData] schema version mismatch ` +
          `(cache=${cache.schemaVersion}, current=${CURRENT_SCHEMA_VERSION}) — ` +
          `returning empty defaults until next sync`
      );
      return {
        ...DEFAULT_DATA,
        _meta: {
          status: 'schema_mismatch',
          syncedAt: cache.syncedAt ?? null,
          snapshotAvailable: false,
        },
      };
    }

    return {
      ...DEFAULT_DATA,
      ...cache.data,
      // The only course-keyed list in the snapshot. `programs` and `skills` are
      // program/skill rows, not courses; `onlineCoursesForSection` comes from
      // the separate /online-course domain, which CourseExtension does not
      // extend and which has no isPublished of ours to read.
      // Two read-time narrowings, composed: hide withdrawn courses, then drop
      // rounds that have already begun. Order is irrelevant — one filters
      // courses, the other filters each survivor's rounds — and this nesting
      // reads in the order the sentence does.
      newCoursesWithSchedules: dropStartedRounds(
        dropHiddenCourses(cache.data?.newCoursesWithSchedules, hidden)
      ),
      _meta: {
        status: cache.status ?? 'unknown',
        syncedAt: cache.syncedAt ?? null,
        // A snapshot was read. Its sections may still be empty, but that is an
        // answer, not a failure — see snapshotAvailable's note above.
        snapshotAvailable: true,
      },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[getLandingData] read failed:', err?.message ?? err);
    return {
      ...DEFAULT_DATA,
      _meta: { status: 'error', syncedAt: null, snapshotAvailable: false },
    };
  }
}
