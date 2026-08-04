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

const PATH = '/public-course';

/**
 * List all active public courses.
 * Optional filters: skill (skill ID), program (program ID).
 */
export async function listPublicCourses({ skill, program } = {}) {
  const raw = await aiFetch(PATH, {
    params: { skill, program },
    tags: ['public-courses'],
  });
  return unwrap(raw);
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
  } = {}
) {
  if (!courseId) return null;

  const direct = await fetchByCode(courseId);
  if (direct) return direct;

  const { items } = await fetchList();
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