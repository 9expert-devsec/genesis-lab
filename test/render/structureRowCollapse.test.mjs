import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { editorReducer, initialEditorState } from '@/components/pageBuilder/editor/editorReducer';
import { CONTAINER_SLOTS } from '@/lib/pageBuilder/containerSlots';
import { readSource, walkSources } from '../sourceScan.mjs';

/**
 * ROUND 32 — containers collapse, the position numbers are gone, and the
 * collapse state stays out of the saved document.
 *
 * ── WHY THERE IS AN `initialExpanded` AND WHY IT IS NOT A CHEAT ───────────
 * Collapse is state, and the runner renders static markup — never a React root
 * (isolation:'none': one leaked root breaks unrelated files). So the OPEN tree
 * cannot be reached by clicking; it has to be seeded. `initialExpanded` is that
 * seed, it defaults to empty, and the test at the bottom asserts EditorShell
 * still passes nothing — which is what keeps "closed by default" a claim about
 * production rather than about a fixture.
 *
 * ── THE DOCUMENT-PURITY TEST IS BEHAVIOURAL, NOT A SOURCE SCAN ────────────
 * "The toggle never reaches the saved document" could be written as a grep for
 * PATCH_SECTION in the panel. That is face three of sourceScan's defect 7
 * waiting to happen — the panel could route the toggle through some other
 * action and the grep would stay green. So the reducer is run instead: every
 * action the panel can dispatch is applied to a real state and the resulting
 * `page` is compared byte-for-byte against the input.
 */

const SRC = 'src/components/pageBuilder/editor/StructurePanel.jsx';
const SHELL = 'src/components/pageBuilder/editor/EditorShell.jsx';

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
const primaries = (doc) => [...doc.querySelectorAll('[data-testid="row-primary"]')].map(text);
/** Rows, not slot wrappers — an <li> holds both as direct children. */
const rowsIn = (doc) => [...doc.querySelectorAll('li > div[draggable]')];
const toggles = (doc) => [...doc.querySelectorAll('button[aria-label]')]
  .filter((b) => /^(ยุบ|ขยาย)/.test(b.getAttribute('aria-label')));

/** One container holding two children, beside a plain sibling. */
const NESTED = [
  sec('c', 'container', {
    children: [sec('k1', 'heading', { text: 'ลูกหนึ่ง' }), sec('k2', 'heading', { text: 'ลูกสอง' })],
  }, 'กล่องของฉัน'),
  sec('s', 'rich_text', {}, 'พี่น้อง'),
];

// ── 1. collapse hides children, expand shows them ─────────────────────────

test('a container is CLOSED on first render, and its children are absent from the DOM', () => {
  const doc = panelDoc(NESTED);
  assert.deepEqual(primaries(doc), ['กล่องของฉัน', 'พี่น้อง'],
    'the children rendered — a container is not closed by default any more');

  // Absent, not merely invisible. A hidden subtree still costs layout, and the
  // whole point of the change is that a closed container costs what it looks
  // like it costs.
  assert.equal(doc.body.innerHTML.includes('ลูกหนึ่ง'), false,
    'the child row is in the markup with a class hiding it, rather than not rendered');
  assert.equal(rowsIn(doc).length, 2);

  // The count on line 2 is what makes a closed container legible.
  const containerRow = rowsIn(doc)[0];
  assert.equal(text(containerRow.querySelector('[data-testid="row-secondary"]')), 'คอนเทนเนอร์ · 2 section',
    'a closed container no longer says how many sections are inside it');
});

test('the SAME page with the container seeded open renders its children', () => {
  const doc = panelDoc(NESTED, ['c']);
  assert.deepEqual(primaries(doc), ['กล่องของฉัน', 'ลูกหนึ่ง', 'ลูกสอง', 'พี่น้อง'],
    'the children did not appear when the container was opened');
  assert.equal(rowsIn(doc).length, 4);
});

test('CONTROL: flipping the default is caught — the two states really do differ', () => {
  /**
   * The discrimination form. If the closed and open renders were ever the same
   * document, the two tests above would both pass on a panel that had stopped
   * collapsing anything at all, and the "closed by default" claim would mean
   * nothing in either direction.
   */
  const closed = primaries(panelDoc(NESTED));
  const open = primaries(panelDoc(NESTED, ['c']));
  assert.notDeepEqual(closed, open, 'seeding a container open changed nothing');
  assert.equal(closed.length, 2);
  assert.equal(open.length, 4);
  // And the seed is what makes the difference — an unrelated key does not.
  assert.deepEqual(primaries(panelDoc(NESTED, ['nope'])), closed,
    'a key that names no container opened something anyway');
});

test('only a CONTAINER carries a disclosure control, and every container type does', () => {
  const doc = panelDoc(Object.keys(CONTAINER_SLOTS).map((t, i) => sec(`c${i}`, t)));
  assert.equal(toggles(doc).length, Object.keys(CONTAINER_SLOTS).length,
    'a container type renders no disclosure control');

  // A page of leaves renders none at all.
  const leaves = panelDoc([sec('a', 'heading'), sec('b', 'rich_text'), sec('c', 'cta')]);
  assert.equal(toggles(leaves).length, 0, 'a leaf row grew a disclosure control');
});

test('the disclosure control says which way it goes, and the two labels are not prefixes', () => {
  const shut = toggles(panelDoc(NESTED))[0];
  const open = toggles(panelDoc(NESTED, ['c']))[0];
  assert.equal(shut.getAttribute('aria-label'), 'ขยายเพื่อดู section ที่ซ้อนอยู่');
  assert.equal(open.getAttribute('aria-label'), 'ยุบ section ที่ซ้อนอยู่');
  // Thai qualifies by prefix, so two labels where one starts the other would be
  // indistinguishable to any substring check a later test might use.
  assert.equal(shut.getAttribute('aria-label').startsWith(open.getAttribute('aria-label')), false);
  assert.equal(open.getAttribute('aria-label').startsWith(shut.getAttribute('aria-label')), false);
});

test('the disclosure control keeps the 24px hit area every other action has', () => {
  // Round 28's floor: p-1 either side of a 16px glyph. Round 32 must not have
  // bought its new control by going under it.
  const btn = toggles(panelDoc(NESTED))[0];
  assert.match(btn.className, /(^|\s)p-1(\s|$)/, 'the disclosure control lost its padding');
  assert.match(btn.querySelector('svg').getAttribute('class') ?? '', /(^|\s)h-4 w-4(\s|$)/,
    'the disclosure glyph is back under 16px, which puts the target at 22');
});

// ── 2. collapse state never reaches the saved document ────────────────────

test('nothing the panel dispatches can carry a collapse key into the page', () => {
  /**
   * Behavioural. Every action StructurePanel can dispatch is applied to a real
   * reducer state; the toggle is NOT among them, because it is not an action.
   * What this establishes is the negative: there is no action shaped to carry
   * one, so routing the toggle through the reducer could not be done without
   * inventing something this list would not recognise.
   */
  const start = initialEditorState({ page: { ...PAGE, sections: NESTED }, pageId: 'p1', updatedAt: 'T0' });
  const before = JSON.stringify(start.page);

  // The two actions that change nothing about the document.
  for (const action of [{ type: 'SELECT', path: ['sections', 0] }, { type: 'SELECT', path: null }]) {
    const next = editorReducer(start, action);
    assert.equal(JSON.stringify(next.page), before,
      `${action.type} rewrote the page — selection is view state too`);
    assert.equal(next.dirty, start.dirty, `${action.type} marked the document dirty`);
  }

  // A made-up collapse action is not something the reducer honours.
  const invented = editorReducer(start, { type: 'TOGGLE_EXPANDED', path: ['sections', 0] });
  assert.equal(JSON.stringify(invented.page), before,
    'the reducer grew a case that writes collapse state into the page');
  assert.equal(invented.dirty, start.dirty,
    'an unknown action marked the document dirty, so a collapse action would too');
});

test('the panel holds its collapse state in a hook and dispatches nothing for it', () => {
  const { code } = readSource(SRC);
  assert.match(code, /const \[expanded, setExpanded\] = useState\(\s*\(\) => new Set\(initialExpanded\.map/,
    'the collapse set is no longer local state seeded from the prop');
  const toggle = code.slice(code.indexOf('const toggleExpanded'), code.indexOf('useEffect('));
  assert.ok(toggle.length > 60, 'the toggle body was not located');
  assert.equal(/dispatch/.test(toggle), false,
    'the collapse toggle dispatches. That puts a view preference on the autosave path: '
    + '`page` is what gets serialised, so the document would go dirty and publish a toggle.');
  assert.equal(/PATCH_SECTION/.test(code), false,
    'the structure panel patches section content, which it has never done');
});

test('CONTROL: routing the toggle through the reducer IS visible to the probe above', () => {
  /**
   * The break this round could plausibly ship, as a literal. The probe must
   * reject it and accept what shipped; a probe that accepted both would be
   * asserting nothing.
   */
  const SHIPPED = 'const toggleExpanded = useCallback((path) => {\n  setExpanded((prev) => prev);\n}, []);';
  const ROUTED = 'const toggleExpanded = useCallback((path) => {\n  dispatch({ type: "TOGGLE_EXPANDED", path });\n}, [dispatch]);';
  assert.equal(/dispatch/.test(SHIPPED), false);
  assert.equal(/dispatch/.test(ROUTED), true);
  assert.notEqual(SHIPPED, ROUTED);
});

test('no section envelope anywhere gains a collapse field', () => {
  /**
   * The other direction the state could leak: not through an action, but by
   * someone adding `expanded` to the section schema so it round-trips. Swept
   * over the whole tree rather than one file, because a field added to the
   * schema would be written by the server, not by this panel.
   */
  const offenders = walkSources('src/lib/schemas')
    .filter((f) => /\b(expanded|collapsed)\s*:/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(offenders, [],
    'a schema declares a collapse field — view state has become document state');
});

// ── 3. the position numbers are gone ──────────────────────────────────────

test('no row renders a leading position number', () => {
  const doc = panelDoc(NESTED, ['c']);
  assert.equal(doc.querySelector('[data-testid="row-position"]'), null,
    'the row-position element is back');
  assert.equal(rowsIn(doc).length, 4, 'the fixture did not render the rows this checks');

  // Not merely the testid: no row's text begins with "N."
  for (const row of rowsIn(doc)) {
    const label = text(row.querySelector('[data-testid="row-primary"]'));
    assert.equal(/^\d+\./.test(label), false, `a row still leads with a number: "${label}"`);
  }
});

test('CONTROL: restoring a number IS caught by both halves of that probe', () => {
  const doc = panelDoc(NESTED);
  const row = rowsIn(doc)[0];
  const primary = row.querySelector('[data-testid="row-primary"]');

  // Half one: the element comes back.
  const restored = doc.createElement('span');
  restored.setAttribute('data-testid', 'row-position');
  restored.textContent = '1.';
  primary.parentElement.insertBefore(restored, primary);
  assert.notEqual(doc.querySelector('[data-testid="row-position"]'), null,
    'the testid probe cannot see a restored number');

  // Half two: the number leads the label text even WITHOUT the testid.
  assert.equal(/^\d+\./.test('1. กล่องของฉัน'), true);
  assert.equal(/^\d+\./.test('กล่องของฉัน'), false);
});

test('the source declares no position number, and the second line no longer hangs under one', () => {
  const { code } = readSource(SRC);
  const node = code.slice(code.indexOf('function SectionNode('), code.indexOf('function SectionList('));
  assert.equal(node.includes('row-position'), false, 'the row-position element is back in the source');
  assert.equal(/\{index \+ 1\}/.test(node), false, 'the row prints its render index again');
  const secondary = node.slice(node.indexOf('data-testid="row-secondary"'));
  assert.equal(/\bpl-4\b/.test(secondary.slice(0, 200)), false,
    'line 2 still carries the indent that used to hang it under the number');

  // `index` itself must STAY — it is what disables ขึ้น on the first row and
  // what ลง moves against. Retiring the number must not have taken it.
  assert.match(node, /disabled=\{index === 0\}/, 'the up button lost its first-row guard');
  assert.match(node, /disabled=\{index === siblingCount - 1\}/, 'the down button lost its last-row guard');
});

// ── 4. the drag source, and what the leading column actually holds ────────

test('the ROW is still the drag source — no handle was added and nothing moved', () => {
  /**
   * ── WHICH OF THE TWO THIS ROUND BUILT, ASSERTED RATHER THAN ASSUMED ──────
   * Round 29 named the choice: either the drag source moves to a dedicated
   * handle (its step 5), or the row keeps `draggable` and a handle is
   * decoration. This round built NEITHER — it measured that at 276px a handle
   * cannot be afforded beside the type icon while the 120px action cluster is
   * in flow (a nested row's label is 24.4px), and shipped no handle at all.
   * So the drag binding is byte-for-byte what round 25 left, and this asserts
   * exactly that rather than a handle that is not there.
   */
  const doc = panelDoc(NESTED, ['c']);
  for (const row of rowsIn(doc)) {
    assert.equal(row.getAttribute('draggable'), 'true', 'a row stopped being the drag source');
  }
  // Nothing INSIDE a row claims the drag for itself.
  const inner = [...doc.querySelectorAll('li > div[draggable] [draggable]')];
  assert.deepEqual(inner, [], 'something inside the row is draggable — the drag source has moved');

  /**
   * ── AMENDED, ROUND 40, AND THE GUARANTEE IS UNCHANGED ────────────────────
   * This read `{...getRowProps(path)}`. Round 40 split that hook in two: the
   * DRAG SOURCE stays on the card (this assertion, renamed) and the DROP TARGET
   * moved to the `<li>`, because an expanded container's drawer is a sibling of
   * the card and an indicator on the card alone points at a boundary the drop
   * would not land on.
   *
   * What this test claims is what it always claimed: the row — not a handle —
   * is what the author grabs, and the hook still knows nothing about a handle.
   * Round 40 re-measured and reached round 32's conclusion again: at 276px a
   * handle plus a tile plus the 96px cluster leaves a nested label at zero.
   * (Round 32's "24.4px" above is stale; the measured figure is 14.38px, and
   * the correction is in round 40's report rather than edited into this note.)
   */
  const { code } = readSource(SRC);
  assert.match(code, /\{\.\.\.getDragSourceProps\(path\)\}/,
    'the drag SOURCE props are no longer spread onto the row');
  assert.equal(readSource('src/components/pageBuilder/editor/useTreeDrag.js').code.includes('handle'), false,
    'useTreeDrag learned about a handle — that is round 29 step 5, and round 40 measured it out again');
});

test('the leading column is one box wide whether it holds an icon or a disclosure', () => {
  /**
   * The alignment claim the swap rests on: a leaf's type icon and a
   * container's disclosure control occupy the same 24px column, so the labels
   * down the list all start at one offset.
   */
  const doc = panelDoc([sec('g', 'card_grid', { children: [sec('k', 'heading')] }, 'กริด'), sec('h', 'heading', {}, 'ใบไม้')]);
  const [container, leaf] = rowsIn(doc);

  const disclosure = container.firstElementChild;
  assert.equal(disclosure.tagName.toLowerCase(), 'button');
  assert.match(disclosure.getAttribute('aria-label'), /^ขยาย/);

  const iconBox = leaf.firstElementChild;
  assert.equal(iconBox.tagName.toLowerCase(), 'span');
  assert.match(iconBox.getAttribute('class'), /(^|\s)h-6 w-6(\s|$)/,
    'the leaf icon is no longer boxed to the disclosure control’s size, so the two columns misalign');
  assert.notEqual(iconBox.querySelector('svg'), null, 'the leaf lost round 17’s type icon');
});

// ── 5. production still starts closed ─────────────────────────────────────

test('EditorShell passes no seed, so every container starts closed in the app', () => {
  const shell = readSource(SHELL).code;
  const use = shell.slice(shell.indexOf('<StructurePanel'), shell.indexOf('<StructurePanel') + 60);
  assert.match(use, /<StructurePanel \/>/,
    'EditorShell now seeds the panel open. initialExpanded is a test and probe seam; '
    + 'production passing one would make "closed by default" false while every test stayed green.');
  assert.equal(shell.includes('initialExpanded'), false,
    'the shell mentions initialExpanded at all');
});

test('CONTROL: that probe DOES distinguish a seeded call from a bare one', () => {
  const BARE = '<StructurePanel />';
  const SEEDED = '<StructurePanel initialExpanded={keys} />';
  assert.equal(/<StructurePanel \/>/.test(BARE), true);
  assert.equal(/<StructurePanel \/>/.test(SEEDED), false);
  assert.equal(SEEDED.includes('initialExpanded'), true);
});

// ── 6. the open state follows the SECTION, not the position ───────────────

test('an open container stays open when a reorder moves it', () => {
  /**
   * ── THE DEFECT THIS PINS WAS SHIPPED AND CAUGHT BY MEASUREMENT ───────────
   * Round 32's first cut keyed the collapse set by PATH. The interaction probe
   * (scripts/_probe-round32-interaction.mjs) then clicked ขึ้น on the row below
   * an open container and the container shut itself: `sections.1` had stopped
   * meaning the node the author opened and started meaning whatever took its
   * place. Every action this panel offers moves positions — ADD_SECTION and
   * REMOVE_SECTION shift every later sibling, MOVE_SECTION rewrites the array
   * — so a path key is wrong under all of them, not only under a drag.
   *
   * Asserted with TWO containers so the failure is legible: under a path key
   * the wrong one opens rather than nothing opening, and a test that only
   * asked "is something open" would pass on exactly that.
   */
  const A = sec('boxA', 'container', { children: [sec('ka', 'heading', { text: 'ในเอ' })] }, 'กล่องเอ');
  const B = sec('boxB', 'container', { children: [sec('kb', 'heading', { text: 'ในบี' })] }, 'กล่องบี');

  const before = panelDoc([A, B], ['boxA']);
  assert.deepEqual(primaries(before), ['กล่องเอ', 'ในเอ', 'กล่องบี'],
    'the seeded container did not open, or the other one opened too');

  // The same two sections in the other order — what MOVE_SECTION produces.
  const after = panelDoc([B, A], ['boxA']);
  assert.deepEqual(primaries(after), ['กล่องบี', 'กล่องเอ', 'ในเอ'],
    'the open state did not follow the section through the move. A path key opens '
    + 'whatever now sits at the old index, which is the other container.');
});

test('CONTROL: a POSITION key would have opened the other container', () => {
  /**
   * The discrimination the test above rests on: the two containers really do
   * sit at swapped indices, and the two orders really are distinguishable — so
   * "the right one is open" is a claim a position key could fail.
   */
  const A = sec('boxA', 'container', { children: [sec('ka', 'heading', { text: 'ในเอ' })] }, 'กล่องเอ');
  const B = sec('boxB', 'container', { children: [sec('kb', 'heading', { text: 'ในบี' })] }, 'กล่องบี');

  // Seeded by the OTHER id, the other container opens — so the seed is what
  // decides, and it is not simply opening the first container every time.
  assert.deepEqual(primaries(panelDoc([B, A], ['boxB'])), ['กล่องบี', 'ในบี', 'กล่องเอ']);
  assert.deepEqual(primaries(panelDoc([B, A], ['boxA'])), ['กล่องบี', 'กล่องเอ', 'ในเอ']);
  // And an id that names neither opens neither.
  assert.deepEqual(primaries(panelDoc([B, A], ['boxC'])), ['กล่องบี', 'กล่องเอ']);

  const { code } = readSource(SRC);
  assert.match(code, /return section\?\.id \? `id:\$\{section\.id\}` : `path:\$\{pathToKey\(path\)\}`/,
    'the key stopped being the section id with a path fallback');
});
