import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { moveInArray } from '@/components/pageBuilder/editor/pagePath';
import { readSource } from '../sourceScan.mjs';

/**
 * The two-line structure row: what each line says, the position number, and the
 * container child count.
 *
 * ── WHY THE PANEL RENDERS HERE AND SettingsPanel COULD NOT ─────────────────
 * StructurePanel reads only `page` and `dispatch` from the editor context — no
 * selection — so the real panel renders whole inside a provider. (Round 15's
 * settings panel needed a selection, which only a dispatch can set, which is
 * why its tab BODIES had to be exported instead.)
 *
 * Static markup into JSDOM, never createRoot: the runner is isolation:'none'
 * and one leaked React root breaks unrelated files. So a reorder is exercised
 * by rendering the ALREADY-MOVED tree — the numbering is derived from the
 * render index, so "correct after a move" is the same claim as "correct for the
 * order handed in", and moveInArray is what the move button actually calls.
 *
 * ── WHY EXACT STRINGS ──────────────────────────────────────────────────────
 * Thai qualifies by prefix and these strings overlap by construction: the type
 * label 'คอนเทนเนอร์' and the summary of a heading whose text happens to start
 * the same way are indistinguishable to a substring check, and 'ซ้าย 4 · ขวา 2'
 * contains '4' and '2' which any count assertion would match. Every assertion
 * below reads one element's exact textContent.
 */

const SRC = 'src/components/pageBuilder/editor/StructurePanel.jsx';

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };

const sec = (id, type, content = {}) => ({
  id, type, content, settings: {}, style: {}, layout: {}, advanced: {}, enabled: true, sortOrder: 0,
});

function panelDoc(sections) {
  const markup = renderToStaticMarkup(
    createElement(EditorProvider, { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
      createElement(StructurePanel, {})),
  );
  return new JSDOM(`<!doctype html><body>${markup}</body>`).window.document;
}

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const positions = (doc) => [...doc.querySelectorAll('[data-testid="row-position"]')].map(text);
const primaries = (doc) => [...doc.querySelectorAll('[data-testid="row-primary"]')].map(text);
const secondaries = (doc) => [...doc.querySelectorAll('[data-testid="row-secondary"]')].map(text);

// ── 0. the harness reaches the real rows ───────────────────────────────────

test('CONTROL: the panel really renders one row per section', () => {
  const doc = panelDoc([sec('a', 'heading', { text: 'หนึ่ง' }), sec('b', 'rich_text')]);
  assert.equal(primaries(doc).length, 2);
  assert.deepEqual(positions(doc), ['1.', '2.']);
});

// ── 1. line 1 and line 2, per the three cases the brief names ──────────────

test('a type WITH a summary leads with the summary and names its type on line 2', () => {
  const doc = panelDoc([sec('a', 'heading', { text: 'ยินดีต้อนรับ' })]);
  assert.deepEqual(primaries(doc), ['ยินดีต้อนรับ']);
  assert.deepEqual(secondaries(doc), ['หัวข้อ']);
});

test('a type with NO summary leads with its type label and renders no second line', () => {
  /**
   * The rule that keeps a row from printing its type twice: line 2 carries the
   * type label only when line 1 did not already say it. rich_text has no
   * summary by design (its content is a Tiptap doc), so there is nothing left
   * for line 2 and it is absent entirely rather than blank.
   */
  const doc = panelDoc([sec('a', 'rich_text')]);
  assert.deepEqual(primaries(doc), ['ข้อความ']);
  assert.deepEqual(secondaries(doc), []);
});

test('a summary-capable type with an EMPTY field falls back to the type label, still once', () => {
  // heading DOES produce summaries, but not from empty text — the fallback must
  // not then print 'หัวข้อ' on both lines.
  const doc = panelDoc([sec('a', 'heading', { text: '' })]);
  assert.deepEqual(primaries(doc), ['หัวข้อ']);
  assert.deepEqual(secondaries(doc), []);
});

test('a container leads with its type label and carries its child count on line 2', () => {
  const doc = panelDoc([sec('a', 'container', { children: [sec('c1', 'heading'), sec('c2', 'cta')] })]);
  assert.deepEqual(primaries(doc)[0], 'คอนเทนเนอร์');
  assert.equal(secondaries(doc)[0], '2 section');
});

test('CONTROL: no row prints its type label on both lines, for any type', () => {
  /**
   * The duplication this design exists to avoid, checked across a spread of
   * types rather than at the one that motivated it.
   */
  const doc = panelDoc([
    sec('a', 'heading', { text: 'มีสรุป' }),
    sec('b', 'heading', { text: '' }),
    sec('c', 'rich_text'),
    sec('d', 'container', { children: [] }),
    sec('e', 'cta', { heading: 'สมัคร' }),
    sec('f', 'image', { alt: 'โลโก้' }),
  ]);
  const p = primaries(doc);
  const rows = [...doc.querySelectorAll('[data-testid="row-primary"]')];
  rows.forEach((el, i) => {
    const second = el.closest('button')?.querySelector('[data-testid="row-secondary"]');
    if (second) {
      assert.notEqual(text(second), p[i], `row ${i + 1} says "${p[i]}" on both lines`);
    }
  });
  // …and the spread really did produce both shapes, so the loop is not vacuous.
  assert.ok(secondaries(doc).length > 0, 'no row produced a second line at all');
  assert.ok(secondaries(doc).length < p.length, 'every row produced a second line — no fallback case ran');
});

// ── 2. the child count: containers only, per slot ──────────────────────────

test('a multi-slot container names both slots with their OWN counts, never the sum', () => {
  /**
   * The fixture is 4 left / 2 right on purpose: a summed "6" and a halved "3"
   * are both distinguishable from the honest answer, which they would not be
   * with an even split.
   */
  const doc = panelDoc([sec('a', 'two_column', {
    left: [sec('l1', 'heading'), sec('l2', 'heading'), sec('l3', 'heading'), sec('l4', 'heading')],
    right: [sec('r1', 'cta'), sec('r2', 'cta')],
  })]);
  assert.equal(secondaries(doc)[0], 'ซ้าย 4 · ขวา 2');
  assert.equal(secondaries(doc)[0].includes('6'), false, 'the row printed the SUM of the two slots');
});

test('a NON-container shows no count at all — never "0"', () => {
  const doc = panelDoc([
    sec('a', 'heading', { text: 'x' }), sec('b', 'rich_text'), sec('c', 'cta', { heading: 'y' }),
  ]);
  for (const s of secondaries(doc)) {
    assert.equal(/\bsection\b/.test(s), false, `a non-container row printed a child count: "${s}"`);
    assert.equal(/\b0\b/.test(s), false, `a non-container row printed a zero: "${s}"`);
  }
});

test('an EMPTY container does show zero — it has slots, they are just empty', () => {
  // The distinction the null in sectionChildCounts exists for.
  const doc = panelDoc([sec('a', 'container', { children: [] })]);
  assert.equal(secondaries(doc)[0], '0 section');
});

// ── 3. position numbers, and what they are after a move ────────────────────

test('positions number each list from 1, and follow the array after a reorder', () => {
  /**
   * Asserted as the FULL numbering plus the full primary column, not just the
   * moved row: a numbering that stayed attached to the item rather than the
   * position would leave the moved row right and its neighbours wrong.
   */
  const before = [
    sec('a', 'heading', { text: 'หนึ่ง' }),
    sec('b', 'heading', { text: 'สอง' }),
    sec('c', 'heading', { text: 'สาม' }),
  ];
  const first = panelDoc(before);
  assert.deepEqual(positions(first), ['1.', '2.', '3.']);
  assert.deepEqual(primaries(first), ['หนึ่ง', 'สอง', 'สาม']);

  // The move the ขึ้น/ลง buttons and the drag both perform.
  const after = panelDoc(moveInArray(before, 0, 2));
  assert.deepEqual(positions(after), ['1.', '2.', '3.'], 'the numbering stopped counting from 1');
  assert.deepEqual(primaries(after), ['สอง', 'สาม', 'หนึ่ง'], 'the rows are not in the moved order');
});

test('a nested list restarts its own numbering at 1', () => {
  const doc = panelDoc([
    sec('a', 'container', { children: [sec('c1', 'heading', { text: 'ลูกหนึ่ง' }), sec('c2', 'heading', { text: 'ลูกสอง' })] }),
    sec('b', 'rich_text'),
  ]);
  // Two top-level rows and two children: 1,2 for the children inside the
  // container, and 1,2 for the top level — the container is row 1.
  assert.deepEqual(positions(doc), ['1.', '1.', '2.', '2.']);
  assert.deepEqual(primaries(doc), ['คอนเทนเนอร์', 'ลูกหนึ่ง', 'ลูกสอง', 'ข้อความ']);
});

test('the position is DERIVED from the index, never stored on the section', () => {
  // sortOrder exists on the envelope and is not what the row prints — a row
  // reading it would go stale the moment a move rewrote the array without it.
  const code = readSource(SRC).code;
  const node = code.slice(code.indexOf('function SectionNode('), code.indexOf('function SectionList('));
  assert.ok(node.length > 500, 'the SectionNode body was not located');
  assert.match(node, /\{index \+ 1\}\./, 'the row no longer numbers from its render index');
  assert.equal(/sortOrder/.test(node), false,
    'the row reads sortOrder. That is a stored field and MOVE_SECTION reorders the array '
    + 'without rewriting it, so the printed number would drift from the real order.');
});

// ── 4. the drag hint sits with the heading that already exists ─────────────

test('the reorder hint renders next to the structure panel heading, not as a second header', () => {
  /**
   * StructurePanel renders no heading of its own — the heading is EditorShell's
   * Panel. So the hint is passed to that, and this asserts it landed in the
   * same header block rather than becoming a competing line inside the body.
   */
  const shell = readSource('src/components/pageBuilder/editor/EditorShell.jsx').code;
  assert.match(shell, /hint="ลากเพื่อจัดลำดับ"/, 'the reorder hint is gone');
  const panelUse = shell.slice(shell.indexOf('<Panel'), shell.indexOf('<StructurePanel'));
  assert.ok(panelUse.includes('title="โครงสร้างหน้า"'), 'the structure panel heading changed');
  assert.ok(panelUse.includes('hint="ลากเพื่อจัดลำดับ"'), 'the hint is not on the structure panel');
  // …and NOT on the settings panel, which is not draggable.
  const settingsUse = shell.slice(shell.indexOf('title="ตั้งค่า"'));
  assert.equal(settingsUse.slice(0, 200).includes('hint='), false,
    'the settings panel gained a drag hint — nothing there reorders');
  // The structure panel body still renders no heading of its own.
  const panel = readSource(SRC).code;
  assert.equal(/<h[1-6]/.test(panel), false, 'StructurePanel now renders its own heading too');
});

// ── 5. what commit 1 must NOT have changed ─────────────────────────────────

test('the row’s actions and key are untouched', () => {
  const code = readSource(SRC).code;
  const node = code.slice(code.indexOf('function SectionNode('), code.indexOf('function SectionList('));
  for (const action of ['MOVE_SECTION', 'TOGGLE_SECTION', 'DUPLICATE_SECTION', 'SELECT']) {
    assert.ok(node.includes(action), `${action} is no longer dispatched from the row`);
  }
  assert.ok(node.includes('requestDelete(path, section)'),
    'the delete button no longer goes through the confirm path');
  assert.equal(node.includes('REMOVE_SECTION'), false,
    'the row dispatches REMOVE_SECTION directly again — the confirm has been bypassed');
  assert.match(code, /key=\{section\?\.id \?\?/, 'the row key changed');
});

test('CONTROL: those probes DO fire on the shapes they forbid', () => {
  assert.equal(/sortOrder/.test('const n = section.sortOrder;'), true);
  assert.equal(/<h[1-6]/.test('<h2 className="x">t</h2>'), true);
  assert.equal(/<h[1-6]/.test('<span>t</span>'), false);
});
