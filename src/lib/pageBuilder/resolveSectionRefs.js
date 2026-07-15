import { slotsOf } from './containerSlots';

/**
 * The PURE half of resolveSectionData (2C.2a/2C.2b) — walk / collect / assemble,
 * with NO fetch and NO server-only imports (only `slotsOf`). Split out so this
 * logic is verifiable without a DB or network (item 1): resolveSectionData.js
 * imports the MSDB adapters and local-Mongo reads, so importing IT drags in
 * `db/connect`, which throws on a missing `MONGODB_URI` at load. This module
 * doesn't, so the collect/key rules can be exercised with fake maps.
 *
 * `resolveSectionData` = collectRefs → (fetch) → assembleResolved.
 *
 * 2C.2b adds the DERIVED refs: a course_list with source='skill'|'program'
 * references a single `filter` id (not a courseIds list), and course_schedule
 * references a course code whose SCHEDULES are fetched (not the course itself).
 * The manual course_list / course_selector / bundle_courses paths are unchanged
 * — a regression test pins the manual list byte-for-byte.
 */

export const RESOLVED_TYPES = new Set([
  'course_card', 'instructor_card', 'course_selector', 'bundle_courses', 'course_list',
  'course_schedule',
]);

/**
 * Walk the tree; return the data-backed nodes plus the refs each source needs:
 * course ids (cards + manual lists), the instructor need, schedule course codes,
 * and the skill/program filter ids of the derived lists. Pure.
 */
export function collectRefs(sections) {
  const nodes = [];
  const walk = (arr) => {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (!s || typeof s !== 'object') continue;
      if (RESOLVED_TYPES.has(s.type)) nodes.push(s);
      const slots = slotsOf(s.type);
      if (slots) for (const slot of slots) walk(s.content?.[slot]);
    }
  };
  walk(sections);

  const courseIds = new Set();
  const scheduleCourseIds = new Set();
  const skillFilters = new Set();
  const programFilters = new Set();
  let needInstructors = false;

  for (const s of nodes) {
    const c = s.content ?? {};
    if (s.type === 'course_card') {
      if (c.courseId) courseIds.add(String(c.courseId));
    } else if (s.type === 'instructor_card') {
      needInstructors = true;
    } else if (s.type === 'course_schedule') {
      if (c.courseId) scheduleCourseIds.add(String(c.courseId));
    } else if (s.type === 'course_list') {
      const source = c.source ?? 'manual';
      if (source === 'skill') {
        if (c.filter) skillFilters.add(String(c.filter));
      } else if (source === 'program') {
        if (c.filter) programFilters.add(String(c.filter));
      } else {
        for (const id of Array.isArray(c.courseIds) ? c.courseIds : []) if (id) courseIds.add(String(id));
      }
    } else {
      // course_selector, bundle_courses — always manual id lists.
      for (const id of Array.isArray(c.courseIds) ? c.courseIds : []) if (id) courseIds.add(String(id));
    }
  }
  return {
    nodes,
    courseIds: [...courseIds],
    needInstructors,
    scheduleCourseIds: [...scheduleCourseIds],
    skillFilters: [...skillFilters],
    programFilters: [...programFilters],
  };
}

/**
 * Resolve one course_list node's list from the fetched maps, branching on its
 * source. Manual reads courseMap by explicit id (2C.2a, unchanged); the derived
 * sources read the pre-fetched filter→courses maps. Limit is applied last, the
 * same way for every source. Pure.
 */
function resolveCourseList(c, courseMap, coursesBySkill, coursesByProgram) {
  const source = c.source ?? 'manual';
  let list;
  if (source === 'skill') {
    list = coursesBySkill.get(String(c.filter ?? '')) ?? [];
  } else if (source === 'program') {
    list = coursesByProgram.get(String(c.filter ?? '')) ?? [];
  } else {
    const ids = (Array.isArray(c.courseIds) ? c.courseIds : []).map(String);
    list = ids.map((id) => courseMap.get(id)).filter(Boolean);
  }
  return Number(c.limit) > 0 ? list.slice(0, Number(c.limit)) : list;
}

/**
 * Given the fetched maps, build the id-keyed resolved map. Fail-closed markers: a
 * single ref that resolves to nothing is `null`; a list (course lists AND
 * schedules) is `[]` — the tri-state the editor warnings depend on (undefined =
 * "not fetched yet" is the caller's concern, not this function's). Pure.
 *
 * `derived` carries the 2C.2b maps and defaults to empty, so the 2C.2a callers
 * (and their tests) that pass only three positional args keep the exact manual
 * behaviour: no schedule map, no filter maps, every course_list treated as manual.
 */
export function assembleResolved(nodes, courseMap, instructorById, derived = {}) {
  const {
    scheduleMap = new Map(),
    coursesBySkill = new Map(),
    coursesByProgram = new Map(),
  } = derived;
  const out = {};
  for (const s of nodes) {
    const c = s.content ?? {};
    if (s.type === 'course_card') {
      out[s.id] = c.courseId ? (courseMap.get(String(c.courseId)) ?? null) : null;
    } else if (s.type === 'instructor_card') {
      out[s.id] = c.instructorId ? (instructorById.get(String(c.instructorId)) ?? null) : null;
    } else if (s.type === 'course_schedule') {
      // Schedules for the authored course code (already resolved code→_id→rows in
      // the fetch). `[]` marker for an unset/unresolved code; limit caps the rows.
      const rows = c.courseId ? (scheduleMap.get(String(c.courseId)) ?? []) : [];
      out[s.id] = Number(c.limit) > 0 ? rows.slice(0, Number(c.limit)) : rows;
    } else if (s.type === 'course_list') {
      out[s.id] = resolveCourseList(c, courseMap, coursesBySkill, coursesByProgram);
    } else {
      // course_selector, bundle_courses — manual id lists (2C.2a, unchanged).
      const ids = (Array.isArray(c.courseIds) ? c.courseIds : []).map(String);
      out[s.id] = ids.map((id) => courseMap.get(id)).filter(Boolean);
    }
  }
  return out;
}
