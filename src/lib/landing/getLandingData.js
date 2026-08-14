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
      newCoursesWithSchedules: dropHiddenCourses(
        cache.data?.newCoursesWithSchedules,
        hidden
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
