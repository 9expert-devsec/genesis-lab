import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCourseOptions,
  courseOptionLabel,
  courseSelectionValue,
  normaliseForSearch,
} from '@/lib/courses/courseOptionFilter';

/**
 * The matching rule behind the previous_course picker.
 *
 * Measured against the real catalogue: 78 courses, 43 of which hold a
 * previous_course, all 43 resolving inside the option list today. The list is
 * already a prop on the form, so this filters on the client — 78 rows is not
 * worth a request.
 */

const COURSES = [
  { course_id: 'MSE-L1', course_name: 'Microsoft Excel Level 1', course_name_th: 'เอ็กเซล ระดับ 1' },
  { course_id: 'MSE-L2', course_name: 'Microsoft Excel Level 2', course_name_th: 'เอ็กเซล ระดับ 2' },
  { course_id: 'POWER-BI-L1', course_name: 'Power BI Essentials', course_name_th: 'พาวเวอร์ บีไอ เบื้องต้น' },
  { course_id: 'DEV-PY', course_name: 'Python for Everyone', course_name_th: 'ไพทอนสำหรับทุกคน' },
  // No name at all — must not crash, and must still be findable by code.
  { course_id: 'BARE-01' },
  // Junk the upstream list can contain; must never reach the dropdown.
  { course_name: 'no code at all' },
  null,
];

test('matches by course CODE, case-insensitively', () => {
  const byLower = filterCourseOptions(COURSES, 'mse-l1');
  assert.deepEqual(byLower.map((c) => c.course_id), ['MSE-L1']);

  const byUpper = filterCourseOptions(COURSES, 'MSE-L1');
  assert.deepEqual(byUpper.map((c) => c.course_id), ['MSE-L1']);

  // A partial code matches both levels.
  assert.deepEqual(
    filterCourseOptions(COURSES, 'mse').map((c) => c.course_id),
    ['MSE-L1', 'MSE-L2'],
  );
});

test('matches by latin name, case-insensitively', () => {
  assert.deepEqual(
    filterCourseOptions(COURSES, 'power bi').map((c) => c.course_id),
    ['POWER-BI-L1'],
  );
  assert.deepEqual(
    filterCourseOptions(COURSES, 'PYTHON').map((c) => c.course_id),
    ['DEV-PY'],
  );
});

test('matches by THAI name, as a substring anywhere in it', () => {
  assert.deepEqual(
    filterCourseOptions(COURSES, 'เอ็กเซล').map((c) => c.course_id),
    ['MSE-L1', 'MSE-L2'],
  );
  // Substring, not prefix — the distinctive word is often in the middle.
  assert.deepEqual(
    filterCourseOptions(COURSES, 'เบื้องต้น').map((c) => c.course_id),
    ['POWER-BI-L1'],
  );
});

/**
 * Thai has no case, so `toLowerCase()` does nothing to it and matching is a
 * plain substring test. Pinned so "case-insensitive" is not later read as
 * "some folding happens for Thai too" — tone marks and vowel signs ARE
 * significant.
 */
test('Thai matching does not fold tone marks or vowel signs', () => {
  assert.deepEqual(filterCourseOptions(COURSES, 'เรยน').map((c) => c.course_id), []);
});

/**
 * THE ONE FOLD. The decomposed สระอำ (U+0E4D + U+0E32) renders identically to
 * the composed U+0E33 and is present in real legacy data — see
 * test/fs/policyEncoding. Without this fold the course is unfindable and
 * nothing on screen explains why. NFC cannot do it: U+0E33 has no canonical
 * decomposition.
 */
test('สระอำ matches across the composed and decomposed spellings', () => {
  // Built from codepoints, never pasted — a pasted "decomposed" fixture that
  // is actually composed makes this test pass while proving nothing.
  const NIKHAHIT = 'ํ';
  const SARA_AA = 'า';
  const decomposedWord = `ส${NIKHAHIT}${SARA_AA}หรับ`; // ส-ํ-า-ห-ร-ั-บ
  const composedWord = `สำหรับ`;                  // ส-ำ-ห-ร-ั-บ

  // THE PREMISE: two different strings that render identically. Without this
  // the rest of the test could be comparing a string with itself.
  assert.notEqual(decomposedWord, composedWord, 'fixture is not actually decomposed');
  assert.ok(decomposedWord.includes(NIKHAHIT));
  assert.ok(!composedWord.includes(NIKHAHIT));

  const stored = [{ course_id: 'X-1', course_name_th: `${decomposedWord}ทุกคน` }];

  assert.deepEqual(
    filterCourseOptions(stored, composedWord).map((c) => c.course_id),
    ['X-1'],
    'a composed query must find a name stored in the decomposed form',
  );

  // And the reverse, since either side can carry either spelling.
  const storedComposed = [{ course_id: 'X-2', course_name_th: `${composedWord}ทุกคน` }];
  assert.deepEqual(
    filterCourseOptions(storedComposed, decomposedWord).map((c) => c.course_id),
    ['X-2'],
    'a decomposed query must find a composed name',
  );
});

test('no match returns an empty list, not everything', () => {
  assert.deepEqual(filterCourseOptions(COURSES, 'zzzz-not-a-course'), []);
});

test('an empty query lists every valid option', () => {
  const all = filterCourseOptions(COURSES, '');
  assert.deepEqual(all.map((c) => c.course_id), [
    'MSE-L1', 'MSE-L2', 'POWER-BI-L1', 'DEV-PY', 'BARE-01',
  ]);
  // Whitespace is trimmed, so a stray space is still "no query".
  assert.equal(filterCourseOptions(COURSES, '   ').length, all.length);
});

test('rows without a course_id are dropped, and null rows do not throw', () => {
  const all = filterCourseOptions(COURSES, '');
  assert.ok(all.every((c) => c && c.course_id), 'a row with no code reached the list');
});

test('excludeCode removes the course itself — nothing can precede itself', () => {
  const out = filterCourseOptions(COURSES, 'mse', { excludeCode: 'MSE-L1' });
  assert.deepEqual(out.map((c) => c.course_id), ['MSE-L2']);
});

test('limit caps the list', () => {
  assert.equal(filterCourseOptions(COURSES, '', { limit: 2 }).length, 2);
});

/**
 * THE CLEAR-TO-NULL CASE. This module emits '' for "none"; shapePayload turns
 * '' into null (lib/actions/courses.js:267) because the schema is
 * `{ ObjectId, ref, default: null }` and '' is a cast error — a 400 that only
 * shows up in production.
 */
test('clearing yields the empty string, which shapePayload maps to null', () => {
  assert.equal(courseSelectionValue(''), '');
  assert.equal(courseSelectionValue(null), '');
  assert.equal(courseSelectionValue(undefined), '');
  assert.equal(courseSelectionValue('   '), '');
  assert.equal(courseSelectionValue('MSE-L1'), 'MSE-L1');

  // Never null: a hidden input with value={null} renders no value attribute
  // and React warns. The '' → null conversion belongs to shapePayload alone.
  assert.notEqual(courseSelectionValue(''), null);
});

test('option labels read as "name (CODE)", and degrade to the code alone', () => {
  assert.equal(courseOptionLabel(COURSES[0]), 'เอ็กเซล ระดับ 1 (MSE-L1)');
  assert.equal(courseOptionLabel({ course_id: 'BARE-01' }), 'BARE-01');
  assert.equal(courseOptionLabel(null), '');
});

test('normaliseForSearch is total — non-strings become an empty string', () => {
  for (const v of [null, undefined, 42, {}, []]) {
    assert.equal(normaliseForSearch(v), '');
  }
});
