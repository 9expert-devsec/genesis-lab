import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRefs, assembleResolved } from '@/lib/pageBuilder/resolveSectionRefs';

// The PURE half of resolveSectionData — no DB, no network, fake maps.

test('collectRefs gathers unique course ids + instructor need, recursing containers', () => {
  const sections = [
    { id: 'a', type: 'course_card', content: { courseId: 'X' } },
    { id: 'g', type: 'card_grid', content: { children: [
      { id: 'b', type: 'course_selector', content: { courseIds: ['X', 'Y'] } },
      { id: 'i', type: 'instructor_card', content: { instructorId: 'INS' } },
    ] } },
  ];
  const { nodes, courseIds, needInstructors } = collectRefs(sections);
  assert.equal(nodes.length, 3);
  assert.deepEqual([...courseIds].sort(), ['X', 'Y']);
  assert.equal(needInstructors, true);
});

test('assembleResolved: course_card → entity | null (fail-closed marker)', () => {
  const nodes = [{ id: 'a', type: 'course_card', content: { courseId: 'X' } }, { id: 'z', type: 'course_card', content: { courseId: 'MISSING' } }];
  const courseMap = new Map([['X', { course_id: 'X', course_name: 'Alpha' }]]);
  const out = assembleResolved(nodes, courseMap, new Map());
  assert.equal(out.a.course_name, 'Alpha');
  assert.equal(out.z, null);
});
test('assembleResolved: list → [] marker, and course_list honours limit', () => {
  const courseMap = new Map([['A', { course_id: 'A' }], ['B', { course_id: 'B' }]]);
  const nodes = [
    { id: 's', type: 'course_selector', content: { courseIds: [] } },
    { id: 'l', type: 'course_list', content: { courseIds: ['A', 'B'], limit: 1 } },
  ];
  const out = assembleResolved(nodes, courseMap, new Map());
  assert.deepEqual(out.s, []);
  assert.equal(out.l.length, 1);
});

// ── 2C.2b derived / time-varying ──────────────────────────────────────────

test('collectRefs splits derived refs: skill/program filters + schedule codes, NOT courseIds', () => {
  const sections = [
    { id: 'sk', type: 'course_list', content: { source: 'skill', filter: 'S1', courseIds: ['IGNORED'] } },
    { id: 'pg', type: 'course_list', content: { source: 'program', filter: 'P1' } },
    { id: 'sc', type: 'course_schedule', content: { courseId: 'MSE-AI' } },
  ];
  const { courseIds, skillFilters, programFilters, scheduleCourseIds } = collectRefs(sections);
  assert.deepEqual(skillFilters, ['S1']);
  assert.deepEqual(programFilters, ['P1']);
  assert.deepEqual(scheduleCourseIds, ['MSE-AI']);
  // A derived list's courseIds are NOT a ref — only its filter is.
  assert.deepEqual(courseIds, []);
});

test('assembleResolved: derived course_list reads the filter maps + honours limit', () => {
  const coursesBySkill = new Map([['S1', [{ course_id: 'A' }, { course_id: 'B' }, { course_id: 'C' }]]]);
  const coursesByProgram = new Map([['P1', [{ course_id: 'X' }]]]);
  const nodes = [
    { id: 'sk', type: 'course_list', content: { source: 'skill', filter: 'S1', limit: 2 } },
    { id: 'pg', type: 'course_list', content: { source: 'program', filter: 'P1' } },
    { id: 'miss', type: 'course_list', content: { source: 'skill', filter: 'NONE' } },
  ];
  const out = assembleResolved(nodes, new Map(), new Map(), { coursesBySkill, coursesByProgram });
  assert.equal(out.sk.length, 2);              // limit applied
  assert.equal(out.pg[0].course_id, 'X');
  assert.deepEqual(out.miss, []);              // unresolved filter → [] marker
});

test('assembleResolved: course_schedule → schedule rows by code, [] marker + limit', () => {
  const scheduleMap = new Map([['MSE-AI', [{ _id: '1' }, { _id: '2' }, { _id: '3' }]]]);
  const nodes = [
    { id: 'sc', type: 'course_schedule', content: { courseId: 'MSE-AI', limit: 2 } },
    { id: 'none', type: 'course_schedule', content: { courseId: 'GONE' } },
    { id: 'blank', type: 'course_schedule', content: { courseId: '' } },
  ];
  const out = assembleResolved(nodes, new Map(), new Map(), { scheduleMap });
  assert.equal(out.sc.length, 2);              // limit applied
  assert.deepEqual(out.none, []);              // unresolved code → [] marker
  assert.deepEqual(out.blank, []);             // no code → [] marker
});

// CONTROL: the manual path must be byte-for-byte unchanged by the 2C.2b widening.
// Same inputs, called the OLD 3-arg way (no `derived`), must produce the same map
// a manual course_list produced before — the regression that would bite hardest.
test('control: manual course_list path is unchanged (3-arg call, no derived maps)', () => {
  const courseMap = new Map([['A', { course_id: 'A' }], ['B', { course_id: 'B' }]]);
  const sections = [{ id: 'l', type: 'course_list', content: { source: 'manual', courseIds: ['A', 'B'], limit: 0 } }];
  const { nodes, courseIds } = collectRefs(sections);
  assert.deepEqual(courseIds, ['A', 'B']);     // manual still collects its ids
  const out = assembleResolved(nodes, courseMap, new Map());
  assert.deepEqual(out.l.map((c) => c.course_id), ['A', 'B']);
});
test('control: a source-less course_list is treated as manual (default)', () => {
  const courseMap = new Map([['A', { course_id: 'A' }]]);
  const nodes = [{ id: 'l', type: 'course_list', content: { courseIds: ['A'] } }];
  const out = assembleResolved(nodes, courseMap, new Map());
  assert.deepEqual(out.l.map((c) => c.course_id), ['A']);
});
