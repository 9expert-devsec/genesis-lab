import { test } from 'node:test';
import assert from 'node:assert/strict';

import { duplicateCourseCodes } from '@/components/pageBuilder/editor/duplicateCodes';

/**
 * WHICH CODES AN AUTHORED LIST REPEATS.
 *
 * The rule behind the “รหัสซ้ำ” warning, pinned on its own because it is pure
 * and because `SectionContentEditor.jsx` — where it is consumed — is a
 * `'use client'` module that reaches tiptap. Whether an author sees the warning
 * should not need any of that to be checked.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * Not a rule about what renders. Duplicates RENDER, deliberately:
 * `assembleResolved` maps positionally, so `[A, A]` draws the same course
 * twice. This decides only what the editor SAYS about that
 * (docs/course-picker-proposal.md §D.4, §F.4).
 */

test('a code twice is a duplicate', () => {
  assert.deepEqual(duplicateCourseCodes(['CLAUDE-AI', 'MSE-AI', 'CLAUDE-AI']), ['CLAUDE-AI']);
});

test('CONTROL: a list with no repeat reports nothing', () => {
  // Without this, the assertion above also passes against a function that
  // returns every code it is handed.
  assert.deepEqual(duplicateCourseCodes(['CLAUDE-AI', 'MSE-AI', 'POWER-BI']), []);
});

test('each repeated code is named ONCE, however many times it appears', () => {
  // The warning names codes, not occurrences. Three copies is still one thing
  // to fix.
  assert.deepEqual(duplicateCourseCodes(['A', 'A', 'A']), ['A']);
});

test('several repeated codes are all named', () => {
  assert.deepEqual(duplicateCourseCodes(['A', 'B', 'A', 'C', 'B']), ['A', 'B']);
});

test('the order is FIRST APPEARANCE, not order of detection', () => {
  // ['A','B','B','A'] detects B first (index 2) and A second (index 3). The
  // warning sits under a control showing the list in authored order, and array
  // position is the only ordering authority there is (§D.3) — so naming B
  // before A would name them in an order that appears nowhere on screen.
  assert.deepEqual(duplicateCourseCodes(['A', 'B', 'B', 'A']), ['A', 'B']);
});

test('CONTROL: detection order and first-appearance order really do differ here', () => {
  // Otherwise the test above is satisfied by either implementation and pins
  // neither. Detection order for this input is B, A.
  const input = ['A', 'B', 'B', 'A'];
  const detectionOrder = [];
  const seen = new Set();
  for (const c of input) {
    if (seen.has(c) && !detectionOrder.includes(c)) detectionOrder.push(c);
    seen.add(c);
  }
  assert.deepEqual(detectionOrder, ['B', 'A']);
  assert.notDeepEqual(duplicateCourseCodes(input), detectionOrder);
});

test('surrounding whitespace does not hide a duplicate', () => {
  // CourseIdsField trims on the way in, but a stored array can predate that or
  // arrive from an import, and ' A' and 'A' are the same code either way.
  assert.deepEqual(duplicateCourseCodes(['A', ' A ']), ['A']);
});

test('CASE IS NOT FOLDED — two casings are two codes', () => {
  // `course_id` has no canonical casing; four of 79 are mixed-case (measured
  // 2026-08-29), and upstream `?course_id=` is exact-match, which is why
  // getCourseByCodeInsensitive exists. So `Power-Apps` and `POWER-APPS` are two
  // lookups with two possible answers. Folding would fire this warning on a
  // list that resolves to two different courses — a warning on correct input,
  // which is the failure the tri-state above CourseIdsWarnings exists to stop.
  assert.deepEqual(duplicateCourseCodes(['Power-Apps', 'POWER-APPS']), []);
  assert.deepEqual(duplicateCourseCodes(['Power-Apps', 'Power-Apps']), ['Power-Apps']);
});

test('empty strings are not duplicates', () => {
  // A trailing newline stores '' (§D.5). Two of them are not something an
  // author can act on, and the resolve warning already ignores them too.
  assert.deepEqual(duplicateCourseCodes(['A', '', '']), []);
  assert.deepEqual(duplicateCourseCodes(['', '   ', '']), []);
});

test('a non-array, and non-strings inside one, are survived', () => {
  // The value comes from a stored document; the editor must not throw on one
  // written by an older shape.
  assert.deepEqual(duplicateCourseCodes(undefined), []);
  assert.deepEqual(duplicateCourseCodes(null), []);
  assert.deepEqual(duplicateCourseCodes('A,A'), []);
  assert.deepEqual(duplicateCourseCodes([null, 7, { code: 'A' }, 'A', 'A']), ['A']);
});

test('the input array is not mutated', () => {
  // It is the stored working tree. Warn, never edit (§F.4) applies to the
  // predicate as much as to the UI.
  const input = ['A', 'B', 'A'];
  const copy = [...input];
  duplicateCourseCodes(input);
  assert.deepEqual(input, copy);
});
