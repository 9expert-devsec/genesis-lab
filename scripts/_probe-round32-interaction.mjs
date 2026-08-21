/**
 * ROUND 32 ITEMS L and M — collapse, selection and reorder, EXERCISED rather
 * than inspected.
 *
 * The render tests build static markup and never a React root, because the
 * runner is isolation:'none' and one leaked root breaks unrelated files. That
 * is the right rule for the suite and the wrong tool for these three
 * questions, all of which are about what happens AFTER a click:
 *
 *   L  clicking a child row selects it, with the container open and shut; and
 *      selecting something inside a CLOSED container reveals it rather than
 *      leaving the settings panel editing a row nobody can see.
 *   M  the up/down buttons still reorder, at the top level and inside a
 *      container, and they are still real <button>s in the tab order — which
 *      is the whole of round 25's keyboard path, because Enter and Space on a
 *      focused button are the platform's own activation and not something this
 *      code implements.
 *
 * So this mounts the real panel into JSDOM with react-dom/client and clicks.
 * A probe rather than a test precisely because it owns a root.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round32-interaction.mjs
 */
import { JSDOM } from 'jsdom';
import { createElement, StrictMode } from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true, url: 'http://localhost/',
});
global.window = dom.window;
global.document = dom.window.document;
// node 22 exposes a getter-only global.navigator; defineProperty is the only
// way to point it at the JSDOM one, which react-dom reads at module scope.
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.Node = dom.window.Node;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { EditorProvider, useEditor } = await import('@/components/pageBuilder/editor/EditorProvider');
const { StructurePanel } = await import('@/components/pageBuilder/editor/StructurePanel');

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

/**
 * A container holding three children, between two plain siblings — so a
 * reorder has somewhere to go at BOTH levels and the container is neither
 * first nor last.
 */
const sections = () => [
  sec('a', 'heading', { text: 'ก' }, 'บนสุด'),
  sec('box', 'container', {
    children: [
      sec('k1', 'heading', { text: 'ล1' }, 'ลูกหนึ่ง'),
      sec('k2', 'heading', { text: 'ล2' }, 'ลูกสอง'),
      sec('k3', 'heading', { text: 'ล3' }, 'ลูกสาม'),
    ],
  }, 'กล่อง'),
  sec('z', 'heading', { text: 'ท' }, 'ล่างสุด'),
];

/** A spy that publishes the live editor state and dispatch to the probe. */
let live = null;
function Spy() {
  const ctx = useEditor();
  live = ctx;
  return null;
}

const root = createRoot(document.getElementById('root'));
await act(async () => {
  root.render(createElement(StrictMode, null,
    createElement(EditorProvider, { page: { ...PAGE, sections: sections() }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(Spy, null),
      createElement(StructurePanel, null))));
});

const q = (sel) => [...document.querySelectorAll(sel)];
const rows = () => q('li > div[draggable]');
const labels = () => q('[data-testid="row-primary"]').map((el) => el.textContent.trim());
const byLabel = (name) => q('button[aria-label]').filter((b) => b.getAttribute('aria-label') === name);
const rowFor = (name) => rows().find((r) => r.querySelector('[data-testid="row-primary"]')?.textContent.trim() === name);
const click = async (el) => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); };
const names = () => (live.page.sections).map((s) => s.name);
// By ID, not by index: M1 reorders the top level, so the container does not
// stay at index 1 and an index here would read the wrong node.
const boxOf = () => live.page.sections.find((s) => s.id === 'box');
const childNames = () => boxOf().content.children.map((s) => s.name);
const selectedName = () => (live.selected ? live.selected.name : null);

const out = {};
out['0. first paint'] = { rows: labels(), containerClosed: !labels().includes('ลูกหนึ่ง') };

// ── L1: with the container SHUT, clicking a top-level row selects it ──────
await click(rowFor('บนสุด').querySelector('button:not([aria-label])'));
out['L1. click a top-level row while shut'] = {
  selected: selectedName(),
  rowsAfter: labels(),
  ariaCurrent: rowFor('บนสุด').querySelector('[aria-current]') !== null,
};

// ── L2: open the container, then click a CHILD ───────────────────────────
await click(byLabel('ขยายเพื่อดู section ที่ซ้อนอยู่')[0]);
out['L2a. after opening the container'] = { rows: labels() };
await click(rowFor('ลูกสอง').querySelector('button:not([aria-label])'));
out['L2b. click a child while open'] = {
  selected: selectedName(),
  rowsAfter: labels(),
  stillOpen: labels().includes('ลูกสาม'),
};

// ── L3: the trap — select something inside a CLOSED container ────────────
// Shut it first, with the child still selected, then select a DIFFERENT child
// the way the CANVAS would: a bare SELECT dispatch with a nested path.
await click(byLabel('ยุบ section ที่ซ้อนอยู่')[0]);
out['L3a. shut again'] = { rows: labels(), selectionStillSet: selectedName() };

await act(async () => { live.dispatch({ type: 'SELECT', path: ['sections', 1, 'content', 'children', 2] }); });
out['L3b. canvas selects a child of the CLOSED container'] = {
  selected: selectedName(),
  rows: labels(),
  revealed: labels().includes('ลูกสาม'),
};

// ── L4: ADD_SECTION selects into the container too ───────────────────────
await click(byLabel('ยุบ section ที่ซ้อนอยู่')[0]);
out['L4a. shut once more'] = { rows: labels() };
await act(async () => {
  live.dispatch({
    type: 'ADD_SECTION',
    parentPath: ['sections', 1, 'content', 'children'],
    index: 1,
    section: sec('new', 'cta', {}, 'ที่เพิ่งเพิ่ม'),
  });
});
out['L4b. a section added into the closed container'] = {
  selected: selectedName(),
  rows: labels(),
  revealed: labels().includes('ที่เพิ่งเพิ่ม'),
};

// ── M1: reorder at the TOP LEVEL with the up/down buttons ────────────────
out['M1a. top-level order before'] = names();
const zRow = rowFor('ล่างสุด');
await click([...zRow.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === 'ขึ้น'));
out['M1b. after ขึ้น on the last row'] = { order: names() };

// ── M2: reorder INSIDE the container ─────────────────────────────────────
out['M2a. child order before'] = childNames();
const kRow = rowFor('ลูกหนึ่ง');
await click([...kRow.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label') === 'ลง'));
out['M2b. after ลง on the first child'] = { order: childNames() };

// ── M3: the keyboard path — the controls are real buttons, focusable, and
//        in the tab order. Enter/Space activation is the platform's, which is
//        exactly why round 25 chose buttons over a drag-only affordance.
// NOT [0]: the first row's ขึ้น is correctly disabled, and a disabled button
// cannot take focus — grabbing it would measure the probe, not the panel.
const upBtn = byLabel('ขึ้น').find((b) => !b.disabled);
upBtn.focus();
const focusedIsButton = document.activeElement === upBtn;
const orderBeforeKey = names();
// What the browser does when Enter is pressed on a focused button: it
// dispatches a click. Asserted by dispatching that click ON THE FOCUSED
// ELEMENT rather than on a reference held from before, so this is the same
// path a keyboard user takes.
await act(async () => { document.activeElement.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
out['M3. keyboard path'] = {
  everyControlIsAButton: q('li > div[draggable] [aria-label]').every((el) => el.tagName === 'BUTTON'),
  noneRemovedFromTabOrder: q('li > div[draggable] button[aria-label]').every((b) => b.getAttribute('tabindex') !== '-1'),
  focusLanded: focusedIsButton,
  activeElementLabel: upBtn.getAttribute('aria-label'),
  orderBefore: orderBeforeKey,
  orderAfterActivatingFocused: names(),
  reordered: JSON.stringify(orderBeforeKey) !== JSON.stringify(names()),
  disclosureIsAlsoAButton: byLabel('ขยายเพื่อดู section ที่ซ้อนอยู่').concat(byLabel('ยุบ section ที่ซ้อนอยู่'))
    .every((b) => b.tagName === 'BUTTON'),
};

// ── M4: the drag binding is unchanged — the row is still the source ──────
out['M4. drag binding'] = {
  everyRowDraggable: rows().every((r) => r.getAttribute('draggable') === 'true'),
  rowCount: rows().length,
  nothingInsideIsDraggable: q('li > div[draggable] [draggable]').length,
};

console.log(JSON.stringify(out, null, 2));

await act(async () => { root.unmount(); });
