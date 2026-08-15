import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickPinnedCourses } from '@/lib/articles/pinnedCourses';

/**
 * The two defects in one line of articles/[slug]/page.jsx: the curator's order
 * was discarded, and a mixed-case pin resolved to nothing.
 *
 * The fixture deliberately puts the catalogue in the OPPOSITE order to the
 * pins. A test whose pinned order happens to match the catalogue order passes
 * against the broken `.filter` implementation and proves nothing — that is the
 * shape the original defect hid behind.
 */

// Catalogue order is upstream's `sort_order` order. Two of these are the real
// mixed-case codes from the live data; the rest are shortened for legibility.
const CATALOGUE = [
  { course_id: 'MSE-L1', course_name: 'Excel 1' },
  { course_id: 'SQL-PG-Query', course_name: 'SQL Query' },
  { course_id: 'POWER-BI', course_name: 'Power BI' },
  { course_id: 'MS-SQL-19-Prov', course_name: 'SQL Provisioning' },
];

test('the pinned ORDER is the curator\'s, not the catalogue\'s', () => {
  const pinned = ['POWER-BI', 'MSE-L1'];
  const out = pickPinnedCourses(pinned, CATALOGUE);

  assert.deepEqual(
    out.map((c) => c.course_id), ['POWER-BI', 'MSE-L1'],
    'the admin arranged these; the catalogue must not re-order them'
  );

  // Stated as its own claim so the failure message says WHICH order won. The
  // catalogue has MSE-L1 first, so the broken implementation returns exactly
  // the reverse of this.
  const catalogueOrder = CATALOGUE
    .filter((c) => pinned.includes(c.course_id))
    .map((c) => c.course_id);
  assert.notDeepEqual(
    out.map((c) => c.course_id), catalogueOrder,
    'the fixture must disagree with catalogue order or it tests nothing'
  );
});

test('a MIXED-CASE pin still resolves', () => {
  /**
   * `course_id` has no canonical casing upstream (public-courses.js:117) and
   * four live courses are not fully uppercase. The old `Set.has(c.course_id)`
   * was exact-case, so an article pinning `sql-pg-query` rendered nothing —
   * silently, with no error and no empty state.
   */
  const out = pickPinnedCourses(['sql-pg-query', 'ms-sql-19-prov'], CATALOGUE);
  assert.deepEqual(out.map((c) => c.course_id), ['SQL-PG-Query', 'MS-SQL-19-Prov']);

  // And the reverse direction: a catalogue entry in an unexpected case must be
  // findable from an upper-case pin. Normalisation has to be on BOTH sides —
  // doing it on one is how half of this class of bug survives a fix.
  assert.deepEqual(
    pickPinnedCourses(['SQL-PG-QUERY'], CATALOGUE).map((c) => c.course_id),
    ['SQL-PG-Query']
  );
});

test('a case-only collision resolves deterministically — first catalogue entry wins', () => {
  /**
   * Normalising case merges two codes that differ only by case. Measured
   * against the live catalogue that cannot lose anything today: 79 courses, 4
   * not fully uppercase, ZERO pairs differing only by case.
   *
   * That is a fact about today's DATA, not a property of the code, and upstream
   * is free to add one tomorrow. So the resolution rule is asserted rather than
   * assumed — a collision must land the same way on every render instead of
   * being decided by whichever entry the Map saw last.
   */
  const collided = [
    { course_id: 'DUP-1', course_name: 'first' },
    { course_id: 'dup-1', course_name: 'second' },
  ];
  for (const pin of ['DUP-1', 'dup-1', 'Dup-1']) {
    assert.equal(
      pickPinnedCourses([pin], collided)[0].course_name, 'first',
      `pinning ${pin} must resolve to the FIRST catalogue entry, every time`
    );
  }
});

test('a pin that matches nothing is dropped, not rendered as a hole', () => {
  const out = pickPinnedCourses(['POWER-BI', 'NOPE-404', 'MSE-L1'], CATALOGUE);
  assert.deepEqual(out.map((c) => c.course_id), ['POWER-BI', 'MSE-L1']);
  assert.ok(out.every(Boolean), 'no undefined may reach the renderer');
});

test('the same code pinned twice renders once, at its first position', () => {
  const out = pickPinnedCourses(['MSE-L1', 'POWER-BI', 'mse-l1'], CATALOGUE);
  assert.deepEqual(out.map((c) => c.course_id), ['MSE-L1', 'POWER-BI']);
});

test('empty and malformed inputs yield an empty list, never a throw', () => {
  // The call site wraps this in a try/catch that blanks the section on error, so
  // a throw here would hide the whole block rather than one missing course.
  for (const [pins, cat] of [
    [[], CATALOGUE], [null, CATALOGUE], [undefined, CATALOGUE],
    [['MSE-L1'], []], [['MSE-L1'], null],
    [['', '   ', null, undefined], CATALOGUE],
  ]) {
    assert.deepEqual(pickPinnedCourses(pins, cat), []);
  }
  // A catalogue row with no code must not swallow a pin or crash the map build.
  assert.deepEqual(
    pickPinnedCourses(['MSE-L1'], [{ course_name: 'no code' }, ...CATALOGUE])
      .map((c) => c.course_id),
    ['MSE-L1']
  );
});
