import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionChildCounts } from '@/lib/pageBuilder/sectionLabels';
import { CONTAINER_SLOTS, isContainer } from '@/lib/pageBuilder/containerSlots';
import { ALL_SECTION_TYPES } from '@/lib/schemas/pageBuilder';

/**
 * How many children a container row reports.
 *
 * ── THE CLAIM THAT MATTERS IS THE REFUSAL TO SUM ───────────────────────────
 * `two_column` holds two slots. One total over it would be true arithmetic and
 * a false description — it reads as a single list of six where two lists
 * actually are, and the structure tree draws those two lists, labelled, right
 * underneath the row it would appear on. So this returns the counts PER SLOT
 * and leaves the caller no summed number to print by accident.
 *
 * The other half is the null: a non-container returns null rather than `[]`,
 * because `[]` invites a caller to render "0" and say a heading is an empty
 * container.
 */

const sec = (type, content) => ({ id: 'x', type, content });

// ── 1. per slot, never summed ──────────────────────────────────────────────

test('a multi-slot container reports each slot separately, with its own count', () => {
  const s = sec('two_column', {
    left: [sec('heading'), sec('heading'), sec('heading'), sec('heading')],
    right: [sec('heading'), sec('heading')],
  });
  assert.deepEqual(sectionChildCounts(s), [
    { slot: 'left', count: 4 },
    { slot: 'right', count: 2 },
  ]);
});

test('CONTROL: the two slot counts are DIFFERENT, so a summed answer is distinguishable', () => {
  /**
   * The fixture is 4 and 2 on purpose. With 3 and 3 a buggy implementation that
   * summed and halved, or that read one slot twice, would produce the same
   * numbers and this file would be green about nothing.
   */
  const s = sec('two_column', { left: [sec('heading')], right: [sec('heading'), sec('heading')] });
  const counts = sectionChildCounts(s);
  assert.deepEqual(counts.map((c) => c.count), [1, 2]);
  assert.notEqual(counts[0].count, counts[1].count);
  // …and nothing anywhere returns the sum.
  assert.equal(counts.some((c) => c.count === 3), false, 'a slot is reporting the TOTAL');
});

test('a single-slot container reports exactly one entry', () => {
  const s = sec('container', { children: [sec('heading'), sec('cta'), sec('image')] });
  assert.deepEqual(sectionChildCounts(s), [{ slot: 'children', count: 3 }]);
});

// ── 2. the null, and what it protects ──────────────────────────────────────

test('a NON-container returns null — not zero, not an empty list', () => {
  for (const type of ['heading', 'rich_text', 'cta', 'image', 'checklist', 'timeline', 'tabs']) {
    assert.equal(sectionChildCounts(sec(type, {})), null, `${type} reported a child count`);
  }
});

test('CONTROL: null is distinguishable from an empty container, which DOES report zeros', () => {
  // The distinction the null exists for: "has no slots" vs "has slots, holding
  // nothing". The second is worth saying on a row; the first must print nothing.
  assert.equal(sectionChildCounts(sec('heading', {})), null);
  assert.deepEqual(sectionChildCounts(sec('container', {})), [{ slot: 'children', count: 0 }]);
  assert.deepEqual(sectionChildCounts(sec('two_column', {})), [
    { slot: 'left', count: 0 }, { slot: 'right', count: 0 },
  ]);
});

test('every declared type returns a count iff it is a container — the two agree exactly', () => {
  /**
   * Not a spot check: the set that reports counts and the set `isContainer`
   * calls a container are compared across all 27 declared types, so neither can
   * drift into disagreeing with the other.
   */
  const reportsCount = ALL_SECTION_TYPES.filter((t) => sectionChildCounts(sec(t, {})) !== null);
  const containers = ALL_SECTION_TYPES.filter(isContainer);
  assert.deepEqual(reportsCount.sort(), containers.sort());
  assert.deepEqual(containers.sort(), Object.keys(CONTAINER_SLOTS).sort());
  assert.ok(containers.length > 0, 'no containers at all — the comparison is vacuous');
});

// ── 3. shapes that must not throw ──────────────────────────────────────────

test('a missing or malformed content is read as empty, not as a crash', () => {
  assert.deepEqual(sectionChildCounts({ type: 'container' }), [{ slot: 'children', count: 0 }]);
  assert.deepEqual(sectionChildCounts({ type: 'container', content: null }), [{ slot: 'children', count: 0 }]);
  assert.deepEqual(sectionChildCounts({ type: 'container', content: { children: 'nope' } }),
    [{ slot: 'children', count: 0 }]);
  assert.equal(sectionChildCounts(null), null);
  assert.equal(sectionChildCounts(undefined), null);
  assert.equal(sectionChildCounts({}), null);
});

test('the slot ORDER is the one containerSlots declares, not alphabetical', () => {
  // The row prints them in this order, and ซ้าย must come before ขวา.
  assert.deepEqual(sectionChildCounts(sec('two_column', {})).map((c) => c.slot), CONTAINER_SLOTS.two_column);
  assert.deepEqual(CONTAINER_SLOTS.two_column, ['left', 'right']);
});
