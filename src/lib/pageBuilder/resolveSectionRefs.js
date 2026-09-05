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
  // `promotion_bundle` needs BOTH passes: the course (for its cover and title)
  // and that course's rounds (for the one the author chose). Neither is a new
  // KIND of fetch — course_card already resolves courses by code and
  // course_schedule already resolves code → ObjectId → /schedules — so this
  // type contributes ids to the two existing sets and adds no third one.
  'promotion_bundle',
]);

/**
 * A bundle's item course codes, de-duplicated and in order.
 *
 * ONE definition, called from BOTH `collectRefs` (which needs them to fetch)
 * and `dataRefSignature`'s caller (which needs them to decide whether to
 * refetch). Those two must never disagree about what a bundle references: a
 * code the signature ignores is a canvas that goes stale when the author
 * changes it, and a code the collector ignores is an item that never resolves.
 *
 * Exported rather than inlined twice for that reason — the same rule that keeps
 * DRAFT_CONTENT_KEYS a single exported constant. `dataRefs.js` is client-safe
 * and imports only `slotsOf`, and so does this module, so the sharing costs
 * nothing at the boundary.
 *
 * The same course+round may legitimately appear in more than one bundle on a
 * page, and the same course twice in ONE bundle; de-duplication here is about
 * the FETCH, never about the items, which stay exactly as authored.
 */
export function bundleCourseCodes(content) {
  const items = Array.isArray(content?.items) ? content.items : [];
  const out = [];
  for (const item of items) {
    const code = typeof item?.courseId === 'string' ? item.courseId.trim() : '';
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

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
    } else if (s.type === 'promotion_bundle') {
      /**
       * An explicit branch, NOT the `else` at the foot of this chain. A bundle
       * has no `content.courseIds`, so falling through would collect nothing
       * and change nothing — which is exactly why it would be missed. Naming
       * the type here is what makes "a bundle references its items' courses"
       * something the code says rather than something that happens to work.
       *
       * Both sets, from one list of codes. The course pass gives each item its
       * cover and title; the schedule pass gives it the rounds to choose from.
       * `resolveSectionData` already de-dupes the two sets against each other
       * before fetching, so a code named by both costs one course fetch.
       */
      for (const code of bundleCourseCodes(c)) {
        courseIds.add(code);
        scheduleCourseIds.add(code);
      }
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
      /**
       * ── ROUND 64: `limit` IS AN 'upcoming'-ONLY CAP ────────────────────────
       *
       * Under `source='manual'` the author has NAMED the rows, so a cap left
       * over from the other mode must not shorten their list. It would not
       * merely trim: `chosenRounds` matches the stored ids against these rows,
       * so a stored `limit: 1` on a three-round selection would make rounds two
       * and three look MISSING — a slice presenting as an upstream deletion.
       * Two of the three sections stored when this shipped carry `limit: 1`,
       * which is exactly the shape that would hit it the day step 4 lets an
       * author switch one over.
       *
       * The SELECTION itself is not applied here — that stays in the renderer,
       * so the editor's picker can still see the rounds the author has not
       * chosen (round 63 §G, argued at lib/pageBuilder/chosenRounds.js). This
       * only declines to apply the OTHER mode's control.
       *
       * `=== 'manual'`, never `!== 'upcoming'`: absent is the stored state of
       * every existing section and must take the unchanged branch.
       */
      const capped = c.source !== 'manual' && Number(c.limit) > 0;
      out[s.id] = capped ? rows.slice(0, Number(c.limit)) : rows;
    } else if (s.type === 'promotion_bundle') {
      /**
       * ── ONE ENTRY PER ITEM, IN THE AUTHOR'S ORDER ────────────────────────
       * A bundle resolves to a LIST parallel to `content.items` — same length,
       * same order, one entry each. Not a map keyed by course code: the same
       * course may appear twice in one bundle (two rounds of it), and a map
       * would silently merge them.
       *
       * ── A MISSING COURSE IS `null`, AND THE ITEM STILL GETS AN ENTRY ─────
       * This is the deliberate departure from `bundle_courses`, which fails
       * closed — `ids.map(...).filter(Boolean)` — and simply draws fewer cards
       * when a code stops resolving. That is right for a plain grid and wrong
       * here, and the difference is not stylistic:
       *
       *   A BUNDLE STATES ONE PACKAGE PRICE COMPUTED OVER N NAMED COURSES.
       *   Rendered with N−1 of them, the price on screen is wrong in a way no
       *   reader can detect — the page looks complete and quietly overstates
       *   what the money buys.
       *
       * So the entry survives with `course: null`, the renderer draws a marked
       * row carrying the stored code, and the editor warns. Same rule round 64
       * settled for a chosen ROUND ("never silently dropped"), applied to a
       * course, where the consequence is larger. Nobody should "fix" the
       * inconsistency with bundle_courses by making this one filter.
       *
       * ── THE ROUNDS ARE THE COURSE'S WHOLE FETCHED LIST, NOT THE CHOSEN ONE ─
       * The selection is applied in the RENDERER, via `chooseRounds`. Its
       * header argues why, and the argument is this type's too: the editor's
       * round picker reads exactly this map and has to see the rounds the
       * author has NOT picked yet. Narrowing here would blind the control.
       */
      const rows = Array.isArray(c.items) ? c.items : [];
      out[s.id] = rows.map((item) => {
        const code = typeof item?.courseId === 'string' ? item.courseId.trim() : '';
        return {
          id: typeof item?.id === 'string' ? item.id : '',
          courseId: code,
          course: code ? (courseMap.get(code) ?? null) : null,
          rounds: code ? (scheduleMap.get(code) ?? []) : [],
        };
      });
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
