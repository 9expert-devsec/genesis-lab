/**
 * EVERYTHING THAT HAS TO BE INVALIDATED AFTER A RENAME LANDS — as a list.
 *
 * ── WHY A RENAME NEEDS ALL OF THIS AND A GENESIS-ONLY WRITE NEEDED NONE ────
 * While phase 1 wrote Mongo only, upstream was untouched, so every cached
 * upstream read was still CORRECT — merely describing a course whose genesis
 * enrichment had moved. Nothing had to be busted because nothing cached was
 * wrong.
 *
 * The single-action rename changes the upstream row itself. From that moment
 * every cached `/public-course` response is WRONG, not stale: it names a
 * `course_id` that no longer exists. Served from an hour-long ISR cache, the
 * public catalogue advertises a code whose page 404s, `/search` matches on it,
 * and the mega menu links to it — and none of that heals until the window
 * expires, because nothing invalidates on a schedule that fast.
 *
 * ── WHY BOTH CODES, EVERY TIME ─────────────────────────────────────────────
 * The per-record tags are built from whatever code the READ used, so the
 * entries to destroy are the OLD ones — those are the wrong answers now. But
 * the NEW code may already have entries too: any read that happened between the
 * upstream write and this bust cached a correct-but-racing answer, and the
 * rename screen's own read-back is one of them. Busting only the old code
 * leaves that window's entries in place, so both codes are always listed.
 *
 * `publicCourseTag` also gets the `_id`, because `getPublicCourse` tags by
 * whatever it was handed and the admin edit route hands it an ObjectId.
 *
 * ── PURE, SO THE LIST IS ASSERTABLE ────────────────────────────────────────
 * This module decides WHAT to invalidate; the action performs it. That split is
 * the only way "the fan-out covers both codes" can be checked without a request
 * context — and it is why a missing tag shows up as a failing assertion instead
 * of as an hour of wrong pages nobody connects to a rename.
 */

import { UPSTREAM_TAGS, courseTag, publicCourseTag } from '@/lib/api/bustUpstream';

const clean = (v) => String(v ?? '').trim();

/** The public URL a course has when it has no alias. */
export const derivedCoursePath = (code) => `/${clean(code).toLowerCase()}-training-course`;

/**
 * Pages whose rendered HTML names the code and is cached independently of the
 * upstream tags. `revalidateTag` does not reach these — they are route caches,
 * so they need paths.
 */
const ALWAYS_REVALIDATE = Object.freeze([
  '/',                    // home: featured rails carry the code
  '/training-course',     // the catalogue
  '/schedule',            // the code is the FIRST COLUMN of this table
  '/search',              // matches on code and formerCodes
  '/admin/courses',       // the admin list the operator returns to
]);

/**
 * @param {object} input
 * @param {string} input.oldCode
 * @param {string} input.newCode
 * @param {string} [input.upstreamId] the MSDB `_id` — tagged as well as the codes
 * @param {string} [input.alias] the course's stored urlAlias, '' when none
 * @returns {{tags: string[], paths: string[]}} deduped, order-stable
 */
export function renameCacheTargets({ oldCode, newCode, upstreamId, alias } = {}) {
  const from = clean(oldCode);
  const to = clean(newCode);
  const id = clean(upstreamId);
  const stored = clean(alias);

  const tags = [
    // The list read every catalogue surface is built from.
    UPSTREAM_TAGS.PUBLIC_COURSES,
    // Per-record, BOTH codes — see the header.
    courseTag(from), courseTag(to),
    publicCourseTag(from), publicCourseTag(to),
  ];
  if (id) tags.push(publicCourseTag(id));

  const paths = [...ALWAYS_REVALIDATE];

  /**
   * THE TWO DERIVED URLS, AND WHY THE OLD ONE IS LISTED EVEN WHEN AN ALIAS
   * EXISTS.
   *
   * With no alias the public URL is derived from the code, so the rename moves
   * the page: the old path must be invalidated (it is about to 404 or, worse,
   * keep serving a cached page for a course that no longer answers to it) and
   * the new one must be invalidated too (it may hold a cached 404 from someone
   * who guessed the URL early).
   *
   * WITH an alias the URL does not move — but the derived paths are still LIVE
   * ROUTES that resolveCourse answers, so a cached entry under the old derived
   * path outlives the rename just the same. Cheap to bust, and the failure mode
   * of omitting it is a stale page nobody thinks to look at.
   */
  paths.push(derivedCoursePath(from), derivedCoursePath(to));
  if (stored) paths.push(stored);

  const dedupe = (xs) => [...new Set(xs.filter((x) => clean(x) && !/^\/\s*-training-course$/.test(x)))];
  return { tags: dedupe(tags), paths: dedupe(paths) };
}
