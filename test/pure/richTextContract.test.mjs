import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';

import { richTextExtensions } from '@/components/pageBuilder/editor/richText/tiptapExtensions';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import {
  RICH_TEXT_NODES,
  RICH_TEXT_MARKS,
  RICH_TEXT_NODE_ATTRS,
  RICH_TEXT_EXCLUDED,
} from '@/lib/pageBuilder/richTextContract';

/**
 * The rich-text contract, checked in the direction that breaks.
 *
 * `richTextContract.js` says the editor "is verified against the ProseMirror
 * schema those extensions generate". MEASURED while writing this file: nothing
 * did. `getSchema(richTextExtensions())` was called in
 * test/pure/richTextPlainJson for a different question (attribute prototypes)
 * and the NAME SETS were compared nowhere — the verification was a sentence in
 * a doc block, which is the exact failure mode the contract module was written
 * to end. This file is that sentence, executed.
 *
 * ── THE DIRECTION ────────────────────────────────────────────────────────
 * The dangerous question is not "can the walker render what Tiptap produces" —
 * it is "can Tiptap produce something the walker doesn't handle", because the
 * walker never errors on one. An unknown block is unwrapped to a `<span>` and
 * an unknown mark is dropped; both keep their text, so the author sees a
 * correct editor and a quietly wrong page.
 *
 * ── AND THE THIRD LIST, WHICH THIS INSTRUMENT CANNOT SEE ALONE ───────────
 * `RICH_TEXT_NODE_ATTRS` exists because an ATTRIBUTE is not a name: the schema
 * reads `paragraph` whether or not TextAlign is installed. What IS checkable
 * here is which nodes the generated schema hangs the attribute on — a `types:`
 * list that grew a third entry, or lost one, turns this red. That the attribute
 * reaches the RENDERED PAGE is a different claim and needs a different
 * instrument: test/render/richTextAlign.test.mjs.
 */

const extensions = richTextExtensions();
const schema = getSchema(extensions);

const nodeNames = Object.keys(schema.nodes).sort();
const markNames = Object.keys(schema.marks).sort();

test('the schema produces EXACTLY the nodes the walker declares', () => {
  assert.deepEqual(nodeNames, [...RICH_TEXT_NODES].sort());
});

test('the schema produces EXACTLY the marks the walker declares', () => {
  assert.deepEqual(markNames, [...RICH_TEXT_MARKS].sort());
});

test('nothing on the excluded list can be produced by the editor', () => {
  /**
   * The same claim from the other side, and not redundant: the two assertions
   * above would both stay green if a name were quietly moved from EXCLUDED into
   * NODES and an extension added to match. This one asks whether the names the
   * contract says are OUT are actually out, so admitting one is a deliberate
   * edit to this file's subject rather than a silent widening.
   */
  for (const name of RICH_TEXT_EXCLUDED) {
    assert.ok(!nodeNames.includes(name), `${name} is on RICH_TEXT_EXCLUDED and the schema produces it as a node`);
    assert.ok(!markNames.includes(name), `${name} is on RICH_TEXT_EXCLUDED and the schema produces it as a mark`);
  }
});

test('textAlign is declared on exactly the nodes the schema hangs it on', () => {
  /**
   * Two-way, because each direction fails for its own reason:
   *   · a node in the contract that the schema does NOT give the attribute to
   *     means the extension's `types:` list lost an entry — alignment silently
   *     stops working on that node;
   *   · a node the schema DOES give it to that the contract does not name means
   *     `types:` grew one — the editor can align something the walker has no
   *     renderer branch for, which is the publish-wrong failure again, in the
   *     one shape `getSchema` name-checking cannot catch.
   */
  const declaring = (attr) =>
    Object.entries(schema.nodes)
      .filter(([, type]) => attr in (type.spec.attrs ?? {}))
      .map(([name]) => name)
      .sort();
  const contractDeclaring = (attr) =>
    Object.entries(RICH_TEXT_NODE_ATTRS)
      .filter(([, attrs]) => attrs.includes(attr))
      .map(([name]) => name)
      .sort();

  const attrs = new Set(Object.values(RICH_TEXT_NODE_ATTRS).flat());
  assert.ok(attrs.size > 0, 'the third list is empty — nothing is being checked');
  for (const attr of attrs) {
    assert.deepEqual(declaring(attr), contractDeclaring(attr),
      `the schema and RICH_TEXT_NODE_ATTRS disagree about which nodes carry ${attr}`);
  }
});

test('every node named in the third list is a node the walker actually renders', () => {
  for (const name of Object.keys(RICH_TEXT_NODE_ATTRS)) {
    assert.ok(RICH_TEXT_NODES.includes(name),
      `${name} carries a declared attribute but is not in RICH_TEXT_NODES`);
  }
});

test('the editor offers THREE alignments, not TextAlign\'s four', () => {
  /**
   * TextAlign's own default list is `['left','center','right','justify']`. The
   * walker has no class for `justify` and the heading SECTION has no such
   * value either, so a button for it would author a value the renderer drops —
   * the same "looks right in the editor, publishes wrong" failure the whole
   * contract exists to prevent, arriving through an option default rather than
   * through an extension nobody meant to install.
   *
   * Read off the configured extension instance rather than the source text, so
   * a comment naming three cannot satisfy it.
   */
  const textAlign = extensions.find((e) => e.name === 'textAlign');
  assert.ok(textAlign, 'the TextAlign extension is not installed');
  assert.deepEqual([...textAlign.options.alignments].sort(), ['center', 'left', 'right']);
  assert.deepEqual([...textAlign.options.types].sort(), Object.keys(RICH_TEXT_NODE_ATTRS).sort());
  assert.equal(textAlign.options.defaultAlignment, null,
    'a non-null default would put an alignment on every paragraph the author never touched');
});

test('CONTROL — the comparisons can fail', () => {
  /**
   * Each assertion above is a set equality, and a set equality nobody has seen
   * go red is a claim about nothing. Drift is injected into a COPY of the
   * declared list rather than into the module or its source file: this suite
   * has already left the tree dirty three times by rewriting a source file and
   * restoring it (docs/ticket-a-test-rewrites-a-source-file-…), and a contract
   * check does not need to.
   */
  assert.throws(() => assert.deepEqual(nodeNames, [...RICH_TEXT_NODES, 'codeBlock'].sort()), /AssertionError/);
  assert.throws(() => assert.deepEqual(markNames, [...RICH_TEXT_MARKS].sort().slice(1)), /AssertionError/);
});

test('the walker module loads — its own contract assertion passed', async () => {
  /**
   * tiptapToReact.jsx throws AT MODULE LOAD when its renderer tables and the
   * declared lists disagree (the same fail-loudly pattern presets.js uses). So
   * IMPORTING IT IS THE ASSERTION; there is nothing to call.
   *
   * It is stated here rather than left implicit in the render tier because the
   * claim belongs to the contract, and a reader looking for "who checks the
   * walker's tables" should find the answer in the contract's own test file.
   */
  const walker = await import('@/components/pageBuilder/richText/tiptapToReact');
  assert.equal(typeof walker.renderTiptap, 'function');
});
