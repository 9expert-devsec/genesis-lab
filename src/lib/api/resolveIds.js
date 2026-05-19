/**
 * Shared course_id → ObjectId resolver.
 *
 * MSDB stores foreign-key fields (`related_public_courses` on Promotion,
 * `previous_course`/`related_courses` on PublicCourse, `course` on
 * Schedule) as ObjectId references. Genesis admin UIs work with the
 * user-meaningful `course_id` code (e.g. `"POWER-BI-PQ"`), so we map
 * codes → `_id`s on the way out.
 *
 * Strategy: one upstream fetch of the full course list per call, cached
 * by Next's ISR for 5 minutes. The list is small (~70 rows) so an
 * O(N) lookup is fine; the cache cuts repeat hits when several
 * resolves happen in one request.
 *
 * Unresolved codes are silently dropped — callers that care about the
 * difference between "no ids requested" and "all ids were bad" can
 * compare input/output lengths.
 */

import { aiFetch, unwrap } from './client';

const PATH = '/public-course';
const REVALIDATE = 300; // 5 min

async function loadCourseLookup() {
  const raw = await aiFetch(PATH, { revalidate: REVALIDATE });
  const { items } = unwrap(raw);
  const map = new Map();
  for (const c of items) {
    if (c?.course_id && c?._id) {
      map.set(String(c.course_id), String(c._id));
    }
  }
  return map;
}

/**
 * Resolve an array of course_id strings to their MongoDB ObjectIds.
 * @param {string[]} courseIds
 * @returns {Promise<string[]>}
 */
export async function resolveCourseObjectIds(courseIds = []) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) return [];
  const wanted = courseIds.map((s) => String(s).trim()).filter(Boolean);
  if (wanted.length === 0) return [];

  let lookup;
  try {
    lookup = await loadCourseLookup();
  } catch (err) {
    console.warn('[resolveIds] aiFetch failed:', err?.message);
    return [];
  }

  return wanted.map((code) => lookup.get(code)).filter(Boolean);
}

/**
 * Variant that ALSO returns the codes that couldn't be resolved, so
 * callers (e.g. server actions) can surface them in a warning toast.
 */
export async function resolveCourseObjectIdsVerbose(courseIds = []) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return { ids: [], dropped: [] };
  }
  const wanted = courseIds.map((s) => String(s).trim()).filter(Boolean);
  if (wanted.length === 0) return { ids: [], dropped: [] };

  let lookup;
  try {
    lookup = await loadCourseLookup();
  } catch (err) {
    console.warn('[resolveIds] aiFetch failed:', err?.message);
    return { ids: [], dropped: [...wanted] };
  }

  const ids = [];
  const dropped = [];
  for (const code of wanted) {
    const id = lookup.get(code);
    if (id) ids.push(id);
    else    dropped.push(code);
  }
  return { ids, dropped };
}

/**
 * Resolve a single course_id to its `_id`. Returns null if not found.
 */
export async function resolveCourseObjectId(courseId) {
  const ids = await resolveCourseObjectIds([courseId]);
  return ids[0] ?? null;
}
