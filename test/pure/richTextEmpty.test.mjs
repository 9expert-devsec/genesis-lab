import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmptyRichHtml } from '@/lib/richTextEmpty';

/**
 * "Is this Tiptap output empty" — the fallback decision the course rich body
 * (and any future rich field) makes at render. Every case is paired with its
 * own control so a broken shape names itself rather than hiding behind a loop.
 */

// ── EMPTY, each on its own ───────────────────────────────────────────────────

test('null is empty', () => {
  assert.equal(isEmptyRichHtml(null), true);
});

test('undefined is empty', () => {
  assert.equal(isEmptyRichHtml(undefined), true);
});

test('the empty string is empty', () => {
  assert.equal(isEmptyRichHtml(''), true);
});

test('whitespace-only is empty', () => {
  assert.equal(isEmptyRichHtml('   \n\t  '), true);
});

test('a bare empty paragraph is empty', () => {
  assert.equal(isEmptyRichHtml('<p></p>'), true);
});

test('a paragraph containing only a line break is empty', () => {
  // Tiptap/StarterKit's actual "nothing typed" output for an empty line —
  // distinct from a bare <p></p>, and the exact shape the three prior ad hoc
  // regexes in the repo did not handle (docs/audit's §2.2 finding).
  assert.equal(isEmptyRichHtml('<p><br></p>'), true);
});

test('a self-closing line break inside a paragraph is empty', () => {
  assert.equal(isEmptyRichHtml('<p><br/></p>'), true);
});

test('nested empty markup with no text anywhere is empty', () => {
  assert.equal(isEmptyRichHtml('<div><p></p><p><br></p></div>'), true);
});

test('an nbsp with nothing else is empty', () => {
  assert.equal(isEmptyRichHtml('<p>&nbsp;</p>'), true);
});

// ── NOT empty — real content, separate from the empty cases above ───────────

test('a paragraph with real text is NOT empty', () => {
  assert.equal(isEmptyRichHtml('<p>Hello</p>'), false);
});

test('text sitting alongside an empty paragraph is NOT empty', () => {
  assert.equal(isEmptyRichHtml('<p></p><p>Real content</p>'), false);
});

test('a heading with text is NOT empty', () => {
  assert.equal(isEmptyRichHtml('<h2>Course overview</h2>'), false);
});

test('text inside a list is NOT empty', () => {
  assert.equal(isEmptyRichHtml('<ul><li>a point</li></ul>'), false);
});

test('a single non-whitespace character is NOT empty', () => {
  assert.equal(isEmptyRichHtml('<p>.</p>'), false);
});
