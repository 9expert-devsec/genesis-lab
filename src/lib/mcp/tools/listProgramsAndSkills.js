/**
 * Tool 1 — `list_programs_and_skills`.
 *
 * The vocabulary every other filter in this server is validated against.
 *
 * ── WHY THIS TOOL EXISTS AT ALL ────────────────────────────────────────────
 * Round 1 measured that MSDB `/public-course` IGNORES an unrecognised filter
 * value rather than rejecting it: `?program=ZZZ-BOGUS` returns 0 items, but
 * `?zzz_not_a_param=MSE` returns the full 24. A model guessing "Power BI" when
 * the id is "POWER-BI" therefore gets a plausible-looking empty result and
 * concludes the catalogue has no Power BI courses. Publishing the vocabulary is
 * the fix; `search_courses` refusing an unknown value is the belt.
 */

import { SITE_ORIGIN } from '@/lib/mcp/shape';
import { programHref, skillHref } from '@/lib/utils';

export const LIST_PROGRAMS_AND_SKILLS_DESCRIPTION =
  'List every valid program and skill filter value for the 9Expert course catalogue. ' +
  'Call this FIRST whenever you intend to pass a program or skill to search_courses — ' +
  'the filter values are short internal codes such as "POWER-BI" or "AI", not display ' +
  'names, and search_courses rejects anything not in this list. Each entry gives the id ' +
  'to filter by, the display name to show a person, and the public page URL. Programs are ' +
  'specific products or technologies; skills are the broader groupings a program belongs ' +
  'to, and there are only a handful of them. This list changes rarely, so it is safe to ' +
  'call once and reuse within a conversation.';

/**
 * @param {object} _input  no input; the whole vocabulary is always returned
 * @param {object} deps
 * @param {Function} deps.listPrograms    () → { items }
 * @param {Function} deps.listSkills      () → { items }
 * @param {Function} deps.getNavMenuData  () → { programSlugs, skillSlugs }
 *
 * Every dependency is injected so the tests never open a socket or a Mongo
 * connection. Production wiring is in lib/mcp/register.js and passes the real
 * ones; nothing here knows where the data comes from.
 *
 * ── READ OFF `deps`, NEVER DESTRUCTURED IN THE SIGNATURE ───────────────────
 * `(_input, { listPrograms, listSkills })` is the tidier spelling and it trips
 * test/fs/libImportsResolved: that guard flags a file that USES a name another
 * `src/lib` module exports without importing it — a real ReferenceError class
 * that still builds — and it cannot see that a destructured parameter is a
 * local binding. Reading through `deps` keeps the guard honest for everyone
 * else rather than teaching it an exception, and matches how the other four
 * tools in this directory already call their dependencies.
 */
export async function listProgramsAndSkills(_input, deps) {
  const [programsRes, skillsRes, nav] = await Promise.all([
    deps.listPrograms(),
    deps.listSkills(),
    // The admin-managed custom slugs. getNavMenuData already catches its own
    // failure and returns empty maps, and programHref/skillHref both fall back
    // to a derived path on an empty map — so a Mongo blip costs a prettier URL,
    // never the tool.
    Promise.resolve(deps.getNavMenuData()).catch(() => ({ programSlugs: {}, skillSlugs: {} })),
  ]);

  const programSlugs = nav?.programSlugs ?? {};
  const skillSlugs = nav?.skillSlugs ?? {};

  const programs = (programsRes?.items ?? [])
    .filter((p) => p?.program_id)
    .map((p) => ({
      id: String(p.program_id),
      name: p.program_name ?? String(p.program_id),
      url: `${SITE_ORIGIN}${programHref(p, programSlugs)}`,
    }));

  const skills = (skillsRes?.items ?? [])
    .filter((s) => s?.skill_id)
    .map((s) => ({
      id: String(s.skill_id),
      name: s.skill_name ?? String(s.skill_id),
      url: `${SITE_ORIGIN}${skillHref(s, skillSlugs)}`,
    }));

  return { programs, skills };
}

/**
 * The id sets `search_courses` validates against, from the same two reads.
 *
 * Shared rather than re-fetched: a search that validates its filter must agree
 * with the list a model was just handed, and two independent fetches are how
 * they would come to disagree during a taxonomy edit.
 */
export function taxonomyIds({ programs, skills }) {
  return {
    programIds: (programs ?? []).map((p) => p.id),
    skillIds: (skills ?? []).map((s) => s.id),
  };
}
