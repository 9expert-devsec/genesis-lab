import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { renderTiptap } from '@/components/pageBuilder/richText/tiptapToReact';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { RICH_TEXT_NODE_ATTRS } from '@/lib/pageBuilder/richTextContract';
// ADDED beside the statements above rather than folded into any. The class
// strings are compared against the `heading` SECTION's own source rather than
// retyped here, so the two surfaces cannot drift apart behind a passing test.
import { readSource } from '../sourceScan.mjs';

/**
 * ── ROUND B COMMIT 1: ALIGNMENT ON rich_text, AND WHY THIS FILE IS THE ONE
 *    THAT MATTERS ────────────────────────────────────────────────────────
 *
 * `textAlign` is neither a node nor a mark. It is an ATTRIBUTE on `paragraph`
 * and `heading`, which means every instrument this repo already had is blind to
 * it:
 *
 *   · `getSchema(richTextExtensions())` reports the node NAME `paragraph`,
 *     exactly as it did before TextAlign was installed. Nothing to compare.
 *   · the walker's own module-load assertion compares its renderer TABLES
 *     against RICH_TEXT_NODES / RICH_TEXT_MARKS. An attribute has no entry in
 *     either table, so the assertion stays green whether or not the walker
 *     reads it.
 *
 * So the failure this closes — the author centres a paragraph, the editor shows
 * it centred, and the published page is left-aligned with no error anywhere —
 * is invisible to both. The only instrument that can see it is a RENDER: put
 * the attribute on a document, walk it, and look at the markup that comes out.
 * That is this file.
 *
 * ── WHAT IS ASSERTED, IN THREE PARTS ────────────────────────────────────
 *   1. the attribute REACHES the output          (the feature)
 *   2. an absent attribute changes NOTHING       (the control that protects
 *                                                 every stored document)
 *   3. an unknown value emits no class at all    (author input can never reach
 *                                                 a class attribute)
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────
 * It sees which CLASSES land on which element. It sees no alignment: JSDOM
 * compiles no Tailwind and `text-center` is a string here. What is asserted is
 * the mechanism — that the class which lands is the one the attribute chose,
 * and that it is the SAME STRING the heading section uses for the same word.
 */

const draw = (doc) => renderToStaticMarkup(renderTiptap(doc));

/** One paragraph carrying whatever `attrs` a case wants to try. */
const para = (attrs) => ({
  type: 'doc',
  content: [{ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [{ type: 'text', text: 'ย่อหน้า' }] }],
});

/** One h2, the level the walker defaults to, carrying the same. */
const head = (attrs) => ({
  type: 'doc',
  content: [{ type: 'heading', attrs: { level: 2, ...attrs }, content: [{ type: 'text', text: 'หัวข้อ' }] }],
});

// ── 1. the attribute reaches the output ────────────────────────────────────

test('a paragraph with attrs.textAlign renders the matching class — all three', () => {
  assert.equal(draw(para({ textAlign: 'center' })), '<p class="text-center">ย่อหน้า</p>');
  assert.equal(draw(para({ textAlign: 'right' })), '<p class="text-right">ย่อหน้า</p>');
  assert.equal(draw(para({ textAlign: 'left' })), '<p class="text-left">ย่อหน้า</p>');
});

test('a heading with attrs.textAlign renders the matching class, and keeps its level', () => {
  /**
   * The level is asserted in the same breath deliberately: `heading` is the one
   * node here that already read an attribute, and a change that reached
   * `textAlign` by rewriting the renderer could quietly drop `level` with no
   * other test noticing — the walker's contract assertion counts names, not
   * attributes.
   */
  assert.equal(draw(head({ textAlign: 'center' })), '<h2 class="text-center">หัวข้อ</h2>');
  assert.equal(
    draw({ type: 'doc', content: [{ type: 'heading', attrs: { level: 4, textAlign: 'right' }, content: [{ type: 'text', text: 'หัวข้อ' }] }] }),
    '<h4 class="text-right">หัวข้อ</h4>',
  );
});

test('the class strings are the heading SECTION\'s own, not a second vocabulary', () => {
  /**
   * The whole point of reusing them: two surfaces that both say "center" must
   * not disagree about what centre means. Read off `sections/heading.jsx`
   * rather than retyped, so renaming one without the other turns this red.
   *
   * Comments stripped (`.code`), this suite's standing rule — a doc block
   * naming the classes would otherwise satisfy the match on its own.
   */
  const section = readSource('src/components/pageBuilder/sections/heading.jsx').code;
  const walker = readSource('src/components/pageBuilder/richText/tiptapToReact.jsx').code;
  const table = /ALIGN_CLASS\s*=\s*\{([^}]*)\}/;
  const sectionTable = section.match(table);
  const walkerTable = walker.match(table);
  assert.ok(sectionTable, 'the heading section no longer declares an ALIGN_CLASS table');
  assert.ok(walkerTable, 'the walker no longer declares an ALIGN_CLASS table');
  const normalise = (s) => s.replace(/['"\s]/g, '');
  assert.equal(normalise(walkerTable[1]), normalise(sectionTable[1]),
    'the walker and the heading section disagree about what left/center/right mean');
});

test('the contract declares the attribute, on exactly the nodes that read it', () => {
  /**
   * The third list earning its place. `getSchema` cannot see an attribute, so
   * the declaration is what a reader — and the editor's extension config — has
   * to go on, and a declaration nothing checks is the comment-as-contract this
   * module was written to replace.
   */
  assert.deepEqual(Object.keys(RICH_TEXT_NODE_ATTRS).sort(), ['heading', 'paragraph']);
  for (const node of Object.keys(RICH_TEXT_NODE_ATTRS)) {
    assert.deepEqual([...RICH_TEXT_NODE_ATTRS[node]], ['textAlign']);
  }
});

// ── 2. the control: a stored document is byte-identical ────────────────────

/**
 * MEASURED on the walker BEFORE this round, not derived from it afterwards —
 * which is the only way a byte-identity claim means anything. The fixture mixes
 * a heading, a bare paragraph, a bullet list (whose item wraps its text in a
 * paragraph, so the change reaches inside it too) and a marked run.
 */
const STORED_DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'หัวข้อ' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ย่อหน้า' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ก' }] }] },
    ] },
    { type: 'paragraph', content: [{ type: 'text', text: 'ตัวหนา', marks: [{ type: 'bold' }] }] },
  ],
};
const STORED_HTML =
  '<h2>หัวข้อ</h2><p>ย่อหน้า</p><ul><li><p>ก</p></li></ul><p><strong>ตัวหนา</strong></p>';

test('CONTROL — a document with no textAlign renders exactly what it rendered before', () => {
  /**
   * No class, no wrapper, no attribute. Every rich_text document stored on this
   * clone predates the attribute, so this is not a nicety: emitting `text-left`
   * for an absent value would rewrite the markup of every paragraph on every
   * published page, and would do it invisibly.
   *
   * This is why the walker's map deliberately does NOT default to 'left' the
   * way the heading SECTION does. The section has a schema default and every
   * stored heading already carries one; a document does not.
   */
  assert.equal(draw(STORED_DOC), STORED_HTML);
});

test('an explicit null — what the editor now stores for an unaligned paragraph — is also unchanged', () => {
  /**
   * TextAlign declares `defaultAlignment: null`, and ProseMirror emits an
   * `attrs` key as soon as a node type declares any attribute. So a paragraph
   * saved AFTER this round carries `attrs: { textAlign: null }` where one saved
   * before carries no `attrs` at all. Both must render the same bytes, or the
   * page changes the first time an author opens and re-saves it.
   */
  assert.equal(draw(para({ textAlign: null })), '<p>ย่อหน้า</p>');
  assert.equal(draw(para({})), '<p>ย่อหน้า</p>');
});

// ── 3. an unknown value degrades; author input never reaches a class ───────

test('an unknown textAlign renders the default — no class built from author input', () => {
  /**
   * The map is a lookup with three keys, so the only three strings that can
   * ever reach a class attribute are written in the walker. A value that is not
   * one of them is `undefined`, and React emits no attribute for `undefined`.
   *
   * `justify` is in the list on purpose: it is TextAlign's own fourth
   * alignment, switched off in the extension config, and it is the value most
   * likely to arrive from a document seeded outside the editor.
   */
  for (const value of ['justify', 'CENTER', 'centre', '', 'text-center', 0, true, {}, []]) {
    assert.equal(draw(para({ textAlign: value })), '<p>ย่อหน้า</p>',
      `textAlign ${JSON.stringify(value)} produced markup of its own`);
  }
});

test('a hostile textAlign cannot break out of the class attribute', () => {
  const hostile = 'center" onload="alert(1)';
  const out = draw(para({ textAlign: hostile }));
  assert.equal(out, '<p>ย่อหน้า</p>');
  assert.ok(!out.includes('onload'), 'author input reached the markup');
});

test('CONTROL — these assertions can fail', () => {
  /**
   * Every claim above is an equality against a literal, and an equality that
   * cannot be made to fail is a claim about nothing. Two directions, because
   * the two halves fail for opposite reasons: the feature half would go quiet
   * if the class stopped landing, the byte-identity half if a class started
   * landing where none should.
   */
  assert.throws(
    () => assert.equal(draw(para({ textAlign: 'center' })), '<p>ย่อหน้า</p>'),
    /AssertionError/,
    'the centred paragraph is indistinguishable from the unaligned one',
  );
  assert.throws(
    () => assert.equal(draw(STORED_DOC), STORED_HTML.replace('<p>ย่อหน้า</p>', '<p class="text-left">ย่อหน้า</p>')),
    /AssertionError/,
    'the stored-document fixture would pass even with a class it must not have',
  );
});
