import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentSectionPath, depthOfPath, getAt } from '@/components/pageBuilder/editor/pagePath';

/**
 * Finding the section that CONTAINS the selected one, for the settings header.
 *
 * ── WHY A HELPER AND NOT AN INLINE SLICE ───────────────────────────────────
 * The panel needs the parent; `pagePath.js` is where every other fact about a
 * path already lives, and `depthOfPath` right below this divides by the same
 * three-keys-per-level shape. An inline `selection.slice(0, -3)` in the panel
 * would be a second place that knows a path's stride, and the day the stride
 * changes only one of them would be found.
 *
 * ── THE NULL IS THE LOAD-BEARING PART ──────────────────────────────────────
 * A top-level section has no parent, and `[]` is NOT a safe way to say so: it
 * is a valid path that `getAt` resolves to the whole page object. A caller
 * would then read `page.type` (undefined), label it, and render a header
 * describing a parent that does not exist. Returning null makes that mistake
 * impossible to make by accident, and the test below shows the `[]` answer
 * really would have been dangerous rather than merely untidy.
 */

const PAGE = {
  sections: [
    { id: 'top', type: 'container', content: {
      children: [
        { id: 'kid', type: 'heading', content: {} },
        { id: 'kid2', type: 'two_column', content: {
          left: [{ id: 'deep', type: 'cta', content: {} }],
          right: [],
        } },
      ],
    } },
    { id: 'plain', type: 'rich_text', content: {} },
  ],
};

const TOP = ['sections', 0];
const KID = ['sections', 0, 'content', 'children', 0];
const KID2 = ['sections', 0, 'content', 'children', 1];
const DEEP = ['sections', 0, 'content', 'children', 1, 'content', 'left', 0];

// ── 1. top level has no parent ─────────────────────────────────────────────

test('a top-level section returns null, not an empty path', () => {
  assert.equal(parentSectionPath(TOP), null);
  assert.equal(parentSectionPath(['sections', 7]), null);
});

test('CONTROL: an empty path would NOT have been a harmless answer', () => {
  /**
   * Why null rather than []. `getAt(page, [])` is the page itself — truthy, and
   * with no `type`, so a header would render a label for a parent that is not
   * there. This shows the failure the null forecloses.
   */
  assert.equal(getAt(PAGE, []), PAGE);
  assert.ok(getAt(PAGE, []), 'the page object is truthy, so [] would pass a null-check');
  assert.equal(getAt(PAGE, []).type, undefined, 'and it has no type to label');
  // Whereas the real answer cannot be used by mistake.
  assert.equal(parentSectionPath(TOP), null);
});

// ── 2. nested selections name the containing SECTION ───────────────────────

test('a child of a container resolves to that container', () => {
  assert.deepEqual(parentSectionPath(KID), TOP);
  assert.equal(getAt(PAGE, parentSectionPath(KID)).id, 'top');
  assert.equal(getAt(PAGE, parentSectionPath(KID)).type, 'container');
});

test('a grandchild resolves to its immediate parent, not to the top', () => {
  // DEEP sits in two_column's left slot, which sits inside the container.
  assert.deepEqual(parentSectionPath(DEEP), KID2);
  assert.equal(getAt(PAGE, parentSectionPath(DEEP)).id, 'kid2');
  assert.notEqual(getAt(PAGE, parentSectionPath(DEEP)).id, 'top');
});

test('walking up from the deepest node reaches the top and then stops', () => {
  // The chain terminates rather than looping or going negative.
  const chain = [];
  let p = DEEP;
  while (p) { chain.push(getAt(PAGE, p).id); p = parentSectionPath(p); }
  assert.deepEqual(chain, ['deep', 'kid2', 'top']);
});

test('the parent is always exactly one depth level up', () => {
  /**
   * Ties this to depthOfPath, which is the other reader of a path's stride. If
   * one is changed without the other, this goes red rather than the panel
   * quietly naming the wrong ancestor.
   */
  for (const path of [KID, KID2, DEEP]) {
    assert.equal(depthOfPath(parentSectionPath(path)), depthOfPath(path) - 1,
      `parentSectionPath and depthOfPath disagree about the stride at ${path.join('.')}`);
  }
  assert.equal(depthOfPath(TOP), 0);
  assert.equal(depthOfPath(DEEP), 2);
});

// ── 3. shapes that must not throw ──────────────────────────────────────────

test('malformed input returns null rather than throwing', () => {
  for (const bad of [null, undefined, [], ['sections'], 'sections.0', 42, {}]) {
    assert.equal(parentSectionPath(bad), null, `${JSON.stringify(bad)} did not return null`);
  }
});

test('CONTROL: the helper does return a path for something, so the nulls mean something', () => {
  assert.notEqual(parentSectionPath(KID), null);
  assert.ok(Array.isArray(parentSectionPath(KID)));
});
