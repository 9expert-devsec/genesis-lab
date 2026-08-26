import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { Panel } from '@/components/pageBuilder/editor/EditorShell';
import { compile, declarationsFor } from '../twCompile.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 31 — the structure panel is three bands: a header that does not
 * scroll, a section list that does, and an add-section footer that does not.
 *
 * ── WHY THE HEADER IS TESTED THROUGH `Panel` AND NOT THROUGH TEXT ──────────
 * The heading is NOT StructurePanel's. Round 16 established that and
 * structureRowLines still pins it: the `โครงสร้างหน้า` title and the
 * `ลากเพื่อจัดลำดับ` hint are rendered by the shared `Panel` in EditorShell,
 * via the `hint` prop. So "the header does not scroll" is a CONTAINMENT claim
 * that spans two files, and containment is exactly what a source scan cannot
 * see — a heading can sit on the right line of the right file and still be
 * nested in the wrong element.
 *
 * `Panel` is therefore exported and rendered here, the way round 15 exported
 * the settings panel's tab bodies for the same reason. It is presentational —
 * it reads no context — so composing it with the real StructurePanel inside a
 * real EditorProvider produces the DOM the editor actually ships.
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and one leaked React root breaks unrelated files.
 *
 * ── THE CONTROLS MUTATE THE REAL DOM ──────────────────────────────────────
 * Every control below takes the DOM the components actually produced and moves
 * ONE element — the header into the body, a nested AddRow into the footer —
 * then asserts the same probe function that returned no faults now names that
 * one. That is the discrimination form sourceScan's header argues for: it
 * cannot itself go quiet, because it fails the moment the probe stops being
 * able to tell the two arrangements apart.
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

/**
 * The props EditorShell REALLY hands the structure panel, read off the call
 * site rather than copied here.
 *
 * Copying them would have made every DOM test below vacuous in the one
 * direction that matters: the shell could go back to an unsplit,
 * `overflow-y-auto` panel — the exact pre-round-31 arrangement — and these
 * tests would carry on rendering a split one and reporting no faults. That is
 * face one of sourceScan's defect 7, built in on purpose. Reading the call
 * site means a break there reaches the rendered DOM.
 */
function shellPanelProps() {
  const shell = readSource(SHELL).code;
  const use = shell.slice(shell.indexOf('<Panel'), shell.indexOf('<StructurePanel'));
  const className = use.match(/className="([^"]*)"/)?.[1] ?? '';
  const title = use.match(/title="([^"]*)"/)?.[1] ?? '';
  const hint = use.match(/hint="([^"]*)"/)?.[1] ?? '';
  // `split` is a bare boolean attribute at the call site.
  const split = /(^|\s)split(\s|$)/.test(use.replace(/\w+="[^"]*"/g, ' '));
  return { title, hint, split, className };
}

/**
 * The panel as EditorShell composes it, props and all.
 *
 * `expanded` opens the named containers. Round 32 made containers collapse,
 * closed by default, and the nested-AddRow claim below is about where a nested
 * insertion point LIVES — not about whether it is on screen — so the fixtures
 * that make that claim open their containers rather than assert a weaker one.
 */
function shellDoc(sections, expanded = []) {
  const markup = renderToStaticMarkup(
    createElement(EditorProvider,
      { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(Panel, shellPanelProps(),
        createElement(StructurePanel, { initialExpanded: expanded }))),
  );
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

/** The two containers in CONTAINER_PAGE below, as context keys. */
const CONTAINER_PAGE_OPEN = ['g', 't'];

/** The three bands, located the way a reader would. */
function bands(doc) {
  return {
    section: doc.querySelector('section'),
    header: doc.querySelector('h2')?.parentElement ?? null,
    scroll: doc.querySelector('[data-testid="structure-scroll"]'),
    footer: doc.querySelector('[data-testid="structure-add"]'),
  };
}

const addButtons = (root) =>
  [...root.querySelectorAll('button')].filter((b) => /เพิ่ม section/.test(b.textContent));

/**
 * Every way the three-band arrangement can be wrong, as a list of faults.
 *
 * A FUNCTION rather than a run of assertions, because the controls need to
 * feed it a deliberately-broken DOM and read back what it says. An assertion
 * run cannot be pointed at a counter-example; this can.
 */
function bandFaults(doc) {
  const faults = [];
  const { section, header, scroll, footer } = bands(doc);

  if (!section) faults.push('no panel section');
  if (!header) faults.push('no header band — nothing renders the heading');
  if (!scroll) faults.push('no scrolling band — data-testid="structure-scroll" is gone');
  if (!footer) faults.push('no footer band — data-testid="structure-add" is gone');
  if (!section || !header || !scroll || !footer) return faults;

  // The header must not be carried by the scroller.
  if (scroll.contains(header)) faults.push('the header is INSIDE the scrolling body');
  if (header.contains(scroll)) faults.push('the scroller is INSIDE the header');
  // Nor the footer.
  if (scroll.contains(footer)) faults.push('the add-section footer is INSIDE the scrolling body');
  if (footer.contains(scroll)) faults.push('the scroller is INSIDE the footer');

  // The body is the element that scrolls, and it is the only one.
  const cls = scroll.getAttribute('class') ?? '';
  if (!/\boverflow-y-auto\b/.test(cls)) faults.push('the body does not carry overflow-y-auto');
  for (const el of [section, header, footer]) {
    if (/\boverflow-[xy]?-?(auto|scroll)\b/.test(el.getAttribute('class') ?? '')) {
      faults.push('a non-scrolling band carries an overflow class');
    }
  }

  // The list is in the scroller.
  for (const row of doc.querySelectorAll('[data-testid="row-primary"]')) {
    if (!scroll.contains(row)) faults.push('a section row is outside the scrolling body');
  }

  // The OUTERMOST add is in the footer; the footer holds nothing else.
  const inFooter = addButtons(footer);
  if (inFooter.length !== 1) faults.push(`the footer holds ${inFooter.length} add buttons, not 1`);
  if (footer.querySelector('ul')) faults.push('the footer holds a section list');
  if (addButtons(scroll).some((b) => footer.contains(b))) faults.push('an add button is double-counted');

  return faults;
}

// ── 1. the three bands, and what sits outside the scroller ─────────────────

test('CONTROL: the harness reads the REAL call site, so a break there reaches this DOM', () => {
  /**
   * Otherwise every containment assertion below would keep passing on a split
   * panel this file composed for itself, while the shell had gone back to the
   * unsplit one.
   */
  const props = shellPanelProps();
  assert.equal(props.title, 'โครงสร้างหน้า');
  assert.equal(props.hint, 'ลากเพื่อจัดลำดับ');
  assert.equal(props.split, true, 'the shell no longer splits the structure panel into bands');
  assert.ok(props.className.startsWith('flex min-h-0 flex-col'),
    `the shell's structure panel is not a flex column: ${props.className}`);
  // And the reader is discriminating: it does NOT see `split` where there is none.
  assert.equal(/(^|\s)split(\s|$)/.test('title="x" className="a b" '.replace(/\w+="[^"]*"/g, ' ')), false);
  assert.equal(/(^|\s)split(\s|$)/.test('title="x" split className="a" '.replace(/\w+="[^"]*"/g, ' ')), true);
});

test('the header and the outermost add button sit OUTSIDE the scrolling body', () => {
  const doc = shellDoc([
    sec('a', 'heading', { text: 'หนึ่ง' }),
    sec('b', 'rich_text'),
    sec('c', 'cta'),
  ]);
  assert.deepEqual(bandFaults(doc), []);

  // …and, named individually, so a failure says which half broke.
  const { header, scroll, footer } = bands(doc);
  assert.equal(header.querySelector('h2')?.textContent, 'โครงสร้างหน้า',
    'the header band no longer holds the heading');
  assert.equal(header.querySelector('p')?.textContent, 'ลากเพื่อจัดลำดับ',
    'the header band no longer holds round 16’s hint — the one this panel was given');
  assert.equal(scroll.contains(header), false);
  assert.equal(scroll.contains(footer), false);
  assert.equal(addButtons(footer).length, 1);
  assert.match(scroll.getAttribute('class'), /overflow-y-auto/);
});

test('CONTROL: moving the header INSIDE the body is named by the probe', () => {
  /**
   * The exact regression this round exists to prevent, performed on the DOM
   * the components really produced: the header is moved into the scroller and
   * nothing else changes. A probe that could not see the difference would
   * return the same empty list for both.
   */
  const doc = shellDoc([sec('a', 'heading', { text: 'หนึ่ง' })]);
  assert.deepEqual(bandFaults(doc), [], 'the unbroken DOM must start clean');

  const { header, scroll } = bands(doc);
  scroll.insertBefore(header, scroll.firstChild);

  const faults = bandFaults(doc);
  assert.ok(faults.includes('the header is INSIDE the scrolling body'),
    `the probe did not name the moved header — it said: ${JSON.stringify(faults)}`);
});

test('CONTROL: moving the FOOTER inside the body is named too', () => {
  const doc = shellDoc([sec('a', 'heading', { text: 'หนึ่ง' })]);
  const { scroll, footer } = bands(doc);
  scroll.appendChild(footer);
  const faults = bandFaults(doc);
  assert.ok(faults.includes('the add-section footer is INSIDE the scrolling body'),
    `the probe did not name the moved footer — it said: ${JSON.stringify(faults)}`);
});

test('CONTROL: taking overflow-y-auto off the body is named by the probe', () => {
  const doc = shellDoc([sec('a', 'heading', { text: 'หนึ่ง' })]);
  const { scroll } = bands(doc);
  scroll.setAttribute('class', scroll.getAttribute('class').replace('overflow-y-auto', ''));
  assert.ok(bandFaults(doc).includes('the body does not carry overflow-y-auto'));
});

// ── 2. the gutter is on the SAME element as the overflow ───────────────────

/**
 * Round 13 shipped this exact pin for SectionPicker and proved the converse by
 * measurement: with the gutter left on an ancestor that no longer scrolls, the
 * picker's body went 783px scrolling against 798px not. Round 31 re-measured
 * the same counter-example on THIS panel, at 276px, in Chrome
 * (scripts/_probe-round31-bands.mjs): gutter on the scroller holds the content
 * box at 260px in both states; gutter moved out to the panel gives 260 against
 * 275 — the same 15px, one level in.
 */
const SCROLLER_CLASS = 'flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]';

test('the scrollbar gutter is on the same element as the overflow', () => {
  const code = readSource(SRC).code;

  // Exactly one scroller in the panel, so which element owns the height is
  // never a question.
  const occurrences = code.split('overflow-y-auto').length - 1;
  assert.equal(occurrences, 1,
    'overflow-y-auto no longer appears exactly once in StructurePanel — there is a second '
    + 'scroll region, and the panel would gain a scrollbar it has never had');

  const scroller = code.match(/data-testid="structure-scroll"\s+className="([^"]*)"/);
  assert.ok(scroller, 'the scrolling band is gone — its data-testid no longer exists');
  assert.equal(scroller[1], SCROLLER_CLASS,
    'the body no longer carries exactly flex-1 + the padding + the overflow + the reserved '
    + 'gutter. The gutter must sit on whichever element scrolls: on an ancestor that does '
    + 'not, it reserves space against a scrollbar that never appears there, and the content '
    + 'box moves 15px between a short page and a long one.');
});

test('the PANEL carries neither the overflow nor the gutter — only the column', () => {
  const shell = readSource(SHELL).code;
  const panelUse = shell.slice(shell.indexOf('<Panel'), shell.indexOf('<StructurePanel'));
  assert.ok(panelUse.includes('split'), 'the structure panel is no longer split into bands');
  assert.ok(panelUse.includes('className="flex min-h-0 flex-col border-r'),
    'the structure panel section is no longer a fixed-height flex column');
  assert.equal(panelUse.includes('overflow-y-auto'), false,
    'the structure panel section scrolls again. With the header inside it, the heading and '
    + 'the drag hint scroll away with the list — which is exactly what this round removed, '
    + 'and the panel would carry a second scrollbar outside the body’s.');
  assert.equal(panelUse.includes('scrollbar-gutter'), false,
    'the reserved gutter is on the panel, which does not scroll. It reserves space against '
    + 'a scrollbar that never arrives there — round 13’s counter-example exactly.');
});

test('CONTROL: the gutter probe DISCRIMINATES the two arrangements', () => {
  /**
   * The shipped arrangement and the one round 13 disproved, as literals. The
   * probe must accept one and reject the other; if it ever accepts both, the
   * assertion above has stopped testing anything in either direction.
   */
  const RIGHT = `<div data-testid="structure-scroll" className="${SCROLLER_CLASS}">`;
  const WRONG = '<div data-testid="structure-scroll" className="flex-1 overflow-y-auto p-3">';
  const probe = (s) => s.match(/data-testid="structure-scroll"\s+className="([^"]*)"/)?.[1];
  assert.equal(probe(RIGHT), SCROLLER_CLASS);
  assert.notEqual(probe(WRONG), SCROLLER_CLASS);
  assert.notEqual(RIGHT, WRONG);

  // And the panel-side probe rejects a panel that took the gutter back.
  const PANEL_WRONG = 'className="flex min-h-0 flex-col [scrollbar-gutter:stable] border-r';
  assert.equal(PANEL_WRONG.includes('scrollbar-gutter'), true);
  assert.equal('className="flex min-h-0 flex-col border-r'.includes('scrollbar-gutter'), false);
});

test('the gutter class compiles to a real rule', async () => {
  const css = await compile([SRC]);
  assert.deepEqual(declarationsFor(css, '[scrollbar-gutter:stable]'), ['scrollbar-gutter: stable'],
    'the reserved gutter emits no CSS — the class is in the source but Tailwind is not '
    + 'producing a rule for it, so nothing is reserved at all');
});

test('CONTROL: a gutter class NOT in the source compiles to nothing', async () => {
  const css = await compile([SRC]);
  assert.deepEqual(declarationsFor(css, '[scrollbar-gutter:both-edges]'), [],
    'the compile check is not discriminating — it emits rules for classes nobody wrote');
});

// ── 3. nested AddRows stay in the scrolling body, one per container slot ───

/**
 * A container's AddRow inserts into ITS slot — `basePath` is that slot's path
 * — so it only means anything while sitting under the container it belongs to.
 * Pinning one would strand an insertion point for a slot that had scrolled out
 * of sight. One single-slot container and one two-slot container, so the count
 * is a real per-slot count rather than a per-container one.
 */
const CONTAINER_PAGE = [
  sec('g', 'card_grid', { children: [sec('k', 'icon_card')] }, 'กริดการ์ด'),
  sec('t', 'two_column', { left: [sec('l', 'rich_text')], right: [sec('r', 'cta')] }, 'สองคอลัมน์'),
  sec('h', 'heading', { text: 'ท้าย' }),
];

test('every nested add-section row is inside the scrolling body, one per container slot', () => {
  const doc = shellDoc(CONTAINER_PAGE, CONTAINER_PAGE_OPEN);
  assert.deepEqual(bandFaults(doc), []);

  const { scroll, footer } = bands(doc);
  // card_grid has one slot; two_column has two. Three nested, all in the body.
  assert.equal(addButtons(scroll).length, 3,
    'the nested add rows are no longer one per container slot');
  assert.equal(addButtons(footer).length, 1,
    'the footer holds something other than the single outermost add button');
  // Four in the document altogether, and no more: three nested plus the pinned
  // one. A top-level list that ALSO rendered its own would make five.
  assert.equal(addButtons(doc.body).length, 4,
    'the top-level list renders an add row of its own again, so the same insertion '
    + 'point is offered twice — once in the list and once pinned');
});

test('CONTROL: pinning a NESTED add row into the footer is caught', () => {
  /**
   * The failure this round could plausibly ship: sweeping every AddRow into
   * the footer rather than only the outermost. The probe must see it.
   */
  const doc = shellDoc(CONTAINER_PAGE, CONTAINER_PAGE_OPEN);
  assert.deepEqual(bandFaults(doc), [], 'the unbroken DOM must start clean');

  const { scroll, footer } = bands(doc);
  footer.appendChild(addButtons(scroll)[0]);

  const faults = bandFaults(doc);
  assert.ok(faults.some((f) => /the footer holds 2 add buttons/.test(f)),
    `the probe did not notice a nested add row moved into the footer — it said: ${JSON.stringify(faults)}`);
  assert.equal(addButtons(scroll).length, 2, 'the control did not actually move anything');
});

test('only the TOP-LEVEL list is asked to omit its add row', () => {
  const code = readSource(SRC).code;
  const top = code.match(/<SectionList sections=\{sections\} basePath=\{\['sections'\]\}([^/]*)\/>/);
  assert.ok(top, 'the top-level SectionList call has moved or changed shape');
  assert.match(top[1], /addRow=\{false\}/,
    'the top-level list renders its own add row again, alongside the pinned one');

  const slot = code.match(/<SectionList sections=\{kids\}([^/]*)\/>/);
  assert.ok(slot, 'the per-slot SectionList call has moved or changed shape');
  assert.equal(/addRow/.test(slot[1]), false,
    'a nested list was told to drop its add row. Each one inserts into ITS OWN slot, so '
    + 'dropping it removes the only way to add a section to that container.');

  assert.match(code, /function SectionList\(\{ sections, basePath, addRow = true \}\)/,
    'addRow no longer defaults to TRUE, so any list that forgets to ask for one loses it');
});

// ── 4. the depth-cap refusal, and the settings panel, are both untouched ───

test('the depth-cap refusal row is unreachable from the pinned footer, and its copy is unchanged', () => {
  const code = readSource(SRC).code;
  // The refusal still lives in AddRow, on the same condition.
  assert.match(code, /const childDepth = depthOfPath\(\[\.\.\.basePath, 0\]\);/,
    'the depth question is no longer asked at the insertion point');
  assert.match(code, /if \(childDepth > MAX_SECTION_DEPTH\)/, 'the refusal condition changed');
  assert.ok(code.includes('ซ้อนได้ลึกสุด {MAX_SECTION_DEPTH} ชั้น — เพิ่มที่นี่ไม่ได้'),
    'the refusal copy changed — this round is layout only');

  // And the footer's own basePath is the top-level list, whose children are at
  // depth 0, so the footer can only ever be the button.
  const footer = code.slice(code.indexOf('data-testid="structure-add"'));
  assert.match(footer.slice(0, 400), /<AddRow basePath=\{\['sections'\]\} count=\{sections\.length\}/,
    'the pinned footer no longer inserts into the top-level list');
});

test('the SETTINGS panel is untouched — it still scrolls whole, and is not split', () => {
  /**
   * G. `Panel` is shared by both side columns, so a three-band shape imposed
   * on it would move the settings panel's scroller one level in as a side
   * effect. `split` is opt-in for exactly that reason, and this is the pin.
   */
  const shell = readSource(SHELL).code;
  const settingsUse = shell.slice(shell.indexOf('title="ตั้งค่า"'));
  const decl = settingsUse.slice(0, 300);
  assert.ok(decl.includes('className="min-h-0 overflow-y-auto border-l'),
    'the settings panel no longer scrolls as one box — this round does not touch that panel');
  assert.equal(/\bsplit\b/.test(decl), false,
    'the settings panel was split into bands too. Nothing this round measured applies to it.');

  // And the shared Panel still has an unsplit path at all.
  assert.match(shell, /\{split \? children : <div className="p-3">\{children\}<\/div>\}/,
    'Panel no longer has an unsplit branch, so the split is unconditional after all');
});

test('CONTROL: the settings probe DOES distinguish a split panel from an unsplit one', () => {
  const UNSPLIT = 'title="ตั้งค่า"\n className="min-h-0 overflow-y-auto border-l border-x"';
  const SPLIT = 'title="ตั้งค่า"\n split\n className="flex min-h-0 flex-col border-l border-x"';
  assert.equal(UNSPLIT.includes('className="min-h-0 overflow-y-auto border-l'), true);
  assert.equal(SPLIT.includes('className="min-h-0 overflow-y-auto border-l'), false);
  assert.equal(/\bsplit\b/.test(UNSPLIT), false);
  assert.equal(/\bsplit\b/.test(SPLIT), true);
});
