/**
 * THE ONE ANSWER TO "WHAT IS THIS COURSE'S CANONICAL URL?"
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 * Three places computed this fact and two of them disagreed, which is how the
 * disagreement got shipped. Measured on the live site before this file existed:
 *
 *   · the course page's `alternates.canonical` was built from `pageUrl`, which
 *     is the URL THE VISITOR ARRIVED AT — so /vibe-code-l1-training-course and
 *     /build-business-apps-with-claude-code-training-course each declared
 *     ITSELF canonical, and 77 courses shipped two self-canonicalising URLs;
 *   · `buildCourseJsonLd` used `extension?.urlAlias || <code>-training-course`
 *     — always the alias, which is the intended rule;
 *   · the sitemap emitted no course URLs at all, so it had no opinion.
 *
 * On a code URL the canonical tag and the JSON-LD `url` therefore named two
 * different pages. Neither was "wrong" in isolation; they were two copies of a
 * rule, and two copies of a rule is a disagreement waiting for someone to edit
 * one of them.
 *
 * So: one function, three callers, and a test that asserts the canonical tag
 * and the JSON-LD are EQUAL rather than merely both plausible. Changing the
 * rule now means changing this file.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * It does not decide which URLs RESOLVE. `resolveCourse` still serves 200 at
 * both the alias and the derived path, and this round does not change that —
 * declaring a canonical is a statement to crawlers, not a redirect. The URL
 * this returns is one of the URLs that already works.
 *
 * PURE: no I/O, no database, no env, no React. That is what lets the page's
 * metadata, the JSON-LD builder and the sitemap all call it.
 */

import { normaliseAlias } from '@/lib/courses/aliasAvailability';

/** The suffix `resolveCourse` strips to recover an upstream course_id. */
const SUFFIX = '-training-course';

/**
 * The derived path for a course that has no custom alias.
 *
 * ── DELIBERATELY NOT `coursePathFromId` ─────────────────────────────────────
 * src/lib/webhooks/courseRevalidatePlan.js exports a function of the same
 * shape, and reusing it would normally be right. It is not right here, because
 * it also rewrites `_` to `-`:
 *
 *     coursePathFromId('POWER_BI')  →  '/power-bi-training-course'
 *
 * and `resolveCourse` recovers the id by uppercasing the fragment, so that path
 * resolves to `POWER-BI` — a different course, or none. The revalidation
 * planner can afford a lossy guess because a wrong cache-purge path is a missed
 * purge; a canonical URL that does not resolve is a page telling Google to
 * index a 404.
 *
 * Measured: zero of the 77 upstream course ids contain an underscore, so the
 * two functions agree on every course that exists today. This is about which
 * rule is CORRECT, not which is currently observable — and the correct one is
 * the exact inverse of what resolveCourse does.
 */
function derivedPath(courseId) {
  const id = String(courseId ?? '').trim();
  if (!id) return null;
  return `/${id.toLowerCase()}${SUFFIX}`;
}

/**
 * A course's canonical PATH — leading slash, no origin, no trailing slash.
 *
 * @param {object|null} course     the upstream course row; only `course_id` is read
 * @param {object|null} extension  the CourseExtension row, or null
 * @returns {string|null} e.g. '/build-business-apps-with-claude-code-training-course',
 *                        or null when there is not enough to build one
 *
 * The alias wins when it is set, and `normaliseAlias` is what decides what "set"
 * means — the SAME function the save path and the conflict check use, so a
 * stored alias is normalised here exactly as it was normalised on the way in.
 * Whitespace, a missing leading slash and a trailing slash all collapse to the
 * one stored form; `''`, `'   '` and `'/'` all collapse to null and fall
 * through to the derived path.
 *
 * NULL, NOT A GUESS, when there is no course_id and no alias. A caller that
 * cannot name the page must omit the claim rather than emit a broken one — the
 * sitemap skips the row, and the metadata falls back to the requested URL,
 * which is what it did for every page before this round.
 */
export function courseCanonicalPath(course, extension) {
  const alias = normaliseAlias(extension?.urlAlias);
  if (alias) return alias;
  return derivedPath(course?.course_id);
}

/**
 * The same answer as an absolute URL, for the two callers that emit one.
 *
 * `alternates.canonical`, `og:url` and the JSON-LD `url` are all absolute, and
 * building the origin at each call site is the same duplication one level up.
 * The base is trimmed of a trailing slash so `${base}${path}` cannot produce
 * `//path` — which is a real URL, resolves to the same page, and would be a
 * THIRD spelling of the canonical.
 *
 * @param {object|null} course
 * @param {object|null} extension
 * @param {string} siteUrl  origin, with or without a trailing slash
 * @returns {string|null}
 */
export function courseCanonicalUrl(course, extension, siteUrl) {
  const path = courseCanonicalPath(course, extension);
  if (!path) return null;
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  return `${base}${path}`;
}
