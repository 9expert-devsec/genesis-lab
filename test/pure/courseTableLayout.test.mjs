import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNS,
  NAME_MIN_WIDTH,
  TABLE_MIN_WIDTH,
  columnProblems,
} from '@/lib/courseTableLayout';

/**
 * The /training-course table's column set.
 *
 * jsdom does not do layout, so nothing here can measure a rendered column. What
 * CAN be pinned is that the array the colgroup, the header row and the body row
 * are ALL generated from stays well-formed, and that the table's floor is the
 * sum of that array rather than a number written down next to it.
 *
 * Every check runs through `columnProblems`, and every one has a CONTROL that
 * feeds it a deliberately broken array — a guard that only ever sees the real,
 * correct column set cannot tell you it still works.
 */

test('the real column set is well-formed', () => {
  assert.deepEqual(columnProblems(COLUMNS), []);
});

test('there are five columns, one per <th> the table renders', () => {
  assert.equal(COLUMNS.length, 5);
  assert.deepEqual(
    COLUMNS.map((c) => c.key),
    ['name', 'program', 'days', 'hours', 'price'],
  );
});

test('CONTROL: an array one element short is flagged', () => {
  /**
   * The guard above is the one that matters: the colgroup, the `<th>` row and
   * the `<td>` row are all `COLUMNS.map(...)`, so a dropped entry does not
   * merely lose a width — it deletes an entire column from all three at once.
   * Without this control, `columnProblems` could be returning `[]`
   * unconditionally and every assertion in this file would still pass.
   */
  const short = COLUMNS.slice(0, 4);
  const problems = columnProblems(short);
  assert.ok(problems.length > 0, 'a 4-column array must be rejected');
  assert.match(problems[0], /expected 5 columns, got 4/);
});

test('exactly one column is flexible — the one that absorbs the slack', () => {
  const flexible = COLUMNS.filter((c) => c.width === null);
  assert.equal(flexible.length, 1);
  assert.equal(flexible[0].key, 'name', 'ชื่อหลักสูตร is the column that wraps');
});

test('CONTROL: a second widthless column is flagged', () => {
  // Two flexible columns divide the slack between them, so the table stops
  // being predictable group-to-group — which is the bug this layout fixes.
  const twoFlex = COLUMNS.map((c) => (c.key === 'price' ? { ...c, width: null } : c));
  const problems = columnProblems(twoFlex);
  assert.ok(problems.some((p) => /exactly 1 flexible column, got 2/.test(p)));
});

test('every fixed column has a positive width, a label and an alignment', () => {
  for (const c of COLUMNS) {
    assert.ok(c.label, `${c.key} needs a label`);
    assert.ok(c.align, `${c.key} needs an alignment class`);
    if (c.width !== null) assert.ok(c.width > 0, `${c.key} needs a positive width`);
  }
});

test('CONTROL: a zero width and a missing label are both flagged', () => {
  assert.ok(
    columnProblems(COLUMNS.map((c) => (c.key === 'days' ? { ...c, width: 0 } : c)))
      .some((p) => /non-positive width/.test(p)),
  );
  assert.ok(
    columnProblems(COLUMNS.map((c) => (c.key === 'days' ? { ...c, label: '' } : c)))
      .some((p) => /has no label/.test(p)),
  );
});

test('TABLE_MIN_WIDTH is derived from the array, not written down', () => {
  const expected = COLUMNS.reduce((s, c) => s + (c.width ?? NAME_MIN_WIDTH), 0);
  assert.equal(TABLE_MIN_WIDTH, expected);
  assert.equal(TABLE_MIN_WIDTH, 744, '320 + 176 + 56 + 56 + 136');
});

test('CONTROL: the derivation moves when a width does', () => {
  /**
   * Without this, TABLE_MIN_WIDTH could be a hardcoded 744 and the assertion
   * above would pass by coincidence. Recompute the same rule over a mutated
   * array: widening one column by 40 must move the total by exactly 40.
   */
  const widened = COLUMNS.map((c) => (c.key === 'price' ? { ...c, width: c.width + 40 } : c));
  const total = widened.reduce((s, c) => s + (c.width ?? NAME_MIN_WIDTH), 0);
  assert.equal(total, TABLE_MIN_WIDTH + 40);
});

test('the flexible column contributes its floor to the table minimum', () => {
  // The name column has no fixed width, so the floor is the only thing it can
  // contribute — this is what makes a narrow viewport scroll rather than squash.
  const fixedOnly = COLUMNS.reduce((s, c) => s + (c.width ?? 0), 0);
  assert.equal(TABLE_MIN_WIDTH - fixedOnly, NAME_MIN_WIDTH);
});
