import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seedListFor, shouldSeed, planCourseOrderSeed } from '@/lib/courses/seedCourseOrder';
import { orderCoursesInCategory } from '@/lib/courses/courseOrder';

const c = (course_id, program_id, skills = []) => ({
  course_id,
  createdAt: '2026-01-01T00:00:00.000Z',
  program: { program_id },
  skills: skills.map((skill_id) => ({ skill_id })),
});

// Catalogue in RENDERED order — this sequence is the thing being captured.
const CATALOGUE = [
  c('P1-A', 'P1', ['AI']),
  c('P2-A', 'P2', ['AI', 'BUSINESS']),
  c('P1-B', 'P1', ['BUSINESS']),
  c('P2-B', 'P2', []),
];

test('the seed captures the RENDERED order, not a re-sort of it', () => {
  const plan = planCourseOrderSeed({ courses: CATALOGUE });
  const p1 = plan.programs.find((p) => p.programId === 'P1');
  assert.deepEqual(p1.courseOrder, ['P1-A', 'P1-B']);

  // The catalogue interleaves the two programmes; each list must keep the
  // catalogue's relative sequence rather than the order the courses were
  // grouped in.
  const p2 = plan.programs.find((p) => p.programId === 'P2');
  assert.deepEqual(p2.courseOrder, ['P2-A', 'P2-B']);
});

test('R4 — seeding changes NOTHING: the seeded list reproduces the input order', () => {
  /**
   * The claim R4 rests on, made checkable. For every category, ordering the
   * category's courses through the seeded list must return them in exactly the
   * sequence they already rendered in.
   *
   * This is the assertion the real-data proof runs at scale; here it is pinned
   * against a fixture so it cannot rot when the catalogue changes.
   */
  const plan = planCourseOrderSeed({ courses: CATALOGUE });
  for (const { programId, courseOrder } of plan.programs) {
    const rendered = CATALOGUE.filter((x) => x.program.program_id === programId);
    const after = orderCoursesInCategory(rendered, courseOrder);
    assert.deepEqual(
      after.map((x) => x.course_id), rendered.map((x) => x.course_id),
      `programme ${programId} moved — the seed is not order-preserving`
    );
  }
  for (const { skillId, courseOrder } of plan.skills) {
    const rendered = CATALOGUE.filter((x) => x.skills.some((s) => s.skill_id === skillId));
    const after = orderCoursesInCategory(rendered, courseOrder);
    assert.deepEqual(
      after.map((x) => x.course_id), rendered.map((x) => x.course_id),
      `skill ${skillId} moved — the seed is not order-preserving`
    );
  }
});

test('one course seeds into its programme AND every one of its skills', () => {
  // A course has one programme but up to three skills, so it appears in several
  // lists with independent positions.
  const plan = planCourseOrderSeed({ courses: CATALOGUE });
  const ai = plan.skills.find((s) => s.skillId === 'AI');
  const business = plan.skills.find((s) => s.skillId === 'BUSINESS');
  assert.deepEqual(ai.courseOrder, ['P1-A', 'P2-A']);
  assert.deepEqual(business.courseOrder, ['P2-A', 'P1-B']);
  assert.ok(ai.courseOrder.includes('P2-A') && business.courseOrder.includes('P2-A'));
});

test('R8 — an ARRANGED category is skipped, and says so', () => {
  const plan = planCourseOrderSeed({
    courses: CATALOGUE,
    programDocs: [{ programId: 'P1', courseOrderSource: 'arranged' }],
  });
  assert.equal(plan.programs.find((p) => p.programId === 'P1'), undefined,
    'a category a person arranged must not be overwritten by a re-seed');
  assert.ok(plan.programs.find((p) => p.programId === 'P2'), 'the rest still seed');
  assert.deepEqual(plan.skipped, [{ kind: 'program', id: 'P1', reason: 'arranged' }]);
});

test("'' and 'seeded' are both re-seedable — only 'arranged' blocks", () => {
  // Re-running over a previous seed reproduces the same list; refusing would
  // make the script un-runnable after a partial failure.
  assert.equal(shouldSeed({}), true);
  assert.equal(shouldSeed({ courseOrderSource: '' }), true);
  assert.equal(shouldSeed({ courseOrderSource: 'seeded' }), true);
  assert.equal(shouldSeed({ courseOrderSource: 'arranged' }), false);
});

test('codes are normalised and de-duplicated', () => {
  const list = seedListFor([
    { course_id: 'sql-pg-query' }, { course_id: 'SQL-PG-QUERY' },
    { course_id: '  ms-sql-19-prov ' }, { course_id: '' }, {},
  ]);
  assert.deepEqual(list, ['SQL-PG-QUERY', 'MS-SQL-19-PROV']);
});

test('a course with no programme seeds into no programme list, and does not throw', () => {
  const plan = planCourseOrderSeed({ courses: [{ course_id: 'ORPHAN', skills: [] }] });
  assert.deepEqual(plan.programs, []);
  assert.deepEqual(plan.skills, []);
});
