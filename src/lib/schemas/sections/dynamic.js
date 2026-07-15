import { z } from 'zod';
import { defineSection } from './base';

/**
 * §5.4 DYNAMIC sections (MVP — 4). These render live upstream data (courses,
 * schedules, bundles) at request time — the schema only bounds the QUERY
 * config, never the fetched data. The actual fetch + render is Phase 2.
 */

export const DYNAMIC_TYPES = ['course_selector', 'course_list', 'course_schedule', 'bundle_courses'];

// Admin picks a fixed set of courses to offer as a selector.
const courseSelectorContent = z.object({
  courseIds: z.array(z.string()).default([]),
  heading:   z.string().default(''),
}).passthrough();

// A list of courses. THREE sources (2C.2b widened the enum):
//   'manual'  — an AUTHORED reference: explicit `courseIds`, known at edit time,
//               so the canvas renders the REAL courses (2C.2a).
//   'skill'   — DERIVED: every public course under the skill id in `filter`.
//   'program' — DERIVED: every public course under the program id in `filter`.
// The derived sources are evaluated at REQUEST time (listPublicCourses({skill|
// program})), so the published set is a function of when the page is viewed — the
// canvas can only show an edit-time SAMPLE the published page won't match. That
// is the labelled exception argued in docs/page-builder-status.md §2C.2b (the
// Browser-pass-#2 precedent): the sample is honest ONLY because the editor labels
// it. `filter` is honoured only for the derived sources; `courseIds` only for
// 'manual'. The enum was narrowed to ['manual'] at 2C.2a so an unhonoured source
// couldn't be SET; 2C.2b honours 'skill'/'program', so widening is now correct.
// DB scan before this pass: 0 stored course_list sections, so nothing to migrate
// (widening is additive regardless — it can reject no stored doc).
const courseListContent = z.object({
  source:    z.enum(['manual', 'skill', 'program']).default('manual'),
  courseIds: z.array(z.string()).default([]), // honoured for source='manual'
  filter:    z.string().default(''),          // skill-id or program-id, for the derived sources
  limit:     z.number().int().min(0).default(0), // 0 = no cap
}).passthrough();

// Schedule table for a single course (2C.2b). `courseId` is the SHORT course code
// (e.g. MSE-AI), same author-facing convention as course_card — the resolver
// turns it into the MSDB ObjectId /schedules needs (§4.7 quirk at the edge).
// Its rows are request-time-derived (upcoming, open/nearly_full), so it is
// canvas-FAKE like the derived course_list: the editor labels the sample. `limit`
// caps the number of upcoming sessions shown (0 = adapter default), honoured in
// resolveSectionData.
const courseScheduleContent = z.object({
  courseId: z.string().default(''),
  limit:    z.number().int().min(0).default(0),
}).passthrough();

// The courses that make up a bundle promo.
const bundleCoursesContent = z.object({
  courseIds: z.array(z.string()).default([]),
}).passthrough();

export const dynamicSectionSchemas = [
  defineSection('course_selector', courseSelectorContent),
  defineSection('course_list',     courseListContent),
  defineSection('course_schedule', courseScheduleContent),
  defineSection('bundle_courses',  bundleCoursesContent),
];
