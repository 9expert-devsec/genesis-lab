import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLocalFaqs,
  sortLocalFaqs,
  insertLocalFaq,
  replaceLocalFaq,
  removeLocalFaq,
} from '@/lib/localFaqList';

// The ordering rule CourseFaqManager splices by. It must agree with the server
// read (`.sort({ display_order: 1 })` in getLocalFaqs.js) or a created row sits
// in the right list at the wrong index — correct until the next load, then it
// moves, which reads as a second bug rather than an unfinished first one.
//
// WHAT THESE TESTS CANNOT SEE: that the server read still sorts this way. That
// is a query in a different file; if someone adds `.sort({ createdAt: -1 })`
// there, nothing here goes red. The module docstring names the query so the
// coupling is at least written down.

const ids = (rows) => rows.map((r) => r._id);

// Deliberately NOT in display_order sequence. If the fixture arrived sorted,
// every ordering assertion below would pass for a function that does nothing.
const ROWS = [
  { _id: 'b', display_order: 5, question_th: 'B' },
  { _id: 'a', display_order: 0, question_th: 'A' },
  { _id: 'c', display_order: 10, question_th: 'C' },
];

test('CONTROL: the fixture is NOT already in display order', () => {
  assert.notDeepEqual(ids(ROWS), ids([...ROWS].sort(compareLocalFaqs)));
});

test('sortLocalFaqs orders by display_order ascending and copies', () => {
  const out = sortLocalFaqs(ROWS);
  assert.deepEqual(ids(out), ['a', 'b', 'c']);
  assert.notEqual(out, ROWS, 'returns a copy — React state must not be mutated');
  assert.deepEqual(ids(ROWS), ['b', 'a', 'c'], 'input untouched');
});

test('a missing display_order sorts as 0, not as NaN', () => {
  // A row saved before the field existed reads back undefined; NaN comparisons
  // return false in both directions and would scatter the list unpredictably.
  const out = sortLocalFaqs([{ _id: 'x', display_order: 7 }, { _id: 'y' }]);
  assert.deepEqual(ids(out), ['y', 'x']);
});

// ── insert: the position the server implies, not the end ───────────

test('an inserted row lands where its display_order says, NOT at the end', () => {
  // display_order 3 belongs between a(0) and b(5).
  const out = insertLocalFaq(ROWS, { _id: 'new', display_order: 3 });
  assert.deepEqual(ids(out), ['a', 'new', 'b', 'c']);
});

test('CONTROL: an append-only implementation would fail that', () => {
  // The same fixture and the same new row, appended without sorting. This is
  // what the naive fix produces, and it is wrong the moment the list is
  // reloaded — so the assertion above is genuinely testing the ordering and not
  // just "the row is present somewhere".
  const appended = ids([...ROWS, { _id: 'new', display_order: 3 }]);
  assert.notDeepEqual(appended, ['a', 'new', 'b', 'c']);
  assert.deepEqual(appended, ['b', 'a', 'c', 'new']);
});

test('an inserted row DOES land last when its display_order says last', () => {
  // Pairs with the test above: the fix must not over-correct into "never
  // append". The common case — create with display_order = rows.length on a
  // contiguous list — still appends.
  const out = insertLocalFaq(ROWS, { _id: 'new', display_order: 99 });
  assert.deepEqual(ids(out), ['a', 'b', 'c', 'new']);
});

test('a tie inserts AFTER the existing row of the same order (stable)', () => {
  // Reachable today: delete does not renumber, so create-with-rows.length can
  // collide. The server has no secondary sort key, so it has no defined answer
  // here; this pins ours rather than leaving it to chance.
  const out = insertLocalFaq(ROWS, { _id: 'tie', display_order: 5 });
  assert.deepEqual(ids(out), ['a', 'b', 'tie', 'c']);
});

// ── replace: an edit can move a row ────────────────────────────────

test('an edited row is replaced in place and keeps its position', () => {
  const out = replaceLocalFaq(ROWS, { _id: 'b', display_order: 5, question_th: 'B EDITED' });
  assert.deepEqual(ids(out), ['a', 'b', 'c']);
  assert.equal(out[1].question_th, 'B EDITED');
});

test('CONTROL: the edit really replaced — the old text is gone', () => {
  const out = replaceLocalFaq(ROWS, { _id: 'b', display_order: 5, question_th: 'B EDITED' });
  assert.ok(!out.some((r) => r.question_th === 'B'));
});

test('an edit that changes display_order MOVES the row', () => {
  const out = replaceLocalFaq(ROWS, { _id: 'c', display_order: 1 });
  assert.deepEqual(ids(out), ['a', 'c', 'b']);
});

test('editing a row this client has never seen inserts it', () => {
  // Another tab created it; a silent no-op would drop a row the server has.
  const out = replaceLocalFaq(ROWS, { _id: 'ghost', display_order: 2 });
  assert.deepEqual(ids(out), ['a', 'ghost', 'b', 'c']);
});

// ── remove ─────────────────────────────────────────────────────────

test('remove drops exactly one row, by string-compared id', () => {
  assert.deepEqual(ids(removeLocalFaq(ROWS, 'b')), ['b', 'a', 'c'].filter((i) => i !== 'b'));
  assert.deepEqual(ids(removeLocalFaq(ROWS, 'nope')), ['b', 'a', 'c'], 'unknown id is a no-op');
});

test('remove compares ids as strings — an ObjectId must still match', () => {
  const rows = [{ _id: { toString: () => 'oid-1' } }, { _id: 'oid-2' }];
  assert.equal(removeLocalFaq(rows, 'oid-1').length, 1);
});

test('every helper tolerates a null/undefined list', () => {
  assert.deepEqual(sortLocalFaqs(undefined), []);
  assert.deepEqual(insertLocalFaq(null, { _id: 'a', display_order: 0 }).length, 1);
  assert.deepEqual(replaceLocalFaq(null, { _id: 'a' }).length, 1);
  assert.deepEqual(removeLocalFaq(undefined, 'a'), []);
});
