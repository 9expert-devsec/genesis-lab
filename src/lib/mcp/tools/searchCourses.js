/**
 * Tool 2 — `search_courses`.
 *
 * ── AN UNKNOWN FILTER IS AN ERROR, NEVER A FALLBACK ────────────────────────
 * The single most important line in this file is the `throw` in
 * `assertKnown`. MSDB ignores a filter it does not recognise (round 1 §1.2),
 * so the natural-looking implementation — pass the value through and see what
 * comes back — answers a misspelled program with the WHOLE CATALOGUE or with
 * an empty list, and both read as a successful search. A model then reports
 * either "here are 77 Power BI courses" or "we have none", with equal
 * confidence and no way to tell it was the filter that failed.
 *
 * So the value is checked against the live taxonomy BEFORE any course read,
 * and the refusal names the valid ids. There is deliberately no fuzzy match
 * and no "did you mean": a near-miss silently resolving to a different program
 * is the same class of quiet wrongness one step further on.
 *
 * ── KEYWORD MATCHING IS OURS, NOT UPSTREAM'S ───────────────────────────────
 * `courseHaystack` / `onlineCourseHaystack` from lib/search/matchSearch are
 * the same matchers /search uses, so this server and the site's own search box
 * agree about what "power bi" finds — including the Thai/English mixed terms
 * they already normalise. Reusing them also means MSDB's `q` param is never
 * sent, which matters because `q` is a case-insensitive regex upstream and
 * would find different rows than the site does.
 */

import { McpToolError, onlineCourseCard, publicCourseCard } from '@/lib/mcp/shape';
import { listProgramsAndSkills, taxonomyIds } from '@/lib/mcp/tools/listProgramsAndSkills';
import {
  courseHaystack,
  normalizeSearchTerm,
  onlineCourseHaystack,
} from '@/lib/search/matchSearch';

export const SEARCH_COURSES_DESCRIPTION =
  'Search the 9Expert training catalogue by keyword, and optionally narrow by program or ' +
  'skill. Covers both public classroom courses and self-paced online courses. Returns a ' +
  'short card per course — course id, name, teaser, program, skills, duration, price label ' +
  'and the public page URL — not the full syllabus; call get_course_detail with a course_id ' +
  'from these results to read objectives, prerequisites and the topic outline. The program ' +
  'and skill filters take internal ids, not display names: call list_programs_and_skills ' +
  'first to get them, because an unrecognised value is rejected rather than ignored. Prices ' +
  'are the standard list price in Thai baht and exclude VAT and any active promotion; a ' +
  'course shown as "Inhouse Only" has no public per-person price and is booked as a private ' +
  'class. For current discounts call list_live_promotions. This tool knows nothing about ' +
  'training dates or availability — call list_training_rounds for those. Results are ' +
  'capped, so narrow the query rather than asking for more.';

export const SEARCH_COURSES_LIMIT_DEFAULT = 10;
export const SEARCH_COURSES_LIMIT_MAX = 25;

/** Case-insensitive membership, because the ids are typed by a model. */
function findId(ids, value) {
  const wanted = String(value).trim().toLowerCase();
  return ids.find((id) => id.toLowerCase() === wanted) ?? null;
}

function assertKnown(kind, value, ids) {
  const hit = findId(ids, value);
  if (hit) return hit;
  throw new McpToolError(
    `Unknown ${kind} "${value}". This is not a valid filter value and no search was run — ` +
      `an unrecognised filter would otherwise return the wrong courses silently. ` +
      `Valid ${kind} ids are: ${ids.join(', ')}. ` +
      `Call list_programs_and_skills for the display name of each.`
  );
}

/**
 * @param {object} input
 * @param {string} [input.query]    keyword; matched against name, id and teaser
 * @param {string} [input.program]  program id, validated against the taxonomy
 * @param {string} [input.skill]    skill id, validated against the taxonomy
 * @param {'public'|'online'|'all'} [input.type]
 * @param {number} [input.limit]
 * @param {object} deps
 */
export async function searchCourses(input, deps) {
  const {
    query = '',
    program = null,
    skill = null,
    type = 'all',
    limit = SEARCH_COURSES_LIMIT_DEFAULT,
  } = input ?? {};

  const capped = Math.max(1, Math.min(Number(limit) || SEARCH_COURSES_LIMIT_DEFAULT, SEARCH_COURSES_LIMIT_MAX));

  /**
   * VALIDATION BEFORE ANY COURSE READ. Deliberately ordered: a rejected filter
   * must not have cost an upstream request, and more importantly must not be
   * able to return rows at all — a check that ran after the fetch could still
   * be bypassed by a later edit that moved the early return.
   */
  let programId = null;
  let skillId = null;
  if (program || skill) {
    const taxonomy = await listProgramsAndSkills({}, deps);
    const { programIds, skillIds } = taxonomyIds(taxonomy);
    if (program) programId = assertKnown('program', program, programIds);
    if (skill) skillId = assertKnown('skill', skill, skillIds);
  }

  const wantPublic = type === 'all' || type === 'public';
  const wantOnline = type === 'all' || type === 'online';

  const [publicRes, onlineRes] = await Promise.all([
    // `listPublicCourses` with no `includeHidden` is the PUBLIC list. The
    // guarantee is at src/lib/api/public-courses.js:156-161 — it falls PAST the
    // `if (includeHidden) return result` early return, calls `loadHidden()` and
    // then `dropHiddenCourses`, so a course with `CourseExtension.isPublished
    // === false` cannot reach a tool result. Reusing this read is also what
    // keeps the MCP server on the same ISR cache entry as the site.
    wantPublic ? deps.listPublicCourses({ program: programId, skill: skillId }) : Promise.resolve({ items: [] }),
    wantOnline ? deps.listOnlineCourses({ program: programId }) : Promise.resolve({ items: [] }),
  ]);

  const term = normalizeSearchTerm(query ?? '');
  const matches = (haystack) => {
    if (!term) return true;
    return String(haystack ?? '').includes(term);
  };

  const rows = [];
  for (const c of publicRes?.items ?? []) {
    if (matches(courseHaystack(c))) rows.push(publicCourseCard(c));
  }
  for (const o of onlineRes?.items ?? []) {
    /**
     * The SKILL filter is applied here for online courses, not upstream.
     * `/online-course` accepts `skill`, but `listOnlineCourses` only threads
     * `program` through (lib/api/online-courses.js:78-84) and this round does
     * not edit that file. Filtering our side over 24 rows is exact and costs
     * nothing; the alternative is a second upstream call shape that the site
     * does not use and whose cache entry nothing else would share.
     */
    if (skillId) {
      const ids = (o?.skills ?? []).map((s) => String(s?.skill_id ?? '').toLowerCase());
      if (!ids.includes(skillId.toLowerCase())) continue;
    }
    if (matches(onlineCourseHaystack(o))) rows.push(onlineCourseCard(o));
  }

  return {
    total_matched: rows.length,
    returned: Math.min(rows.length, capped),
    courses: rows.slice(0, capped),
  };
}
