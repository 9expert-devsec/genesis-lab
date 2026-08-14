/**
 * Pure planner: when a course's visibility changes, what has to regenerate?
 *
 * Dependency-free ON PURPOSE — no `next/cache`, no db, no models — exactly like
 * lib/webhooks/courseRevalidatePlan.js, and for the same reason: the decision
 * is then unit-testable in the `pure` tier without a Next request context, and
 * the action that executes it stays a thin wrapper around a call anyone can
 * read. `saveCourseExtension` and `deleteCourseExtension` import this, then run
 * the plan through the real `revalidatePath`.
 *
 * ── WHY A FLIP NEEDS MORE THAN THE COURSE'S OWN PAGES ───────────────────────
 * `saveCourseExtension` already revalidates the admin list, the editor, the
 * alias and the derived /<code>-training-course. That was sufficient while
 * `isPublished` gated only URL resolution. It is not any more: hiding a course
 * now removes it from the mega menu, the home page, /training-course,
 * /schedule, every program/skill/-all-courses catalog, the article
 * related-course rails and every page-builder course_list. All of those bake
 * their output, and none of them is under the four paths above — so without
 * this the admin flips the toggle, the course page starts 404ing immediately,
 * and the listings keep advertising it for up to the ISR window.
 *
 * ── THE SCOPE IS `('/', 'layout')`, AND IT IS THE MEASURED ONE ──────────────
 * Not a new idiom. It is what the cache-writer round settled on for exactly
 * this situation — syncNavMenuData and syncCareerPaths both use it, and their
 * reasoning transfers verbatim, because the surface that forces it is the same
 * one: the mega menu lives in PublicHeader, which is mounted from THREE places
 * that share no URL prefix (the (public) layout, the home page inline, and
 * not-found). `(public)` is a route GROUP and contributes no path segment, so
 * there is no expression selecting just its routes; the alternative is
 * enumerating ~30 paths that rot the moment a route is added.
 *
 * ── IT IS CONDITIONAL, AND THAT IS THE POINT ────────────────────────────────
 * `('/', 'layout')` drops the whole public layout cache. Firing it on every
 * save would mean a typo fixed in a meta description costs the site its
 * rendered output — the toll paid by every visitor for a change no visitor can
 * see. A visibility FLIP genuinely changes every listing, so it earns the cost;
 * an SEO edit does not.
 *
 * ── ABSENT MEANS VISIBLE, ON BOTH SIDES ─────────────────────────────────────
 * A course with no CourseExtension row has never been hidden by anybody, and
 * `isPublished` defaults to true — the same reading as the schema, as
 * resolveCourse's `isPublished !== false`, and as the hidden-set query's
 * explicit `{ isPublished: false }`. All four must agree or a course
 * disappears from one surface and not another. So `null` on either side is
 * VISIBLE, which is what makes creating an extension already-hidden, and
 * deleting a hidden one, both register as flips.
 */

/** Is this extension document (or its absence) a VISIBLE course? */
export function isVisibleExtension(ext) {
  if (!ext) return true;
  return ext.isPublished !== false;
}

/**
 * @param {object|null} before the extension as it was, or null if there was none
 * @param {object|null} after  the extension as it now is, or null if removed
 * @returns {{ paths: {path: string, type?: string}[], flipped: boolean }}
 */
export function planVisibilityRevalidation({ before, after } = {}) {
  const wasVisible = isVisibleExtension(before);
  const isVisible = isVisibleExtension(after);
  if (wasVisible === isVisible) return { paths: [], flipped: false };
  return { paths: [{ path: '/', type: 'layout' }], flipped: true };
}
