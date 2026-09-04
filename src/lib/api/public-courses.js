/**
 * Public Courses adapter.
 *
 * Upstream path: `/public-course` (singular — confirmed by curl
 * against live MSDB). The integration guide mixes singular and plural
 * in examples; only the singular form returns 200 + data.
 *
 * curl-verified: 2026-04-22
 */

import { aiFetch, unwrap } from './client';
import { loadCourseOrder } from '@/lib/courses/courseOrderStore';
import { orderCoursesInCategory, orderCoursesGlobally } from '@/lib/courses/courseOrder';
import {
  dropHiddenCourses,
  loadHiddenCourseIds,
  loadCourseAliasMap,
  attachAliases,
} from '@/lib/courses/hiddenCourses';

const PATH = '/public-course';

/**
 * List all active public courses.
 * Optional filters: skill (skill ID), program (program ID).
 *
 * ── COURSES HIDDEN BY AN ADMIN ARE REMOVED BY DEFAULT ───────────────────────
 * Upstream has never heard of `CourseExtension.isPublished`, so this is the one
 * place a hidden course can be taken out of every listing at once. It is opt-OUT
 * rather than opt-in on purpose: the failure mode of the old arrangement was a
 * surface that had simply never been told about the flag, and a default that
 * filters means the next listing surface anyone adds is correct without its
 * author knowing this rule exists.
 *
 * `includeHidden: true` is for the callers that MUST still see everything, and
 * it is stated at each call site rather than inherited:
 *
 *   · every /admin picker and table — including the previous_course picker,
 *     whose `allCourses` prop is how a STORED prerequisite is resolved. Filter
 *     it and a course whose prerequisite is hidden silently loses it on the next
 *     save;
 *   · the sync writers — snapshots store the superset and their READ paths
 *     filter (see lib/courses/hiddenCourses for why that split, and what it
 *     buys on a UAT deploy that main has not caught up with);
 *   · checkAliasAvailable — a hidden course still owns its legacy
 *     /<code>-training-course path, so the shadow check has to keep seeing it;
 *   · buildCourseNameMap — a registration taken for a course that has since
 *     been hidden must still render the course's NAME, not its bare code.
 *
 * NOT in that list, and deliberately: the create page's duplicate-code guard,
 * `findCourseCodeInsensitive`. It does its own uncached
 * `aiFetch('/public-course', { revalidate: 0 })` and never comes through here,
 * so it is unaffected by construction rather than by remembering — which
 * matters, because a guard that stopped seeing hidden courses would let an
 * admin create a colliding code and overwrite a hidden course's SEO, gallery
 * and omisePaymentEnabled (saveCourseExtension upserts a whole document keyed
 * by the code). test/fs pins that it stays on its own read.
 */
export async function listPublicCourses(
  { skill, program, includeHidden = false } = {},
  /**
   * `deps`, for exactly the reason getCourseByCodeInsensitive below carries its
   * own: what this function now does is decide WHICH list comes back, and that
   * is not observable from source text — an fs guard asserting "the filter is
   * called" is what let the original gate sit here, green, covering one surface
   * out of twelve. Production callers pass nothing.
   */
  {
    fetchUpstream = aiFetch,
    loadHidden = loadHiddenCourseIds,
    loadOrder = loadCourseOrder,
    /**
     * The alias map, injectable for the same reason the three above are: what
     * this function now does is decide WHICH rows come back AND what each one
     * is named, and neither is observable from source text. An fs guard
     * asserting "attachAliases is called" is the shape that let the original
     * hidden filter cover one surface out of twelve while staying green.
     */
    loadAliases = loadCourseAliasMap,
  } = {}
) {
  const raw = await fetchUpstream(PATH, {
    params: { skill, program },
    tags: ['public-courses'],
  });
  let result = unwrap(raw);

  /**
   * ── THE ORDER IS APPLIED HERE, AT THE ORIGIN, AND ABOVE THE EARLY RETURN ──
   *
   * Every course list in this codebase comes from this function — there is no
   * second origin. Ordering here rather than at the surfaces means two whole
   * classes of mistake cannot occur: there is no separate call whose result a
   * caller could compute and then drop, and a filtered call cannot be ordered
   * by the wrong category, because the rank map is derived from THE SAME
   * ARGUMENT that selected the courses.
   *
   * ABOVE `if (includeHidden) return result` ON PURPOSE. Thirteen of the
   * twenty-five call sites take that path — including syncNavMenuData, which
   * builds the entire mega menu, and syncLandingData. Ordering below it would
   * leave the highest-traffic surface on upstream's order, and because the seed
   * captures the order the site already renders, that mistake looks CORRECT on
   * the day it ships and only appears the first time an admin rearranges
   * something. There is an assertion pinned to this specifically.
   *
   * NO OPT-OUT PARAMETER, ruled and deliberate. The order is a property of the
   * origin, not a request a caller may decline. A surface that one day needs a
   * different order — a "sort by price" control, say — is a deliberate decision
   * that gets its own guard, not a quiet argument threaded through here; adding
   * one re-opens exactly the hole this closes, because "did this caller opt
   * out, and should it have?" is unanswerable from source.
   *
   * `loadOrder` returns null when the order must not be applied — the read
   * failed, or nothing is seeded yet. Both leave the array exactly as upstream
   * sent it. See lib/courses/courseOrderStore.js for why that is the safe
   * direction and "order nothing" is not.
   */
  const order = await loadOrder();
  if (order) {
    const items = result.items ?? [];
    if (program) {
      result = { ...result, items: orderCoursesInCategory(items, order.programCourseOrder.get(String(program))) };
    } else if (skill) {
      result = { ...result, items: orderCoursesInCategory(items, order.skillCourseOrder.get(String(skill))) };
    } else {
      result = { ...result, items: orderCoursesGlobally(items, {
        programRank: order.programRank,
        courseOrderByProgram: order.programCourseOrder,
      }) };
    }
  }

  /**
   * ── THE ALIAS IS ATTACHED HERE, ABOVE THE includeHidden RETURN ────────────
   * ROUND U3, and the position is the whole of it. Thirteen of the twenty-five
   * call sites take the `includeHidden` path — syncNavMenuData, which builds
   * the mega menu, and syncLandingData, which builds the home page's cached
   * course strip, among them. Attaching below the early return would give the
   * alias to the catalogue and the schedule page and silently withhold it from
   * the two highest-traffic surfaces, which would then keep emitting the code
   * form while every test on the other surfaces passed. Exactly the ordering
   * argument the course-order block above makes, for the same reason.
   *
   * COSTS NO EXTRA QUERY. `loadCourseAliasMap` is a projection of the same
   * per-request read `loadHidden` already performs, memoised by React.cache, so
   * whichever is called first pays for both.
   *
   * The alias travels as `urlAlias` on the row, exactly as stored — leading
   * slash included. `courseCanonicalPath` is what interprets it; nothing on the
   * way strips or re-adds a slash, because doing that at a call site is how
   * `//alias` shipped twice.
   */
  const aliasByCode = await loadAliases();
  result = { ...result, items: attachAliases(result.items, aliasByCode) };

  if (includeHidden) return result;

  const hidden = await loadHidden();
  if (hidden.size === 0) return result;

  const items = dropHiddenCourses(result.items, hidden);
  // `total` is re-derived rather than carried through: it is upstream's count of
  // the UNFILTERED list, and a caller rendering "N courses" above a grid of
  // fewer than N is the same class of quiet wrongness this change is removing.
  return { ...result, items, total: items.length };
}

/**
 * Get a single course by ID or slug/code (e.g. "MSE-L1" or Mongo ObjectId).
 * Upstream supports both via the same `course` query parameter.
 */
export async function getPublicCourse(idOrCode) {
  const raw = await aiFetch(PATH, {
    params: { course: idOrCode },
    tags: [`public-course:${idOrCode}`],
  });
  const { items } = unwrap(raw);
  return items[0] ?? null;
}

/**
 * Fetch a single course by its short course_id (e.g. "COPILOT-STU").
 * Returns the full detail-response shape (see docs/api-domains.md)
 * or null if not found.
 *
 * IMPORTANT: upstream's `/public-course?_id=<objectId>` silently
 * ignores the parameter and returns all 73 courses unfiltered. Only
 * `course_id` filter works for fetching individual courses.
 * curl-verified 2026-04-23.
 */
export async function getCourseByCode(courseId) {
  if (!courseId) return null;
  const raw = await aiFetch(PATH, {
    params: { course_id: courseId },
    tags: [`course:${courseId}`],
  });
  const { items } = unwrap(raw);
  return items?.[0] ?? null;
}

/**
 * getCourseByCode, matching `course_id` without regard to case.
 *
 * ── WHY THIS IS PERMANENT, NOT A STOPGAP ───────────────────────────────────
 * `course_id` has NO canonical casing. Upstream is free to store any, and a
 * mixed-case id is a valid id — the fact that 72 of 77 happen to be uppercase
 * is an accident of data entry, not a rule anyone enforces. So this function is
 * the fix, not a bridge to a migration: do not "clean up" the five ids and
 * delete it, and do not add a normalisation step anywhere. Nothing guarantees a
 * sixth mixed-case course won't be created tomorrow.
 *
 * ── THE PROBLEM IT SOLVES ──────────────────────────────────────────────────
 * Upstream `?course_id=` is EXACT-MATCH case-sensitive, and 5 of 77 courses
 * carry mixed-case ids (measured 2026-08-06: Power-Apps, SQL-PG-Query,
 * SQL-ADM-Tuning, MS-SQL-19-Prov, SQL-ADM-Secure). Every public URL is built
 * from `course_id.toLowerCase()`, and both the registration page and
 * resolveCourse uppercase it back before looking it up — so for those five,
 * NEITHER casing ever matches and the course is unreachable. The registration
 * page bounced to the catalog; the detail page 404'd outright. `?course=` is
 * exact-match too, so there is no case-insensitive upstream lookup to switch to.
 *
 * ── THE COST ───────────────────────────────────────────────────────────────
 * The direct call is tried FIRST and unconditionally returned when it hits, so
 * the 72 already-uppercase courses pay exactly what they paid before: one
 * `?course_id=` fetch, same `course:<id>` cache tag, no list fetch. Only a miss
 * pays for the fallback, and a miss is either one of the five or a genuinely
 * bad link.
 *
 * On the fallback path: one `listPublicCourses()` (ISR-cached under the
 * `public-courses` tag, which the course webhook already busts alongside
 * `course:<id>`) plus one re-fetch by the exact id.
 *
 * The re-fetch is deliberate. The list row was measured byte-identical to the
 * detail response for all 37 keys (2026-08-06), so returning `match` directly
 * would work today and save a call — but it would silently couple both callers
 * to upstream never trimming its list payload, and a detail page rendering with
 * quietly-missing fields is a far worse failure than one extra cached fetch on
 * a path 5 courses take. To flip it, return `match` instead.
 *
 * ── THE MATCH ──────────────────────────────────────────────────────────────
 * Exact-except-case. Not fuzzy, not prefix, not punctuation-insensitive: a
 * genuinely missing course must still miss, or a typo'd link silently lands the
 * user on some other course's registration form.
 *
 * `deps` exists so the two paths are testable without a network; production
 * callers pass nothing. `info` is injectable for the same reason — the
 * verification suite runs every file in ONE process with concurrency:true, so a
 * test that swapped the global console method would capture unrelated files'
 * output and fail intermittently.
 */
export async function getCourseByCodeInsensitive(
  courseId,
  {
    fetchByCode = getCourseByCode,
    fetchList = listPublicCourses,
    info = console.info,
    /**
     * Passed straight to the fallback list read. The DIRECT `?course_id=` fetch
     * above is an upstream lookup and never saw the hidden flag, so without this
     * a hidden course with a mixed-case id would be unreachable even to an
     * authenticated admin preview — the direct fetch misses on casing, and the
     * list that would have recovered it has had the course filtered out. The two
     * paths must agree about what exists, or hiding a course would silently
     * un-preview exactly five of them.
     */
    includeHidden = false,
  } = {}
) {
  if (!courseId) return null;

  const direct = await fetchByCode(courseId);
  if (direct) return direct;

  const { items } = await fetchList({ includeHidden });
  const wanted = String(courseId).toLowerCase();
  const match = (items ?? []).find(
    (c) => String(c?.course_id ?? '').toLowerCase() === wanted
  );
  if (!match) return null;

  // Info, not warn: a mixed-case id is VALID, so this reports a COST, not a
  // defect — the course needed an extra list lookup to resolve, and this names
  // which ids pay it. Do not reword this into "fix the casing upstream": that
  // was the original wording, and it read as an instruction to go change
  // records that were never wrong.
  info(
    `[courses] course_id "${match.course_id}" needed the case-insensitive ` +
      `fallback (looked up "${courseId}"). Upstream ?course_id= is exact-match; ` +
      `mixed-case ids are supported and cost one extra list lookup.`
  );

  return fetchByCode(match.course_id);
}