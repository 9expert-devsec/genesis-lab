/**
 * Pure filter / group / sort logic for /training-course.
 *
 * Shared by the two renderers of that page so they compute IDENTICAL groups:
 *   · CourseListClient — reads `skill` / `program` / `view` from the URL and
 *     the local search box, then renders through CourseListView;
 *   · CourseListStatic — the Suspense fallback, i.e. what the server HTML
 *     carries: the UNFILTERED catalog through the same CourseListView.
 * On the bare URL the fallback and the hydrated list are therefore the same
 * cards in the same order. Moved here verbatim from CourseListClient; the
 * rules themselves did not change.
 *
 * No React, no hooks, no browser APIs — callable from either side.
 */
import { findSkillBySlug } from '@/config/site';

const OTHER_PROGRAM = 'อื่นๆ';

/** Program name → admin-set rank. */
export function buildProgramRank(programOrder = []) {
  const map = new Map();
  programOrder.forEach((name, idx) => map.set(name, idx));
  return map;
}

/**
 * Distinct program list for the select. Sort by admin-set order first;
 * everything outside the order map falls to the bottom and sorts
 * alphabetically among itself.
 */
export function sortProgramOptions(items, programRank) {
  const distinct = Array.from(
    new Set(items.map((c) => c?.program?.program_name).filter(Boolean))
  );
  return distinct.sort((a, b) => {
    const ra = programRank.has(a) ? programRank.get(a) : Infinity;
    const rb = programRank.has(b) ? programRank.get(b) : Infinity;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, 'th');
  });
}

/** `?skill=<slug>` → the upstream skill id the course rows carry. */
export function skillIdForSlug(skillSlug) {
  const s = skillSlug ? findSkillBySlug(skillSlug) : null;
  return s?.upstreamId ?? null;
}

/** Search box + skill + program filter. Empty criteria keep every item. */
export function filterCourses(items, { search = '', skillId = null, programName = null } = {}) {
  const q = search.trim().toLowerCase();
  return items.filter((c) => {
    if (q) {
      const name = String(c.course_name ?? '').toLowerCase();
      const code = String(c.course_id ?? '').toLowerCase();
      if (!name.includes(q) && !code.includes(q)) return false;
    }
    if (skillId) {
      // After detail enrichment c.skills is an array of objects
      // ({_id, skill_name, ...}); pre-enrichment it's bare ObjectId
      // strings. Match either shape.
      const arr = Array.isArray(c.skills) ? c.skills : [];
      const hit = arr.some((s) =>
        typeof s === 'string'
          ? s === skillId
          : s?._id === skillId || s?.skill_id === skillId
      );
      if (!hit) return false;
    }
    if (programName) {
      if (c.program?.program_name !== programName) return false;
    }
    return true;
  });
}

/**
 * Group by program name, then sort groups by the admin-set order so the page
 * hierarchy mirrors the same sequence as the home page and the filter
 * dropdown.
 */
export function groupCoursesByProgram(courses, programRank) {
  const map = new Map();
  for (const c of courses) {
    const key = c?.program?.program_name ?? OTHER_PROGRAM;
    if (!map.has(key)) {
      map.set(key, { program: c.program, courses: [] });
    }
    map.get(key).courses.push(c);
  }
  return Array.from(map.values()).sort((a, b) => {
    const an = a.program?.program_name ?? OTHER_PROGRAM;
    const bn = b.program?.program_name ?? OTHER_PROGRAM;
    const ra = programRank.has(an) ? programRank.get(an) : Infinity;
    const rb = programRank.has(bn) ? programRank.get(bn) : Infinity;
    if (ra !== rb) return ra - rb;
    return an.localeCompare(bn, 'th');
  });
}
