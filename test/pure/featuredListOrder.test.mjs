import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareFeaturedRows,
  sortFeaturedRows,
  insertFeaturedRow,
} from '@/lib/featuredListOrder';

// The comparator five admin menus read with: { sort_order: 1, createdAt: -1 }.
// The second half is DESCENDING, which is what makes "append the new row" wrong
// in a way that only shows up on the next page load.
//
// WHAT THESE TESTS CANNOT SEE: that the five action files still sort this way.
// A separate guard (test/fs/featuredFamilyShape.test.mjs) reads them and pins
// the comparator string; if someone changes a query, that goes red, not this.

const ids = (rows) => rows.map((r) => r._id);
const at = (iso) => new Date(iso).toISOString();

// Deliberately NOT in server order. If the fixture arrived sorted, a function
// that returned its input unchanged would pass every ordering test below.
const ROWS = [
  { _id: 'c', sort_order: 3, createdAt: at('2026-01-03T00:00:00Z') },
  { _id: 'a', sort_order: 0, createdAt: at('2026-01-01T00:00:00Z') },
  { _id: 'b', sort_order: 1, createdAt: at('2026-01-02T00:00:00Z') },
];

test('CONTROL: the fixture is NOT already in server order', () => {
  assert.notDeepEqual(ids(ROWS), ids([...ROWS].sort(compareFeaturedRows)));
});

test('sorts by sort_order ascending', () => {
  assert.deepEqual(ids(sortFeaturedRows(ROWS)), ['a', 'b', 'c']);
});

test('sortFeaturedRows copies — React state must not be mutated', () => {
  const out = sortFeaturedRows(ROWS);
  assert.notEqual(out, ROWS);
  assert.deepEqual(ids(ROWS), ['c', 'a', 'b'], 'input untouched');
});

test('a tie on sort_order breaks by createdAt DESCENDING — newest first', () => {
  const tied = [
    { _id: 'old', sort_order: 1, createdAt: at('2026-01-01T00:00:00Z') },
    { _id: 'new', sort_order: 1, createdAt: at('2026-06-01T00:00:00Z') },
  ];
  assert.deepEqual(ids(sortFeaturedRows(tied)), ['new', 'old']);
});

test('CONTROL: an ASCENDING tie-break would give the opposite answer', () => {
  // Pins the direction rather than merely "there is a tie-break". Flipping the
  // sign in the comparator reddens the test above and this one agrees with the
  // flipped version — so the two together fix the direction.
  const tied = [
    { _id: 'old', sort_order: 1, createdAt: at('2026-01-01T00:00:00Z') },
    { _id: 'new', sort_order: 1, createdAt: at('2026-06-01T00:00:00Z') },
  ];
  const ascending = [...tied].sort(
    (x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt)
  );
  assert.deepEqual(ids(ascending), ['old', 'new']);
  assert.notDeepEqual(ids(ascending), ids(sortFeaturedRows(tied)));
});

// ── insertion: the case the whole fix turns on ─────────────────────

test('a new row lands where its sort_order says, NOT at the end', () => {
  const created = { _id: 'new', sort_order: 1, createdAt: at('2026-06-01T00:00:00Z') };
  // sort_order 1 collides with row 'b'. createdAt DESC puts the NEWER row
  // FIRST, so it goes BEFORE b — not after it, and nowhere near the end.
  assert.deepEqual(ids(insertFeaturedRow(ROWS, created)), ['a', 'new', 'b', 'c']);
});

test('CONTROL: append-only produces a different list', () => {
  const created = { _id: 'new', sort_order: 1, createdAt: at('2026-06-01T00:00:00Z') };
  const appended = ids([...ROWS, created]);
  assert.deepEqual(appended, ['c', 'a', 'b', 'new']);
  assert.notDeepEqual(appended, ids(insertFeaturedRow(ROWS, created)));
});

test('CONTROL: a STABLE sort without the DESC tie-break also fails', () => {
  // Sharper than the append control: an implementation that sorts by
  // sort_order only, stably, puts the new row AFTER b. Only the createdAt DESC
  // half produces the server's answer.
  const created = { _id: 'new', sort_order: 1, createdAt: at('2026-06-01T00:00:00Z') };
  const sortOrderOnly = [...ROWS, created].sort(
    (x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)
  );
  assert.deepEqual(ids(sortOrderOnly), ['a', 'b', 'new', 'c']);
  assert.notDeepEqual(ids(sortOrderOnly), ids(insertFeaturedRow(ROWS, created)));
});

test('the common case still appends — the fix does not over-correct', () => {
  // Four of the five menus create with sort_order = countDocuments(), so on a
  // list with no gaps the new row genuinely belongs last.
  const created = { _id: 'new', sort_order: 3, createdAt: at('2026-06-01T00:00:00Z') };
  const contiguous = [
    { _id: 'a', sort_order: 0, createdAt: at('2026-01-01T00:00:00Z') },
    { _id: 'b', sort_order: 1, createdAt: at('2026-01-02T00:00:00Z') },
    { _id: 'c', sort_order: 2, createdAt: at('2026-01-03T00:00:00Z') },
  ];
  assert.deepEqual(ids(insertFeaturedRow(contiguous, created)), ['a', 'b', 'c', 'new']);
});

// ── degenerate inputs ──────────────────────────────────────────────

test('a missing sort_order sorts as 0, not as NaN', () => {
  const out = sortFeaturedRows([{ _id: 'x', sort_order: 7 }, { _id: 'y' }]);
  assert.deepEqual(ids(out), ['y', 'x']);
});

test('a non-numeric sort_order is treated as 0 rather than poisoning the sort', () => {
  const out = sortFeaturedRows([
    { _id: 'x', sort_order: 2 },
    { _id: 'junk', sort_order: 'abc' },
  ]);
  assert.deepEqual(ids(out), ['junk', 'x']);
});

test('a missing createdAt does not throw and sorts last within its tie', () => {
  const out = sortFeaturedRows([
    { _id: 'none', sort_order: 1 },
    { _id: 'dated', sort_order: 1, createdAt: at('2026-01-01T00:00:00Z') },
  ]);
  assert.deepEqual(ids(out), ['dated', 'none']);
});

test('a Date object works as well as an ISO string', () => {
  // create() returns Dates; the read path returns ISO strings after the JSON
  // round-trip. The spliced row and the reloaded row must order identically.
  const out = sortFeaturedRows([
    { _id: 'str', sort_order: 1, createdAt: at('2026-01-01T00:00:00Z') },
    { _id: 'obj', sort_order: 1, createdAt: new Date('2026-06-01T00:00:00Z') },
  ]);
  assert.deepEqual(ids(out), ['obj', 'str']);
});

test('insert and sort tolerate null lists and a null doc', () => {
  assert.deepEqual(sortFeaturedRows(undefined), []);
  assert.deepEqual(insertFeaturedRow(null, { _id: 'a', sort_order: 0 }).length, 1);
  assert.deepEqual(ids(insertFeaturedRow(ROWS, null)), ['a', 'b', 'c']);
});
