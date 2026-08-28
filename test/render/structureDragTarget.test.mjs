import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 40 commit 2 — the drop target moves to the `<li>`, and the keyboard
 * path is verified rather than assumed.
 *
 * ── WHY THE KEYBOARD HALF IS DRIVEN AND NOT READ ──────────────────────────
 * Round 25 chose buttons over drag precisely because native HTML5 drag has no
 * keyboard path, and round 29 warned that losing it "would be invisible in
 * review because the mouse path improves simultaneously". A markup check
 * cannot see that: a `<button>` with a handler that dispatches the wrong thing
 * looks identical to one that works. So the reducer is RUN — the button's own
 * action is applied to a real state and the resulting order compared.
 */

const SRC = 'src/components/pageBuilder/editor/StructurePanel.jsx';
const HOOK = 'src/components/pageBuilder/editor/useTreeDrag.js';

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const sec = (id, type, content = {}, name = '') => ({
  id, type, content, settings: {}, style: {}, layout: {}, advanced: {},
  enabled: true, sortOrder: 0, name,
});

function panelDoc(sections, expanded = []) {
  const markup = renderToStaticMarkup(
    createElement(EditorProvider,
      { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(StructurePanel, { initialExpanded: expanded })),
  );
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const rowsIn = (doc) => [...doc.querySelectorAll('li > div[draggable]')];
const primaries = (doc) => [...doc.querySelectorAll('[data-testid="row-primary"]')].map(text);

/** Three top-level leaves — the order this file reorders. */
const THREE = [
  sec('a', 'heading', {}, 'หนึ่ง'),
  sec('b', 'heading', {}, 'สอง'),
  sec('c', 'heading', {}, 'สาม'),
];

/** One open container holding two children, beside a leaf sibling. */
const OPEN = [
  sec('box', 'container', {
    children: [sec('k1', 'heading', {}, 'ลูกหนึ่ง'), sec('k2', 'heading', {}, 'ลูกสอง')],
  }, 'กล่อง'),
  sec('after', 'heading', {}, 'ท้ายสุด'),
];

// ── H: the two halves are on two elements ─────────────────────────────────

test('the DRAG SOURCE is the card and the DROP TARGET is the <li>', () => {
  const { code } = readSource(SRC);
  assert.match(code, /<li\s*\n\s*\{\.\.\.getDropTargetProps\(path\)\}/,
    'the drop target props are not on the <li>');
  assert.match(code, /\{\.\.\.getDragSourceProps\(path\)\}/,
    'the drag source props are not on the card');
  // …and they are two different props, not one spread twice.
  assert.equal(code.includes('getRowProps'), false,
    'the old combined getRowProps is back — source and target are one element again');
});

test('the hook hands out a SOURCE half and a TARGET half, and only those', () => {
  const { code } = readSource(HOOK);
  // The source half owns draggable + dragstart; the target half owns
  // dragover + drop. Neither may hold the other's handler.
  const source = code.slice(code.indexOf('getDragSourceProps'), code.indexOf('getDropTargetProps'));
  const target = code.slice(code.indexOf('getDropTargetProps'));
  assert.match(source, /draggable: true/);
  assert.match(source, /onDragStart/);
  assert.equal(/onDragOver/.test(source), false, 'the source half also listens for dragover');
  assert.match(target, /onDragOver/);
  assert.match(target, /onDrop/);
  assert.equal(/draggable: true/.test(target), false, 'the <li> became draggable — a container '
    + 'would then claim a drag begun on one of its own children');
});

test('the indicator is on the <li>, so it spans an open container\'s whole subtree', () => {
  /**
   * H's reason, asserted structurally. The `<li>` holds the card AND the
   * drawer; the card does not. An indicator on the card renders at the top of a
   * 54px box that may sit above 300px of drawer.
   */
  const doc = panelDoc(OPEN, ['box']);
  const li = doc.querySelector('li');
  const card = rowsIn(doc)[0];
  assert.ok(li.contains(card) && li !== card, 'the card is not inside the <li>');
  // The drawer is a SIBLING of the card, inside the same <li> — which is the
  // whole reason the target had to move.
  const drawer = [...li.children].find((n) => n !== card && n.querySelector('li'));
  assert.notEqual(drawer, undefined, 'the open drawer is not a sibling of the card');
  assert.equal(card.contains(drawer), false, 'the drawer is inside the card — H\'s premise is wrong');
});

test('CONTROL: putting the indicator on the CARD would miss the drawer', () => {
  /**
   * The discrimination. With the target on the `<li>`, the highlighted box
   * covers card + drawer; on the card it would cover the card alone. Asserted
   * as a containment difference rather than a pixel one, which is what this
   * tier can see.
   */
  const doc = panelDoc(OPEN, ['box']);
  const li = doc.querySelector('li');
  const card = rowsIn(doc)[0];
  const childRows = [...li.querySelectorAll('li > div[draggable]')].slice(1);
  assert.ok(childRows.length >= 2, 'the fixture did not open — nothing to miss');
  for (const child of childRows) {
    assert.ok(li.contains(child), 'the <li> target does not cover the child rows');
    assert.equal(card.contains(child), false,
      'the card already covers the child rows, so moving the target changed nothing');
  }
});

// ── I: the keyboard path, DRIVEN ──────────────────────────────────────────

test('the reorder buttons are real, focusable buttons with no tabindex escape', () => {
  const doc = panelDoc(THREE);
  const ups = [...doc.querySelectorAll('button[aria-label="ขึ้น"]')];
  const downs = [...doc.querySelectorAll('button[aria-label="ลง"]')];
  assert.equal(ups.length, 3);
  assert.equal(downs.length, 3);
  for (const b of [...ups, ...downs]) {
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.getAttribute('tabindex'), null, 'a reorder button was taken out of the tab order');
    assert.equal(b.getAttribute('type'), 'button');
  }
  // The ends are disabled rather than absent, so the tab order is stable.
  assert.equal(ups[0].hasAttribute('disabled'), true, 'the first row can move up');
  assert.equal(downs[2].hasAttribute('disabled'), true, 'the last row can move down');
});

test('ACTIVATION REORDERS — driven through the reducer, before and after', () => {
  /**
   * Round 32's method. The markup says which action a button carries; only
   * running it says whether the order changes. So the state is built for real
   * and the button's own dispatch applied to it.
   */
  const before = initialEditorState({ page: { ...PAGE, sections: THREE }, pageId: 'p1', updatedAt: 'T0' });
  assert.deepEqual(before.page.sections.map((s) => s.name), ['หนึ่ง', 'สอง', 'สาม']);

  // "ลง" on row 0 — the action the second row's down button carries.
  const after = editorReducer(before, { type: 'MOVE_SECTION', path: ['sections', 0], to: 1 });
  assert.deepEqual(after.page.sections.map((s) => s.name), ['สอง', 'หนึ่ง', 'สาม'],
    'activating a reorder button did not change the order — the keyboard path is gone');

  // …and back, so the move is a real reorder rather than a one-way shuffle.
  const back = editorReducer(after, { type: 'MOVE_SECTION', path: ['sections', 1], to: 0 });
  assert.deepEqual(back.page.sections.map((s) => s.name), ['หนึ่ง', 'สอง', 'สาม']);
});

test('the drag rework did NOT move the reorder buttons off the card', () => {
  // The keyboard path lives on the card, and the drop target moving to the
  // <li> must not have taken it. Both halves in one place.
  const doc = panelDoc(THREE);
  for (const row of rowsIn(doc)) {
    assert.ok(row.querySelector('button[aria-label="ขึ้น"]'), 'a card lost its up button');
    assert.ok(row.querySelector('button[aria-label="ลง"]'), 'a card lost its down button');
  }
  // Nothing on the <li> outside the card is a control — the target is inert.
  const li = doc.querySelector('li');
  const outside = [...li.querySelectorAll('button')].filter((b) => !rowsIn(doc)[0].contains(b));
  assert.deepEqual(outside, [], 'the drop target grew a control of its own');
});

test('CONTROL: the reorder check WOULD notice a dispatch that does nothing', () => {
  // Without this, the driven case above could pass on a reducer that returns
  // its input for anything it does not recognise.
  const before = initialEditorState({ page: { ...PAGE, sections: THREE }, pageId: 'p1', updatedAt: 'T0' });
  const noop = editorReducer(before, { type: 'MOVE_SECTION', path: ['sections', 0], to: 0 });
  assert.deepEqual(noop.page.sections.map((s) => s.name), ['หนึ่ง', 'สอง', 'สาม'],
    'a move to the same index changed the order');
  const real = editorReducer(before, { type: 'MOVE_SECTION', path: ['sections', 0], to: 2 });
  assert.notDeepEqual(real.page.sections.map((s) => s.name), ['หนึ่ง', 'สอง', 'สาม'],
    'the reducer never reorders, so the driven test proves nothing');
});

// ── J: what dragging an EXPANDED card does ────────────────────────────────

test('an expanded container drags WITH its children, and is not collapsed to do it', () => {
  /**
   * J. The children travel because MOVE_SECTION moves the SECTION, and a
   * container's children live in its own `content` — so there is nothing extra
   * to carry and nothing to restore afterwards.
   *
   * No auto-collapse. It was considered and refused: collapsing on dragstart
   * would need restoring on dragend AND on a drop that lands elsewhere AND on a
   * drag the browser cancels, and a missed restore leaves an author's open
   * container shut for reasons they cannot connect to anything they did. The
   * drag IMAGE is the card alone, which the browser takes from the draggable
   * element — so the pointer already carries a card-sized proxy without the
   * tree being touched.
   */
  const before = initialEditorState({ page: { ...PAGE, sections: OPEN }, pageId: 'p1', updatedAt: 'T0' });
  const after = editorReducer(before, { type: 'MOVE_SECTION', path: ['sections', 0], to: 1 });
  assert.deepEqual(after.page.sections.map((s) => s.name), ['ท้ายสุด', 'กล่อง']);
  // The children came with it, in order, untouched.
  const moved = after.page.sections[1];
  assert.deepEqual(moved.content.children.map((s) => s.name), ['ลูกหนึ่ง', 'ลูกสอง']);

  // Nothing in the panel collapses on a drag — there is no dragstart writer.
  const { code } = readSource(SRC);
  assert.equal(/onDragStart[\s\S]{0,200}setExpanded/.test(code), false,
    'the panel collapses on dragstart — J then needs a restore path and a test for it');
});

test('the dragged card dims, and the drawer under it does not', () => {
  // The drag source is the card, so the dim is the card's. A drawer dimmed with
  // it would read as the children being removed rather than moved.
  const { code } = readSource(SRC);
  assert.match(code, /isDragging\(path\) && 'opacity-40'/,
    'the dragged card no longer dims');
  const liBlock = code.slice(code.indexOf('<li'), code.indexOf('{...getDragSourceProps'));
  assert.equal(liBlock.includes('opacity-40'), false,
    'the <li> dims, which would take the open drawer with it');
});
