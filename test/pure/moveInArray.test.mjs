import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveInArray, moveWithin } from '@/components/pageBuilder/editor/pagePath';

/**
 * The arithmetic behind reordering an item inside a timeline / tabs /
 * accordion / checklist.
 *
 * ── WHY THIS IS A SHARED PRIMITIVE AND NOT A SECOND COPY ───────────────────
 * `moveWithin` has always held this logic, for reordering SECTIONS at a path.
 * Content items are not sections — they are a plain array on `content`, with no
 * path — so `moveWithin`'s signature does not fit them, but its arithmetic is
 * exactly what they need. Round 14 extracted the bare-array half rather than
 * writing a second one, because the off-by-one two copies would eventually
 * disagree about is the one asserted here: `to` is clamped AFTER the removal.
 *
 * Both are exercised below, and the last test pins that they still agree — the
 * extraction is only worth anything while `moveWithin` actually delegates.
 */

const ITEMS = [
  { title: 'a', body: 'A' },
  { title: 'b', body: 'B' },
  { title: 'c', body: 'C' },
  { title: 'd', body: 'D' },
];

// ── the whole array, every time — never just the moved element's index ─────

test('moving down by one swaps exactly two neighbours and leaves the rest alone', () => {
  assert.deepEqual(moveInArray(ITEMS, 1, 2), [
    { title: 'a', body: 'A' },
    { title: 'c', body: 'C' },
    { title: 'b', body: 'B' },
    { title: 'd', body: 'D' },
  ]);
});

test('moving up by one is the exact inverse', () => {
  assert.deepEqual(moveInArray(ITEMS, 2, 1), [
    { title: 'a', body: 'A' },
    { title: 'c', body: 'C' },
    { title: 'b', body: 'B' },
    { title: 'd', body: 'D' },
  ]);
  // …and a down-then-up round trip returns the original order.
  assert.deepEqual(moveInArray(moveInArray(ITEMS, 1, 2), 2, 1), ITEMS);
});

test('every item that did not move is the SAME OBJECT, not a copy', () => {
  /**
   * deepEqual would pass on an implementation that rebuilt each item, and a
   * rebuild is how an edit gets silently dropped — a stale item spread over a
   * fresh one. Identity is the stronger claim and the one that matters, since
   * the whole array is handed to `set` and replaces what the reducer holds.
   */
  const out = moveInArray(ITEMS, 0, 2);
  assert.equal(out[0], ITEMS[1]);
  assert.equal(out[1], ITEMS[2]);
  assert.equal(out[2], ITEMS[0], 'the moved item is not the same object either');
  assert.equal(out[3], ITEMS[3]);
});

test('the input array is never mutated', () => {
  const before = ITEMS.map((it) => ({ ...it }));
  moveInArray(ITEMS, 0, 3);
  moveInArray(ITEMS, 3, 0);
  assert.deepEqual(ITEMS, before);
});

// ── the boundaries: the behaviour ItemList's disabled buttons rest on ───────

test('a refused move returns the ORIGINAL array by identity, so callers can detect it', () => {
  /**
   * ItemList uses `next === list` to decide whether anything happened — pushing
   * a new array for a press that changed nothing would dirty the page.
   */
  const empty = [];
  assert.equal(moveInArray(ITEMS, 0, 0), ITEMS, 'a no-op move returned a new array');
  assert.equal(moveInArray(ITEMS, -1, 0), ITEMS, 'a negative source index was not refused');
  assert.equal(moveInArray(ITEMS, 4, 3), ITEMS, 'an out-of-range source index was not refused');
  assert.equal(moveInArray(empty, 0, 1), empty, 'an empty array was not handed straight back');
});

test('an out-of-range DESTINATION is CLAMPED, not refused — which is why ItemList guards the ends itself', () => {
  /**
   * THE SHARP EDGE, PINNED SO IT STAYS KNOWN. `from` is validated; `to` is only
   * clamped. So asking to move item 0 "up" to -1 produces a NEW ARRAY IN THE
   * SAME ORDER — deepEqual to the input, but not identical to it.
   *
   * That matters because the obvious way to write the caller is "attempt the
   * move, and if the result is the same array nothing happened". At the top of
   * the list that check does not fire: the array is new, so the caller would
   * hand the reducer a fresh array and mark the page dirty for a press that
   * moved nothing. ItemList therefore range-checks the destination BEFORE
   * calling this, and the buttons at the ends are disabled on top of that.
   *
   * Left as clamping rather than "fixed" to refuse: this helper is a pure
   * extraction of what moveWithin has always done, and the tree's reducer
   * depends on that behaviour. Changing it here would change MOVE_SECTION.
   */
  const upFromTop = moveInArray(ITEMS, 0, -1);
  assert.deepEqual(upFromTop, ITEMS, 'clamping changed the order');
  assert.notEqual(upFromTop, ITEMS, 'the sharp edge is gone — this now refuses, and the note above is stale');

  const downFromBottom = moveInArray(ITEMS, 3, 4);
  assert.deepEqual(downFromBottom, ITEMS, 'the last item moved somewhere other than where it already was');
  assert.notEqual(downFromBottom[0], ITEMS[3], 'the last item WRAPPED to the front');
});

test('CONTROL: the boundary refusals are not just "every move is refused"', () => {
  // Otherwise the identity assertions above would pass on a function that never
  // moved anything at all.
  assert.notEqual(moveInArray(ITEMS, 0, 1), ITEMS);
  assert.notEqual(moveInArray(ITEMS, 3, 2), ITEMS);
  assert.deepEqual(moveInArray(ITEMS, 0, 1).map((i) => i.title), ['b', 'a', 'c', 'd']);
  assert.deepEqual(moveInArray(ITEMS, 3, 2).map((i) => i.title), ['a', 'b', 'd', 'c']);
});

test('a non-array is handed straight back', () => {
  assert.equal(moveInArray(undefined, 0, 1), undefined);
  assert.equal(moveInArray(null, 0, 1), null);
});

// ── the extraction is only worth anything while moveWithin delegates ───────

test('moveWithin still produces the same order, at a path, through the shared primitive', () => {
  const page = { sections: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] };
  const moved = moveWithin(page, ['sections'], 0, 2);
  assert.deepEqual(moved.sections.map((s) => s.id), ['s2', 's3', 's1']);
  assert.deepEqual(
    moved.sections.map((s) => s.id),
    moveInArray(page.sections, 0, 2).map((s) => s.id),
    'moveWithin and moveInArray disagree — the extraction has grown a second implementation',
  );
});

test('moveWithin still refuses the same moves, and returns the page UNCHANGED by identity', () => {
  // The pre-extraction behaviour: a refused move returned `obj` itself. Callers
  // (the reducer) rely on that to avoid a pointless state write.
  const page = { sections: [{ id: 's1' }, { id: 's2' }] };
  assert.equal(moveWithin(page, ['sections'], 0, 0), page);
  assert.equal(moveWithin(page, ['sections'], 5, 0), page);
  assert.equal(moveWithin(page, ['nope'], 0, 1), page, 'a missing path no longer returns the page');
  // CONTROL: a legal move DOES produce a new page object.
  assert.notEqual(moveWithin(page, ['sections'], 0, 1), page);
});
