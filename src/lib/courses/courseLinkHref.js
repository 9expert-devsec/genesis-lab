/**
 * THE ONE FUNCTION EVERY INTERNAL LINK TO A COURSE GOES THROUGH.
 *
 * ══ WHY IT EXISTS BESIDE courseCanonicalPath RATHER THAN INSTEAD OF IT ══════
 * `courseCanonicalPath(course, extension)` takes TWO arguments — the upstream
 * row and the CourseExtension document — because that is the shape the page,
 * the JSON-LD builder and the sitemap all hold. A link call site holds neither:
 * it has ONE list row, with the alias attached to it as `urlAlias` by
 * `listPublicCourses`.
 *
 * So this adapts the shape and DELEGATES the rule. It does not re-derive it.
 * That distinction is the entire point of the round: a link and the page's own
 * <link rel="canonical"> must be able to disagree only if someone edits
 * courseCanonicalPath, never by one of them drifting.
 *
 * ── WHAT IT REPLACES, AND WHY THAT ONE COULD NOT BE FIXED IN PLACE ──────────
 * `courseHref(slug)` in lib/utils takes a STRING and unconditionally appends
 * `-training-course`. It cannot see an alias, because a slug is not a course —
 * and widening it to take an object would change a signature twelve call sites
 * and several tests depend on. It stays for the callers that genuinely hold
 * nothing but a code; this is what everything else uses.
 *
 * ── THE DOUBLE SLASH, WHICH THIS REPO HAS NOW SHIPPED THREE TIMES ──────────
 * Aliases are stored WITH a leading slash. `courseHref` prepends one, so
 * `courseHref('/pretty')` is `//pretty-training-course` — a URL that resolves
 * nowhere. The mega menu works around it by stripping the slash at
 * nav-course-preview.js before calling; round U2 found the same defect in the
 * Course JSON-LD and the BreadcrumbList, both joining `${base}/${alias}`.
 *
 * Three independent occurrences of one mistake is not carelessness, it is a
 * signature that invites it. This function never concatenates: it returns
 * whatever courseCanonicalPath returns, which is already exactly one leading
 * slash. There is nothing here to get wrong.
 *
 * PURE: no I/O, no database, no env, no React.
 */

import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/**
 * The canonical path for a course as an internal link should emit it.
 *
 * @param {object|null} course a course row — upstream fields plus the
 *   `urlAlias` that `listPublicCourses` attaches. A CourseExtension-shaped
 *   object is NOT what this takes; see `courseCanonicalPath` for that.
 * @returns {string} a path with exactly one leading slash, never ''
 *
 * ── THE FALLBACK IS THE CATALOGUE, NOT AN EMPTY STRING ──────────────────────
 * A course with neither a code nor an alias cannot be linked to, and the honest
 * answer is the listing page — which is what `courseHref('')` already returned,
 * so no call site changes behaviour on that path. An empty string would render
 * as `<a href="">`, which reloads the current page and looks like a dead link
 * rather than a missing one.
 */
export function courseLinkHref(course) {
  // `urlAlias` lives on the row; courseCanonicalPath wants it on an extension.
  // This object is the adapter and nothing more — no normalising, no slash
  // handling, no fallback of its own.
  const path = courseCanonicalPath(course, { urlAlias: course?.urlAlias });
  return path ?? '/training-course';
}
