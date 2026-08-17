import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFragment, serialize } from 'parse5';
import {
  wrapArticleTables,
  tableLabel,
  TABLE_WRAPPER_CLASS,
} from '@/lib/articles/wrapArticleTables';

/**
 * The server-side table wrapper for article bodies.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 * A table wider than the content column overflowed it, and the page does not
 * gain a horizontal scrollbar to compensate: `body { overflow-x: clip }`
 * creates NO scroll container, so the overflowing columns were unreachable by
 * any means — no scrollbar, no touch-drag, not even programmatic scrollLeft.
 * 10 of the corpus's 103 tables (the 5- and 6-column ones) are affected.
 *
 * f987a84 chose "cells compress" and that was wrong for a specific reason:
 * `overflow-wrap: break-word` does not reduce min-content width (CSS Text 3
 * §5.5 — only `anywhere` does), so the cells never compressed at all.
 *
 * ── WHY THIS IS A PARSER AND NOT A REGEX ────────────────────────────────────
 * A wrapper cannot be added by sanitize-html (`transformTags` renames tags and
 * edits attributes; returning markup in `tagName` emits malformed output and
 * the `text` field is escaped AND discards children — both verified). And it
 * cannot be added by string matching: `>` inside a quoted attribute value,
 * `<table` inside a comment, and nested tables are not a grammar worth
 * hand-rolling. Both hazards below are fired at a naive matcher so the choice
 * of parse5 is demonstrated rather than asserted.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * It is a string transform: no layout, no widths, no scrolling. That a wide
 * table actually scrolls, and that a narrow one still reaches the column edge,
 * are properties of the CSS box model and are guarded — as far as they can be
 * at this tier — in test/fs/articleContentEmbeds.test.mjs, which reads the
 * shipped stylesheet. Whether the scroll shadow is visible is checked by a
 * human and by nothing else.
 */

const TABLE = '<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>';
const wrappers = (s) => (s.match(new RegExp(`class="${TABLE_WRAPPER_CLASS}"`, 'g')) || []).length;

// ── the cheap gate: bodies with no table are never parsed ───────────────────

test('a body with no table comes back as the identical string', () => {
  // 416 of 488 corpus bodies. Byte-identical, not merely equivalent — the
  // parser is never reached, so there is no re-serialisation to accept.
  for (const body of [
    '<p>hello <em>world</em></p>',
    '<p>a</p><div data-youtube-video=""><iframe src="x"></iframe></div>',
    '<p>&nbsp;&amp; entities &lt;kept&gt;</p>',
  ]) {
    assert.equal(wrapArticleTables(body), body, 'returned the same bytes');
  }
});

test('CONTROL: the identity check does notice when a body IS rewritten', () => {
  // Otherwise "output === input" above could be passing because the function
  // is inert on everything.
  assert.notEqual(wrapArticleTables(TABLE), TABLE, 'a real table is rewritten');
  assert.equal(wrappers(wrapArticleTables(TABLE)), 1, 'and gains exactly one wrapper');
});

test('the gate is case-insensitive, so <TABLE> is not silently skipped', () => {
  const upper = '<TABLE><TR><TD>a</TD></TR></TABLE>';
  assert.equal(wrappers(wrapArticleTables(upper)), 1, 'uppercase HTML is still HTML');
});

test('CONTROL: a case-sensitive gate would have missed it', () => {
  assert.equal(upperHasLowercaseTag(), false, 'the uppercase body contains no literal "<table"');
  function upperHasLowercaseTag() { return '<TABLE><TR><TD>a</TD></TR></TABLE>'.includes('<table'); }
});

// ── the wrapper itself ──────────────────────────────────────────────────────

test('every table is wrapped in a focusable, named scroll region', () => {
  const out = wrapArticleTables(TABLE);
  assert.match(out, new RegExp(`<div class="${TABLE_WRAPPER_CLASS}"`), 'the wrapper class');
  assert.match(out, /tabindex="0"/, 'focusable, or a keyboard user cannot scroll it');
  assert.match(out, /role="region"/, 'and it is a region');
  assert.match(out, /aria-label="ตารางที่ 1"/, 'with a name, or it is an unlabelled region');
  assert.match(out, /<table>/, 'the table is still a real table inside it');
  assert.match(out, /<td>a<\/td><td>b<\/td>/, 'and its cells are untouched');
});

test('CONTROL: none of those are present before the transform', () => {
  // Fired at the input, which genuinely lacks every one of them.
  for (const probe of [/tabindex="0"/, /role="region"/, /aria-label=/, new RegExp(TABLE_WRAPPER_CLASS)]) {
    assert.equal(probe.test(TABLE), false, `${probe} must not already be in the source`);
  }
});

test('every table gets a wrapper, and each region a distinct name', () => {
  // Wrapping only the wide ones is impossible — width is not knowable on the
  // server. A narrow table simply never overflows, so it never scrolls.
  const three = TABLE + TABLE + TABLE;
  const out = wrapArticleTables(three);
  assert.equal(wrappers(out), 3, 'three tables, three wrappers');
  const labels = [...out.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['ตารางที่ 1', 'ตารางที่ 2', 'ตารางที่ 3']);
  assert.equal(new Set(labels).size, 3, 'three regions named the same would be worse than useless');
});

test('CONTROL: the distinctness check would catch a constant name', () => {
  const constant = ['ตาราง', 'ตาราง', 'ตาราง'];
  assert.equal(new Set(constant).size, 1, 'a shared name collapses to one');
  assert.equal(tableLabel(0) === tableLabel(1), false, 'and the real labeller does not');
});

// ── the two hazards that rule out string matching ───────────────────────────

test('a > inside a quoted attribute value does not break the wrap', () => {
  const src = '<table data-x="a>b"><tbody><tr><td>c</td></tr></tbody></table>';
  const out = wrapArticleTables(src);
  assert.equal(wrappers(out), 1, 'wrapped exactly once');
  assert.match(out, /data-x="a>b"/, 'and the attribute value survived intact');
});

test('CONTROL: a naive <table[^>]*> matcher genuinely mangles that case', () => {
  // The hazard is demonstrated, not asserted — this is why the module parses.
  const src = '<table data-x="a>b"><tbody><tr><td>c</td></tr></tbody></table>';
  const naive = /<table[^>]*>/.exec(src)[0];
  assert.equal(naive, '<table data-x="a>', 'the naive match stops inside the quotes');
  assert.equal(naive.endsWith('">'), false, 'so a regex wrap would emit broken HTML');
});

test('a <table inside a comment is not a table', () => {
  // The fixture carries an unquoted attribute ON PURPOSE. parse5 normalises
  // `class=x` to `class="x"`, so this body does NOT survive a round-trip
  // unchanged — which makes the "nothing was wrapped, so hand back the
  // ORIGINAL bytes" branch observable. With a body that round-trips
  // identically (the first version of this test) the branch is invisible and
  // the assertion passes whether or not the code has it.
  const src = '<!-- <table> old markup --><p class=x>hi</p>';
  assert.equal(wrapArticleTables(src), src, 'byte-identical: nothing to wrap');
  assert.equal(wrappers(wrapArticleTables(src)), 0, 'and no wrapper emitted');
});

test('CONTROL: that body genuinely does NOT survive a parse5 round-trip', () => {
  // Proves the test above is exercising the original-bytes branch rather than
  // passing because re-serialisation happens to be a no-op.
  const src = '<!-- <table> old markup --><p class=x>hi</p>';
  assert.equal(serialize(parseFragment(src)), '<!-- <table> old markup --><p class="x">hi</p>',
    'parse5 quotes the bare attribute value');
  assert.notEqual(serialize(parseFragment(src)), src, 'so returning the parse would change bytes');
});

test('CONTROL: that body DOES trip the cheap gate, so the parser is what saved it', () => {
  // If the gate had rejected it, the test above would pass for the wrong
  // reason and prove nothing about the parser.
  assert.equal(/<table/i.test('<!-- <table> old markup --><p>hi</p>'), true,
    'the substring gate lets it through');
  assert.equal(/<table[^>]*>/.test('<!-- <table> old markup --><p>hi</p>'), true,
    'and a naive matcher would have wrapped a comment');
});

test('nested tables are each wrapped', () => {
  const src = '<table><tbody><tr><td>' + TABLE + '</td></tr></tbody></table>';
  const out = wrapArticleTables(src);
  assert.equal(wrappers(out), 2, 'outer and inner both scroll independently');
});

// ── idempotence and determinism ─────────────────────────────────────────────

test('running twice changes nothing the second time', () => {
  // The page path runs this once, but a body that already carries wrappers
  // (a re-render, a future second pass) must not accumulate them.
  const once = wrapArticleTables(TABLE);
  const twice = wrapArticleTables(once);
  assert.equal(twice, once, 'byte-identical on the second pass');
  assert.equal(wrappers(twice), 1, 'and still exactly one wrapper');
});

test('CONTROL: the first pass really did change it, so idempotence is not vacuous', () => {
  assert.notEqual(wrapArticleTables(TABLE), TABLE);
  assert.equal(wrappers(TABLE), 0, 'the source had no wrapper to begin with');
});

test('the same input always yields the same output', () => {
  // No clock, no randomness — the server render the client hydrates against
  // has to be stable.
  const src = TABLE + '<p>x</p>' + TABLE;
  assert.equal(wrapArticleTables(src), wrapArticleTables(src));
});

// ── it never loses the article ──────────────────────────────────────────────

test('falsy and malformed input are handled without throwing', () => {
  assert.equal(wrapArticleTables(''), '');
  assert.equal(wrapArticleTables(null), '');
  assert.equal(wrapArticleTables(undefined), '');
  for (const junk of ['<table', '<table><tr><td>unclosed', '</table>', '<table></p></table>']) {
    assert.doesNotThrow(() => wrapArticleTables(junk), `threw on ${JSON.stringify(junk)}`);
    assert.equal(typeof wrapArticleTables(junk), 'string');
  }
});

test('CONTROL: the malformed inputs are genuinely malformed', () => {
  // Otherwise "does not throw" is a claim about well-formed HTML.
  assert.equal(/<table[\s\S]*<\/table>/.test('<table><tr><td>unclosed'), false,
    'no closing tag anywhere');
  assert.equal('</table>'.startsWith('<table'), false, 'a bare closing tag');
});
