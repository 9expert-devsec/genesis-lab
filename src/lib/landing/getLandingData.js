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
    const cache = await LandingCache.findOne({ key: CACHE_KEY }).lean().exec();

    if (!cache?.data) {
      // eslint-disable-next-line no-console
      console.warn('[getLandingData] no cache present — returning empty defaults');
      return { ...DEFAULT_DATA, _meta: { status: 'missing', syncedAt: null } };
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
        },
      };
    }

    return {
      ...DEFAULT_DATA,
      ...cache.data,
      _meta: {
        status: cache.status ?? 'unknown',
        syncedAt: cache.syncedAt ?? null,
      },
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[getLandingData] read failed:', err?.message ?? err);
    return { ...DEFAULT_DATA, _meta: { status: 'error', syncedAt: null } };
  }
}
