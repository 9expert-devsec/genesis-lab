import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { SectionContentEditor } from '@/components/pageBuilder/editor/SectionContentEditor';
import { moveInArray } from '@/components/pageBuilder/editor/pagePath';
import { readSource } from '../sourceScan.mjs';

/**
 * Reordering items inside a timeline / tabs / accordion / checklist.
 *
 * ── WHAT IS RENDERED HERE AND WHAT IS NOT ──────────────────────────────────
 * `ItemList` is not exported — it is reached through `SectionContentEditor`,
 * which is how the app reaches it too, so these render the real editor for a
 * real section type rather than a stand-in.
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and one leaked React root breaks unrelated files. That means CLICKS cannot be
 * dispatched — so the reorder BEHAVIOUR is proven against `moveInArray`, the
 * function the button calls, in test/pure/moveInArray.test.mjs, and what is
 * proven here is the other half: that the controls exist, are labelled, are
 * disabled at exactly the right ends, and that the rendered order and its
 * position labels agree with what that function returns.
 *
 * ── WHY ELEMENT BOUNDARIES, NOT SUBSTRINGS ─────────────────────────────────
 * Thai qualifies by prefix and these labels overlap by construction:
 * 'ย้ายรายการที่ 1 ขึ้น' and 'ย้ายรายการที่ 1 ลง' share everything but the last
 * word, and 'ลบรายการที่ 1' shares its stem with both. Every assertion reads an
 * exact aria-label or an exact textContent, never a substring.
 */

const SRC = 'src/components/pageBuilder/editor/SectionContentEditor.jsx';

const ITEMS = [
  { title: 'หนึ่ง', body: 'A' },
  { title: 'สอง', body: 'B' },
  { title: 'สาม', body: 'C' },
];

function editorDoc(type, content) {
  return new JSDOM(`<!doctype html><body>${renderToStaticMarkup(createElement(SectionContentEditor, {
    type, content, patch: () => {}, advanced: {}, resolved: null,
  }))}</body>`).window.document;
}

const rowsOf = (doc) => [...doc.querySelectorAll('[data-move="up"]')].map((b) => Number(b.getAttribute('data-row')));
const labelsOf = (doc) => [...doc.querySelectorAll('span')]
  .map((s) => s.textContent.trim()).filter((t) => /^#\d+$/.test(t));
const titlesOf = (doc) => [...doc.querySelectorAll('input[type="text"]')].map((i) => i.getAttribute('value'));

// ── 0. the harness reaches the real thing ──────────────────────────────────

test('CONTROL: the timeline editor really renders one row per item', () => {
  // Every "exactly N" assertion below is a subtraction from this. If the editor
  // rendered nothing, most of them would pass against an empty list.
  const doc = editorDoc('timeline', { items: ITEMS });
  assert.equal(rowsOf(doc).length, 3);
  assert.deepEqual(titlesOf(doc), ['หนึ่ง', 'สอง', 'สาม']);
});

// ── 1. the controls exist, on every consuming type ─────────────────────────

test('all four ItemList-backed types get move controls, one pair per item', () => {
  /**
   * The four call sites, with their own content keys — tabs stores `tabs`, the
   * rest store `items`. A reorder wired to only one key would pass a
   * timeline-only test and silently do nothing on tabs.
   */
  for (const [type, content, n] of [
    ['timeline', { items: ITEMS }, 3],
    ['accordion', { items: ITEMS }, 3],
    ['tabs', { tabs: ITEMS }, 3],
    ['checklist', { items: [{ text: 'a' }, { text: 'b' }] }, 2],
  ]) {
    const doc = editorDoc(type, content);
    assert.equal(doc.querySelectorAll('[data-move="up"]').length, n, `${type}: wrong number of up controls`);
    assert.equal(doc.querySelectorAll('[data-move="down"]').length, n, `${type}: wrong number of down controls`);
  }
});

test('the controls carry Thai labels in the file’s existing style, numbered from 1', () => {
  const doc = editorDoc('timeline', { items: ITEMS });
  const label = (sel) => [...doc.querySelectorAll(sel)].map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(label('[data-move="up"]'), [
    'ย้ายรายการที่ 1 ขึ้น', 'ย้ายรายการที่ 2 ขึ้น', 'ย้ายรายการที่ 3 ขึ้น',
  ]);
  assert.deepEqual(label('[data-move="down"]'), [
    'ย้ายรายการที่ 1 ลง', 'ย้ายรายการที่ 2 ลง', 'ย้ายรายการที่ 3 ลง',
  ]);
  // The existing delete label is untouched and still distinguishable from both.
  const all = [...doc.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter(Boolean);
  assert.ok(all.includes('ลบรายการที่ 1'), 'the delete control lost its label');
  assert.equal(all.filter((l) => l === 'ย้ายรายการที่ 1 ขึ้น').length, 1, 'a label is duplicated');
});

// ── 2. the boundaries: disabled, not wrapping ──────────────────────────────

test('the FIRST item cannot move up and the LAST cannot move down; the middle can do both', () => {
  const doc = editorDoc('timeline', { items: ITEMS });
  const dis = (sel) => [...doc.querySelectorAll(sel)].map((b) => b.hasAttribute('disabled'));
  assert.deepEqual(dis('[data-move="up"]'), [true, false, false]);
  assert.deepEqual(dis('[data-move="down"]'), [false, false, true]);
});

test('a ONE-item list has both controls disabled — nowhere to go in either direction', () => {
  const doc = editorDoc('timeline', { items: [ITEMS[0]] });
  assert.deepEqual(
    [...doc.querySelectorAll('[data-move]')].map((b) => b.hasAttribute('disabled')),
    [true, true],
  );
});

test('CONTROL: "disabled" is really being read, not assumed absent everywhere', () => {
  // If hasAttribute were always false the boundary tests would still pass for
  // the enabled positions and fail loudly here.
  const doc = editorDoc('timeline', { items: ITEMS });
  const enabled = [...doc.querySelectorAll('[data-move]')].filter((b) => !b.hasAttribute('disabled'));
  const disabled = [...doc.querySelectorAll('[data-move]')].filter((b) => b.hasAttribute('disabled'));
  assert.equal(enabled.length, 4, 'expected exactly four enabled move controls across three rows');
  assert.equal(disabled.length, 2, 'expected exactly two disabled controls — the two ends');
});

// ── 3. position labels track the ORDER, not the identity ───────────────────

test('the #n labels number the rendered order, so they are correct after a move', () => {
  /**
   * The labels are derived from the render index, so "correct after a move" is
   * the same claim as "correct for the order handed in". Asserted by rendering
   * the POST-MOVE array that moveInArray actually returns, rather than by
   * asserting the labels twice on the same input.
   */
  const before = editorDoc('timeline', { items: ITEMS });
  assert.deepEqual(labelsOf(before), ['#1', '#2', '#3']);
  assert.deepEqual(titlesOf(before), ['หนึ่ง', 'สอง', 'สาม']);

  const moved = moveInArray(ITEMS, 0, 1); // 'หนึ่ง' moves down one
  const after = editorDoc('timeline', { items: moved });
  assert.deepEqual(labelsOf(after), ['#1', '#2', '#3'], 'the labels stopped numbering from 1');
  assert.deepEqual(titlesOf(after), ['สอง', 'หนึ่ง', 'สาม'], 'the rendered order is not the moved order');

  // …and the labels really are positional: row 2 now names the item that moved.
  const rows = [...after.querySelectorAll('[data-move="up"]')].map((b) => b.getAttribute('aria-label'));
  assert.equal(rows[1], 'ย้ายรายการที่ 2 ขึ้น');
});

// ── 4. item F: the index key, and why it is safe HERE ──────────────────────

test('content follows its item across a reorder, because every field is CONTROLLED', () => {
  /**
   * ── WHY THIS IS THE RIGHT TEST FOR AN INDEX KEY ─────────────────────────
   * Index keys plus mutable order is a known way to carry an input's state to
   * the wrong row. The hazard needs state React PRESERVES because the key
   * matched — an uncontrolled input keeping its DOM value, or component-local
   * state surviving the re-render.
   *
   * These rows have neither, and that is what makes the index key safe rather
   * than merely untested. So the claim to pin is the PRECONDITION: values are
   * re-derived from props on every render, so after a move each row shows the
   * item now at that position. Asserted by rendering both orders and checking
   * every field, not just the moved one.
   */
  const moved = moveInArray(ITEMS, 2, 0); // 'สาม' to the front
  const doc = editorDoc('timeline', { items: moved });
  assert.deepEqual(titlesOf(doc), ['สาม', 'หนึ่ง', 'สอง']);
  assert.deepEqual(
    [...doc.querySelectorAll('textarea')].map((t) => t.textContent),
    ['C', 'A', 'B'],
    'a body stayed with its ROW instead of following its ITEM',
  );
});

test('the precondition the index key rests on: no local state, no uncontrolled input', () => {
  /**
   * The test above shows values follow the item. This says WHY, and it is the
   * half that can silently stop being true — give a row local state or a
   * defaultValue and the index key becomes a real bug with no failing test,
   * because a static render cannot observe preserved state at all.
   *
   * So the precondition is pinned at its source: the field primitives every row
   * is built from hold nothing.
   */
  const fields = readSource('src/components/pageBuilder/editor/fields.jsx').code;
  assert.equal(/\buseState\b/.test(fields), false,
    'fields.jsx now holds local state. A row that keeps state across a re-render makes '
    + 'ItemList’s index key unsafe under reordering — the state would stay with the ROW '
    + 'while the item moves. Give the rows a stable identity instead.');
  assert.equal(/\bdefaultValue\b/.test(fields), false,
    'fields.jsx now has an uncontrolled input. Its DOM value survives a re-render whose '
    + 'key matched, so after a reorder it would show the previous item’s text.');

  const editor = readSource(SRC).code;
  const list = editor.slice(editor.indexOf('function ItemList('), editor.indexOf('const CHECKLIST_FIELDS'));
  assert.ok(list.length > 500, 'the ItemList body was not located');
  assert.equal(/\buseState\b/.test(list), false,
    'ItemList now holds local state per render, which the index key would preserve across '
    + 'a reorder');
});

test('CONTROL: those probes DO fire on the shapes they forbid', () => {
  // Discrimination: the forbidden shapes through the identical probes, coming
  // out the other way. Without this the assertions above pass on any file that
  // simply does not contain the words.
  assert.equal(/\buseState\b/.test('const [v, setV] = useState(0);'), true);
  assert.equal(/\bdefaultValue\b/.test('<input defaultValue={x} />'), true);
  // …and do NOT fire on what the file legitimately contains.
  assert.equal(/\buseState\b/.test('value={value ?? \'\'}'), false);
  assert.equal(/\bdefaultValue\b/.test('value={value ?? \'\'}'), false);
});

// ── 5. the keyboard path ───────────────────────────────────────────────────

test('the controls are real buttons — keyboard-reachable without a custom key handler', () => {
  /**
   * The reason this build is buttons rather than drag-and-drop. Native HTML5
   * dragging has no keyboard path at all, so a drag build would need a second
   * mechanism beside it for keyboard users; these ARE that mechanism, and they
   * are reachable by Tab and activated by Enter/Space with no code of ours.
   *
   * What that requires is only that they be <button>, not a div with an onClick
   * — so that is what is asserted, along with the absence of anything that
   * would take them out of the tab order.
   */
  const doc = editorDoc('timeline', { items: ITEMS });
  const controls = [...doc.querySelectorAll('[data-move]')];
  assert.equal(controls.length, 6);
  for (const c of controls) {
    assert.equal(c.tagName, 'BUTTON', 'a move control is not a <button> — it may not be focusable');
    assert.equal(c.getAttribute('type'), 'button', 'a move control would submit a form');
    assert.equal(c.hasAttribute('tabindex'), false,
      'a move control overrides the tab order; the natural button order is what makes '
      + 'this keyboard-reachable');
    assert.ok(c.getAttribute('aria-label'), 'a move control has no accessible name');
  }
});

test('focus is moved to where the item WENT, so repeat presses keep moving one item', () => {
  /**
   * The behaviour a static render cannot show, pinned at the source instead.
   *
   * Rows are keyed by position, so after a move the button that was pressed
   * belongs to a DIFFERENT item. Left alone, a second press would move that
   * other item — holding the key to walk an item up a list would shuffle the
   * list instead of moving one thing. The handler records the destination index
   * and an effect focuses the same control in that row.
   *
   * Read from `code`, so the comment explaining this cannot satisfy it.
   */
  const editor = readSource(SRC).code;
  const list = editor.slice(editor.indexOf('function ItemList('), editor.indexOf('const CHECKLIST_FIELDS'));
  assert.match(list, /pendingFocus\.current = \{ index: to, dir \};/,
    'the move no longer records where the item landed, so focus stays on the row and a '
    + 'second press moves a different item');
  assert.match(list, /\.focus\(\)/, 'nothing ever moves focus after a reorder');
  assert.match(list, /data-move="\$\{dir\}"\]\[data-row="\$\{want\.index\}"/,
    'the focus target is no longer looked up by destination row — it can no longer follow '
    + 'the item');
});
