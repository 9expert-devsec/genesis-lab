import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCourseCode,
  buildRankMap,
  rankOf,
  compareUnlisted,
  makeCategoryComparator,
  makeGlobalComparator,
  orderCoursesInCategory,
  orderCoursesGlobally,
  UNLISTED_RANK,
} from '@/lib/courses/courseOrder';

/**
 * The comparator is the genesis-owned piece of this feature, so it is tested
 * directly rather than through a surface. Every tier has its own case, and the
 * fixtures are built to DISAGREE with the incoming array order — a fixture
 * whose expected output matches its input passes against a comparator that
 * returns 0 for everything, which is the exact regression this replaces.
 */

const c = (course_id, extra = {}) => ({
  course_id,
  createdAt: '2026-01-01T00:00:00.000Z',
  program: { program_id: 'P1' },
  ...extra,
});

// ── normalisation ───────────────────────────────────────────────────────────

test('codes normalise to trimmed upper case, on both sides of a lookup', () => {
  assert.equal(normalizeCourseCode('  sql-pg-query '), 'SQL-PG-QUERY');
  assert.equal(normalizeCourseCode(null), '');
  // The four live mixed-case codes must rank from any spelling.
  const map = buildRankMap(['SQL-PG-Query', 'ms-sql-19-prov']);
  assert.equal(rankOf({ course_id: 'sql-pg-query' }, map), 0);
  assert.equal(rankOf({ course_id: 'MS-SQL-19-PROV' }, map), 1);
});

test('a code repeated in a stored list keeps its FIRST position', () => {
  // A duplicate is a data error; taking the later position would move the
  // course on a write nobody made.
  const map = buildRankMap(['A', 'B', 'a']);
  assert.equal(map.get('A'), 0);
  assert.equal(map.get('B'), 1);
  assert.equal(map.size, 2, 'the duplicate must not consume a rank');
});

test('an unknown course is UNLISTED, and unlisted sorts before rank 0', () => {
  const map = buildRankMap(['A']);
  assert.equal(rankOf({ course_id: 'NOPE' }, map), UNLISTED_RANK);
  assert.ok(UNLISTED_RANK < 0, 'unlisted must sort ahead of every listed rank');
});

// ── tier 1/2 — within a category ────────────────────────────────────────────

test('listed courses take the list order, not the array order', () => {
  const courses = [c('A'), c('B'), c('C')];          // array says A,B,C
  const out = orderCoursesInCategory(courses, ['C', 'A', 'B']);
  assert.deepEqual(out.map((x) => x.course_id), ['C', 'A', 'B']);
  assert.notDeepEqual(
    out.map((x) => x.course_id), courses.map((x) => x.course_id),
    'the fixture must disagree with array order or it proves nothing'
  );
});

test('unlisted courses lead — "no number entered" means new, and new goes first', () => {
  const out = orderCoursesInCategory(
    [c('LISTED-1'), c('NEW'), c('LISTED-2')],
    ['LISTED-1', 'LISTED-2']
  );
  assert.equal(out[0].course_id, 'NEW');
  assert.deepEqual(out.map((x) => x.course_id), ['NEW', 'LISTED-1', 'LISTED-2']);
});

test('ordering never mutates its input', () => {
  const courses = [c('A'), c('B')];
  const before = courses.map((x) => x.course_id);
  orderCoursesInCategory(courses, ['B', 'A']);
  assert.deepEqual(courses.map((x) => x.course_id), before);
});

// ── tier 3/4 — the unlisted block, and why it is not a fall-through ─────────

test('among unlisted, newest first by createdAt', () => {
  const older = c('OLD', { createdAt: '2025-01-01T00:00:00.000Z' });
  const newer = c('NEW', { createdAt: '2026-06-01T00:00:00.000Z' });
  assert.deepEqual(
    orderCoursesInCategory([older, newer], []).map((x) => x.course_id),
    ['NEW', 'OLD']
  );
});

test('the comparator is TOTAL — it never returns 0 for two different courses', () => {
  /**
   * The property that makes this genesis-owned rather than a fall-through.
   * A comparator returning 0 hands the decision back to the array's incoming
   * sequence, which is upstream's undocumented order — the exact thing this
   * module exists to take ownership of.
   */
  const same = '2026-01-01T00:00:00.000Z';
  const a = c('AAA', { createdAt: same });
  const b = c('BBB', { createdAt: same });
  assert.notEqual(compareUnlisted(a, b), 0, 'identical timestamps must still break');
  assert.equal(compareUnlisted(a, b) < 0, true, 'code ASC decides');
  assert.equal(compareUnlisted(a, a), 0, 'a course against itself is the only 0');
});

test('a MISSING createdAt sorts last within the block, not first', () => {
  // An absent date is not evidence of newness.
  const dated = c('DATED', { createdAt: '2020-01-01T00:00:00.000Z' });
  const undatedA = c('ZZZ-1', { createdAt: undefined });
  const undatedB = c('AAA-2', { createdAt: 'not a date' });
  const out = orderCoursesInCategory([undatedA, dated, undatedB], []);
  assert.equal(out[0].course_id, 'DATED', 'a real date beats no date');
  assert.deepEqual(out.slice(1).map((x) => x.course_id), ['AAA-2', 'ZZZ-1'],
    'and the undated fall back to code ASC, deterministically');
});

// ── R6 — across categories ──────────────────────────────────────────────────

const global = (courses) => orderCoursesGlobally(courses, {
  programRank: new Map([['P-FIRST', 0], ['P-SECOND', 1]]),
  courseOrderByProgram: new Map([
    ['P-FIRST', ['F-2', 'F-1']],
    ['P-SECOND', ['S-1', 'S-2']],
  ]),
});
const inProgram = (id, pid, extra = {}) => c(id, { program: { program_id: pid }, ...extra });

test('cross-category order is programme rank first, then rank inside that programme', () => {
  const out = global([
    inProgram('S-2', 'P-SECOND'),
    inProgram('F-1', 'P-FIRST'),
    inProgram('S-1', 'P-SECOND'),
    inProgram('F-2', 'P-FIRST'),
  ]);
  assert.deepEqual(out.map((x) => x.course_id), ['F-2', 'F-1', 'S-1', 'S-2']);
});

test('the global order is a PROJECTION of the per-category one, not a second scheme', () => {
  /**
   * R6's whole point. Two courses of one programme must appear in the same
   * relative order on the programme page and in a cross-category surface — if
   * these could disagree, /search would contradict the page it links to.
   */
  const pair = [inProgram('F-1', 'P-FIRST'), inProgram('F-2', 'P-FIRST')];
  const onPage = orderCoursesInCategory(pair, ['F-2', 'F-1']).map((x) => x.course_id);
  const inSearch = global(pair).map((x) => x.course_id);
  assert.deepEqual(inSearch, onPage);
  assert.deepEqual(onPage, ['F-2', 'F-1'], 'and both follow the stored list');
});

test('a programme nobody ordered sorts after every programme somebody did', () => {
  const out = global([inProgram('X', 'P-UNKNOWN'), inProgram('S-1', 'P-SECOND')]);
  assert.deepEqual(out.map((x) => x.course_id), ['S-1', 'X']);
});

test('a course with NO programme still orders deterministically', () => {
  // Not reachable in today's data (79/79 have a programme) but createCourse
  // does not require one, so the comparator must not depend on it.
  const out = global([
    { course_id: 'NO-PROG-Z', createdAt: '2026-01-01T00:00:00.000Z' },
    { course_id: 'NO-PROG-A', createdAt: '2026-01-01T00:00:00.000Z' },
  ]);
  assert.deepEqual(out.map((x) => x.course_id), ['NO-PROG-A', 'NO-PROG-Z']);
});

test('unlisted-within-programme still leads its own programme block', () => {
  const out = global([
    inProgram('F-1', 'P-FIRST'),
    inProgram('F-NEW', 'P-FIRST'),
    inProgram('S-1', 'P-SECOND'),
  ]);
  // F-NEW is unlisted so it leads P-FIRST's block; F-2 is not in this fixture,
  // so F-1 follows; then P-SECOND's block.
  assert.deepEqual(out.map((x) => x.course_id), ['F-NEW', 'F-1', 'S-1']);
});

test('both comparators are stable under a shuffled input', () => {
  // Determinism, asserted rather than assumed: the same set in any incoming
  // order must produce one output.
  const set = [
    inProgram('S-1', 'P-SECOND'), inProgram('F-1', 'P-FIRST'),
    inProgram('F-2', 'P-FIRST'), inProgram('S-2', 'P-SECOND'),
  ];
  const expected = global(set).map((x) => x.course_id);
  for (const rotate of [1, 2, 3]) {
    const shuffled = [...set.slice(rotate), ...set.slice(0, rotate)];
    assert.deepEqual(global(shuffled).map((x) => x.course_id), expected);
  }
});

test('makeCategoryComparator and makeGlobalComparator are usable as raw comparators', () => {
  // The surfaces sort in place inside existing pipelines, so the factories must
  // return something `Array.prototype.sort` accepts directly.
  assert.equal(typeof makeCategoryComparator([]), 'function');
  assert.equal(typeof makeGlobalComparator({}), 'function');
  assert.deepEqual(
    [c('B'), c('A')].sort(makeCategoryComparator(['A', 'B'])).map((x) => x.course_id),
    ['A', 'B']
  );
});
