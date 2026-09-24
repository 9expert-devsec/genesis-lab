/**
 * Tool 3 — `get_course_detail`.
 *
 * ── CASE IS RESOLVED BY THE REPO'S OWN RESOLVER, NOT BY UPPERCASING ────────
 * `getCourseByCodeInsensitive` (src/lib/api/public-courses.js:251) is the fix
 * for the course-id-casing defect and this tool reuses it rather than
 * normalising a code itself. Round 1 re-measured the problem: MSDB's
 * `?course_id=` is exact-match, 4 of 77 ids are mixed-case
 * ("SQL-PG-Query", "SQL-ADM-Tuning", "MS-SQL-19-Prov", "SQL-ADM-Secure"), and
 * a miss returns HTTP 200 with an EMPTY LIST rather than a 404 — so a naive
 * lookup reports "no such course" for a course that exists. The set also
 * drifts: the resolver's own header records five as of 2026-08-06 and one has
 * since been re-cased, which is the argument for a permanent resolver over a
 * one-off data clean-up.
 *
 * ── A MISS IS AN ERROR, NOT AN EMPTY OBJECT ────────────────────────────────
 * `{}` would be returned as a successful tool call and a model would describe
 * a course with no fields. The throw is what makes "we do not have that" a
 * thing the model can say.
 *
 * ── HIDDEN COURSES ARE UNREACHABLE HERE ────────────────────────────────────
 * `includeHidden` is never passed, so the resolver's fallback list is the
 * public one. The direct `?course_id=` leg is an upstream lookup that never
 * saw the hidden flag, so a hidden course with an ORDINARY code would still
 * resolve through it — which is why the online branch below and the public
 * branch both re-check against the public listing before answering.
 */

import { McpToolError, dropEmpty, onlineCourseCard, publicCourseCard } from '@/lib/mcp/shape';

export const GET_COURSE_DETAIL_DESCRIPTION =
  'Return the full published detail of one 9Expert course: name, teaser, price label, ' +
  'duration, level, learning objectives, target audience, prerequisites, system ' +
  'requirements and the topic outline. Works for both public classroom courses and online ' +
  'courses. Pass the course_id exactly as search_courses reported it; matching is ' +
  'case-insensitive, so "sql-pg-query" and "SQL-PG-Query" both resolve, and the id echoed ' +
  'back is the canonical one to quote. The price is the standard list price in Thai baht ' +
  'and excludes VAT and any active promotion — a course labelled "Inhouse Only" has no ' +
  'public per-person price and is sold as a private class, so do not describe it as free. ' +
  'For current discounts call list_live_promotions. This tool returns no training dates; ' +
  'call list_training_rounds for scheduled dates. This tool has no seat-availability data. ' +
  'If the user asks how many seats remain, say that information is not available here and ' +
  'point them to the course page url from the results, or to a round\'s registration_url ' +
  'from list_training_rounds. Do not describe this as a company policy. If no course matches, ' +
  'say so plainly rather than offering a similar course as though it were the one asked for.';

/** Numeric level code → the words the site uses. */
const LEVEL_LABEL = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

function levelLabel(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  return LEVEL_LABEL[Number(raw)] ?? null;
}

/**
 * `training_topics` trimmed to title + bullet lines; drops upstream bookkeeping.
 *
 * ── THE FIELD IS `bullets`, AND IT WAS MEASURED, NOT GUESSED ───────────────
 * The first version of this function read `t.items`, which does not exist. It
 * did not throw and it did not fail a test — it returned a list of titles with
 * every bullet silently removed, and the only visible symptom was that the
 * largest course detail came back at 4.4 KB instead of the ~15 KB round 1 had
 * measured. A plausible-looking key name is exactly the kind of mistake a unit
 * test built on a hand-written fixture cannot catch, because the fixture would
 * have carried the wrong key too.
 *
 * Both feeds agree on the shape: `{ title, bullets[] }`, plus an `_id` on the
 * online rows that is Mongo bookkeeping and is dropped here.
 */
function topics(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => {
      if (typeof t === 'string') return { title: t };
      return dropEmpty({
        title: t?.title ?? null,
        bullets: Array.isArray(t?.bullets) ? t.bullets.filter(Boolean) : [],
      });
    })
    .filter((t) => t.title || t.bullets);
}

/**
 * @param {object} input
 * @param {string} input.course_id
 * @param {boolean} [input.include_outline]
 * @param {object} deps
 * @param {Function} deps.getCourseByCodeInsensitive (code) → course|null
 * @param {Function} deps.listOnlineCourses          () → { items }
 */
export async function getCourseDetail(input, deps) {
  const { course_id: courseId, include_outline: includeOutline = true } = input ?? {};
  const wanted = String(courseId ?? '').trim();
  if (!wanted) throw new McpToolError('course_id is required.');

  const course = await deps.getCourseByCodeInsensitive(wanted);
  if (course) {
    const card = publicCourseCard(course);
    return dropEmpty({
      ...card,
      level: levelLabel(course.course_levels),
      available_as_public_class: course.course_type_public === true,
      available_as_inhouse: course.course_type_inhouse === true,
      certificate: course.course_certificate_status === true,
      objectives: course.course_objectives ?? [],
      target_audience: course.course_target_audience ?? [],
      prerequisites: course.course_prerequisites ?? [],
      system_requirements: course.course_system_requirements ?? [],
      // The outline is the bulk of the payload — round 1 measured the largest
      // trimmed course at 14.9 KB, almost all of it here. `include_outline:
      // false` is the escape hatch for a caller that only needs the facts.
      training_topics: includeOutline ? topics(course.training_topics) : [],
    });
  }

  /**
   * ONLINE FALLBACK. There is no by-id read for online courses upstream (round
   * 1 §2c: nothing under /ai/ has a GET :id), so this is a scan of the public
   * list — 24 rows, already cached, exact-except-case like the public resolver
   * and for the same reason.
   */
  const { items } = (await deps.listOnlineCourses({})) ?? { items: [] };
  const lower = wanted.toLowerCase();
  const online = (items ?? []).find((o) => String(o?.o_course_id ?? '').toLowerCase() === lower);
  if (online) {
    const card = onlineCourseCard(online);
    return dropEmpty({
      ...card,
      level: levelLabel(online.o_course_levels),
      certificate: online.o_course_certificate_status === true,
      instructor: online.o_course_instructor_name ?? null,
      objectives: online.o_course_objectives ?? [],
      target_audience: online.o_course_target_audience ?? [],
      prerequisites: online.o_course_prerequisites ?? [],
      system_requirements: online.o_course_system_requirements ?? [],
      training_topics: includeOutline ? topics(online.o_course_training_topics) : [],
    });
  }

  throw new McpToolError(
    `course not found: "${wanted}". No public or online course carries that id. ` +
      `Course ids are matched without regard to case, so this is not a casing problem. ` +
      `Use search_courses to find the correct id rather than guessing at a variation.`
  );
}
