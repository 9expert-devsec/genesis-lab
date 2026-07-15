import { getCourseByCode, listPublicCourses } from '@/lib/api/public-courses';
import { listSchedulesByCourse } from '@/lib/api/schedules';
import { getActiveInstructors } from '@/lib/instructors/getInstructors';
import { collectRefs, assembleResolved, RESOLVED_TYPES } from './resolveSectionRefs';

/**
 * resolveSectionData — the FETCH, hoisted ABOVE the renderer (2C.2a/2C.2b).
 *
 * The data-backed section components do not fetch; they render from data handed
 * to them as a prop. This module is that fetch: it gathers every upstream
 * reference (collectRefs), resolves them ONCE (courses via the MSDB adapters
 * under their normal ISR; instructors from local Mongo), and returns a map keyed
 * by the section's `id` (assembleResolved). `SectionRenderer` looks each
 * section's slice up by `id` and passes it down.
 *
 * Why hoisted (see docs/page-builder-status.md §2C.2): a data-backed component
 * looked like it forced an async server component, which cannot render in the
 * client canvas — but the async-ness is in the FETCH, not the RENDER. Hoisting
 * keeps ONE sync renderer for both the public page (which awaits this) and the
 * canvas (same map from an admin-gated server action).
 *
 * The walk / collect / key logic is the PURE `resolveSectionRefs.js` (no server
 * imports), split out so it is testable without a DB (item 1). This file owns
 * only the impure fetch. Fail-closed: a reference that resolves to nothing is
 * `null` (single) or `[]` (list); never throws for one bad ref.
 *
 * 2C.2b adds the DERIVED fetches — both request-time (ISR), never mirrored into
 * Mongo (§4.8):
 *   - course_list source='skill'|'program' → listPublicCourses({skill|program}),
 *     keyed by the filter id.
 *   - course_schedule → code→ObjectId (getCourseByCode) → listSchedulesByCourse.
 *     /schedules takes the Mongo ObjectId, NOT the short code, so the code is
 *     resolved first — the two-phase pattern already used by career-paths (§4.7).
 */

export { RESOLVED_TYPES };

const CHUNK = 10; // bounded fan-out, mirrors enrich-courses.js

async function fetchCourses(ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((id) => getCourseByCode(id)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) map.set(chunk[j], r.value);
    });
  }
  return map;
}

// Derived course lists: one listPublicCourses call per distinct filter id, keyed
// by that id. `kind` is 'skill' or 'program' — the adapter's verified filter
// params (already load-bearing in syncLandingData / nav-course-preview). A failed
// or empty filter resolves to [] (fail-closed).
async function fetchByFilter(kind, filters) {
  const map = new Map();
  for (let i = 0; i < filters.length; i += CHUNK) {
    const chunk = filters.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((f) => listPublicCourses({ [kind]: f })));
    results.forEach((r, j) => {
      map.set(chunk[j], r.status === 'fulfilled' ? (r.value?.items ?? []) : []);
    });
  }
  return map;
}

// Schedules per authored course code. The code was already resolved to a course
// object in `courseMap` (course_schedule codes are fetched alongside the card/
// list ids); /schedules needs that object's `_id`. A code with no resolved course
// (decommissioned upstream) or a failed schedule call resolves to [] — the
// component renders nothing and the editor warns.
async function fetchSchedules(codes, courseMap) {
  const map = new Map();
  for (let i = 0; i < codes.length; i += CHUNK) {
    const chunk = codes.slice(i, i + CHUNK);
    const results = await Promise.allSettled(chunk.map((code) => {
      const oid = courseMap.get(String(code))?._id;
      return oid ? listSchedulesByCourse(oid, { limit: 20 }) : Promise.resolve({ items: [] });
    }));
    results.forEach((r, j) => {
      map.set(chunk[j], r.status === 'fulfilled' ? (r.value?.items ?? []) : []);
    });
  }
  return map;
}

export async function resolveSectionData(sections) {
  const { nodes, courseIds, needInstructors, scheduleCourseIds, skillFilters, programFilters } =
    collectRefs(sections);
  if (!nodes.length) return {};

  // course_schedule codes must be resolved to course objects too (for their
  // `_id`), so fetch them in the same course pass — de-duped against the card /
  // manual-list ids.
  const allCourseIds = [...new Set([...courseIds, ...scheduleCourseIds])];

  const [courseMap, instructors, coursesBySkill, coursesByProgram] = await Promise.all([
    fetchCourses(allCourseIds),
    needInstructors ? getActiveInstructors().catch(() => []) : Promise.resolve([]),
    fetchByFilter('skill', skillFilters),
    fetchByFilter('program', programFilters),
  ]);

  // Schedules depend on courseMap (code→_id), so this runs after the course pass.
  const scheduleMap = await fetchSchedules(scheduleCourseIds, courseMap);

  const instructorById = new Map();
  for (const ins of Array.isArray(instructors) ? instructors : []) {
    if (ins?.instructor_id) instructorById.set(String(ins.instructor_id), ins);
    if (ins?._id) instructorById.set(String(ins._id), ins);
  }

  return assembleResolved(nodes, courseMap, instructorById, {
    scheduleMap,
    coursesBySkill,
    coursesByProgram,
  });
}
