/**
 * The site's headline numbers, from their single source.
 *
 *   · organizations, setListed, learners, followers, rating — typed by an admin
 *     at /admin/about (AboutConfig.stats); each falls back to FALLBACK_STATS
 *     until saved.
 *   · courses       — the visible public catalogue: listPublicCourses(), which
 *     already drops courses hidden through CourseExtension.isPublished.
 *   · masterclasses — published MasterclassCourse rows.
 *
 * A computed count that fails, or comes back 0, is `null`: the strip hides that
 * one item rather than print "0 หลักสูตร" because an upstream call timed out.
 * The typed values never fail — a config read that throws falls back to the
 * literals, like a fresh database.
 *
 * Server-only (Mongo + the upstream API). Callers are server components that
 * pass the result down as props.
 */

import { dbConnect } from '@/lib/db/connect';
import AboutConfig from '@/models/AboutConfig';
import { listPublicCourses } from '@/lib/api/public-courses';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { resolveStats } from '@/lib/stats/statsInput';

async function loadStoredStats() {
  await dbConnect();
  const doc = await AboutConfig.findOne({}, { stats: 1, statsAsOf: 1 }).lean();
  return { stats: doc?.stats ?? null, asOf: doc?.statsAsOf ?? '' };
}

async function countCourses() {
  const { items } = await listPublicCourses();
  return Array.isArray(items) ? items.length : 0;
}

async function countMasterclasses() {
  const rows = await getPublishedMasterclasses();
  return Array.isArray(rows) ? rows.length : 0;
}

const positiveOrNull = (n) => (Number.isInteger(n) && n > 0 ? n : null);

/**
 * @param {object} [deps] injectable for tests; production callers pass nothing.
 * @returns {Promise<{ organizations: number, setListed: number, learners: number,
 *   followers: number, rating: number, courses: number|null,
 *   masterclasses: number|null, asOf: string }>}
 */
export async function getSiteStats({
  loadStored = loadStoredStats,
  loadCourseCount = countCourses,
  loadMasterclassCount = countMasterclasses,
} = {}) {
  const [stored, courses, masterclasses] = await Promise.all([
    loadStored().catch(() => ({ stats: null, asOf: '' })),
    loadCourseCount().catch(() => null),
    loadMasterclassCount().catch(() => null),
  ]);

  return {
    ...resolveStats(stored?.stats),
    courses: positiveOrNull(courses),
    masterclasses: positiveOrNull(masterclasses),
    asOf: String(stored?.asOf ?? '').trim(),
  };
}
