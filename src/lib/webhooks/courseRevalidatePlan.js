/**
 * Pure revalidation planner for course webhook events.
 *
 * Kept dependency-free ON PURPOSE: no `next/cache`, no db, no models. That is
 * what lets the plan be unit-tested in the `pure` tier without a Next request
 * context or a Mongo connection. `handlers.js` imports these, resolves the live
 * alias list, then executes the plan through the real revalidate calls.
 *
 * Why paths AND tags: the shared upstream fetch is cached in the Data Cache
 * under `course:<id>`, so the tag bust refreshes the DATA. But every distinct
 * URL a course is reachable at — the legacy `/<id>-training-course` and each
 * admin-set `urlAlias` — has its OWN Full Route (prerendered HTML) cache entry,
 * which only a `revalidatePath` for that exact URL regenerates. Bust the tag and
 * MISS an alias path and that alias page keeps serving stale HTML (the roadmap
 * regression this planner fixes).
 */

/**
 * Legacy detail-page path derived from a course code:
 *   "MSE-L1"   → "/mse-l1-training-course"
 *   "POWER_BI" → "/power-bi-training-course"
 * This is the URL `resolveCourse` reconstructs from the `-training-course`
 * suffix; it is NOT the admin `urlAlias` (which is resolved separately).
 */
export function coursePathFromId(courseId) {
  if (!courseId) return null;
  const slug = String(courseId).toLowerCase().replace(/_/g, '-');
  return `/${slug}-training-course`;
}

/**
 * Build the tag + path revalidation plan for a course event.
 *
 * @param {string} event       e.g. 'course.updated' | 'course.created' | 'course.deleted'
 * @param {string} courseId    upstream course_id (human code, e.g. 'MS365-L1')
 * @param {string[]} aliasPaths published urlAlias values for this course (may be empty)
 * @returns {{ tags: string[], paths: string[] }} de-duplicated, order-preserved
 */
export function planCourseRevalidation(event, courseId, aliasPaths = []) {
  const tags = [];
  const paths = [];
  const addTag = (t) => { if (t && !tags.includes(t)) tags.push(t); };
  const addPath = (p) => { if (p && !paths.includes(p)) paths.push(p); };

  if (event === 'course.deleted') {
    // Detail page 404s on its own once upstream drops the course; only the
    // list surfaces need an explicit nudge (unchanged from prior behaviour).
    addTag('public-courses');
    addPath('/search');
    addPath('/');
    return { tags, paths };
  }

  // created or updated → flush detail (tag) + every reachable URL (paths) + lists
  if (courseId) addTag(`course:${courseId}`); // tag used by getCourseByCode
  addTag('public-courses');

  addPath(coursePathFromId(courseId));       // legacy derived path — ALWAYS, even with aliases
  for (const alias of aliasPaths) addPath(alias); // each published urlAlias (0..n)
  addPath('/search');
  addPath('/');

  return { tags, paths };
}
