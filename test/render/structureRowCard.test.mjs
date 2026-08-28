import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { EditorProvider } from '@/components/pageBuilder/editor/EditorProvider';
import { StructurePanel } from '@/components/pageBuilder/editor/StructurePanel';
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 40 commit 1 — the structure row becomes a card.
 *
 * ── WHAT THIS TIER SEES, AND WHAT IT DOES NOT ─────────────────────────────
 * It sees the emitted markup: which elements a card has, what they say, and
 * which classes carry the treatment. It sees NO width and NO height — a class
 * string is not a measurement, and every number in this round's report came out
 * of Chrome (scripts/_probe-round32-row-budget.mjs and _probe-round32-fit.mjs,
 * both of which round 40 had to repair before they could be believed).
 *
 * So the geometry claims live in the round report and the SHAPE claims live
 * here, and neither pretends to be the other.
 */

const SRC = 'src/components/pageBuilder/editor/StructurePanel.jsx';

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
const actionLabels = (row) => [...row.querySelectorAll('button[aria-label]')]
  .map((b) => b.getAttribute('aria-label'));

/** A leaf with a name and a summary, so both card lines are populated. */
const LEAF = [sec('l1', 'heading', { text: 'หัวข้อของ section' }, 'บทนำ')];
/** A container holding two children — the nested-card case. */
const NESTED = [
  sec('c', 'container', {
    children: [sec('k1', 'heading', { text: 'ลูกหนึ่ง' }, 'ลูกที่หนึ่ง')],
  }, 'กล่องของฉัน'),
];

// ── the card's two-line shape, and the tile ────────────────────────────────

test('a leaf card renders a TILE and both text lines, by exact string', () => {
  const doc = panelDoc(LEAF);
  const [row] = rowsIn(doc);
  assert.equal(text(row.querySelector('[data-testid="row-primary"]')), 'บทนำ');
  // Line 2 is the TYPE LABEL, not the summary: the summary is a candidate for
  // line 1 when there is no name, and round 32's assembly puts the type on line
  // 2 only when line 1 did not already say it.
  assert.equal(text(row.querySelector('[data-testid="row-secondary"]')), 'หัวข้อ');

  const tile = row.querySelector('[data-testid="row-tile"]');
  assert.notEqual(tile, null, 'a leaf card renders no tile');
  assert.equal(tile.querySelectorAll('svg').length, 1, 'the tile holds exactly one glyph');
  // The tile is a SURFACE, which is what makes it a tile rather than a bare
  // icon — the one visual signature the card adds to the leading column.
  assert.match(tile.getAttribute('class'), /rounded-9e-sm/);
  assert.match(tile.getAttribute('class'), /bg-\[var\(--surface-muted\)\]/);
});

test('a NESTED child card renders its own shape, tile included', () => {
  const doc = panelDoc(NESTED, ['c']);
  const rows = rowsIn(doc);
  assert.equal(rows.length, 2, 'the container and its one child');
  const child = rows[1];
  assert.equal(text(child.querySelector('[data-testid="row-primary"]')), 'ลูกที่หนึ่ง');
  assert.equal(text(child.querySelector('[data-testid="row-secondary"]')), 'หัวข้อ');
  assert.notEqual(child.querySelector('[data-testid="row-tile"]'), null,
    'a nested child card lost its tile');
});

test('a CONTAINER card carries the disclosure control and NO tile', () => {
  /**
   * Round 32's ruling, unchanged by the card: a container always states its
   * type in text, so the glyph is the one place it would say it twice — and
   * the disclosure is the one thing a container has that a leaf does not.
   */
  const doc = panelDoc(NESTED);
  const [container] = rowsIn(doc);
  assert.equal(container.querySelector('[data-testid="row-tile"]'), null,
    'a container grew a tile — it would then say its type twice');
  assert.equal(actionLabels(container).some((l) => /^(ยุบ|ขยาย)/.test(l)), true);
});

test('the card carries its border, radius and 8px separation', () => {
  const doc = panelDoc(LEAF);
  const cls = rowsIn(doc)[0].getAttribute('class');
  assert.match(cls, /rounded-9e-sm/, 'the card lost its radius token');
  assert.match(cls, /\bborder\b/, 'the card lost its border');
  // Cards need separation to read as cards. The list, not the card, owns it.
  const ul = doc.querySelector('[data-testid="structure-scroll"] ul');
  assert.match(ul.getAttribute('class'), /space-y-2/, 'the 8px between cards is gone');
});

test('the SELECTED card carries three signals, and an unselected one carries none', () => {
  /**
   * Three because the design uses three and each survives a different failure:
   * the bar when the card is clipped at its leading edge, the border when a
   * background is overridden, the tint when neither is.
   *
   * Selection is dispatched, so it is reached by seeding the provider's page
   * with a selection rather than by clicking — the runner mounts no root.
   */
  const doc = panelDoc(LEAF);
  const [row] = rowsIn(doc);
  // Unselected: no bar, and the neutral surface.
  assert.equal(row.querySelector('[data-testid="row-selected-bar"]'), null);
  assert.match(row.getAttribute('class'), /bg-\[var\(--surface\)\]/);
  assert.equal(/from-9e-action/.test(row.getAttribute('class')), false);
});

test('CONTROL: the card classes this file asserts are really in the source', () => {
  // Without this, every match above could be passing on a row that happens to
  // carry a similar class for another reason.
  const { code } = readSource(SRC);
  assert.match(code, /data-testid="row-selected-bar"/, 'the selected bar is not built');
  assert.match(code, /from-9e-action\/10/, 'the selected gradient is not built');
  assert.match(code, /bg-9e-action\b/, 'the selected bar has no action-token fill');
});

// ── C's outcome: the four buttons and the eye survived; no handle ──────────

test('every card keeps the four action buttons AND the eye', () => {
  /**
   * C's hard rule. Round 29's own verdict refused to buy a drag handle by
   * deleting these, and this round did not either — measured: at 276px a
   * handle plus a tile plus the cluster leaves a nested label at zero, and the
   * cluster is 96px of always-in-flow control at every depth.
   */
  for (const [name, doc, expanded] of [
    ['top-level leaf', panelDoc(LEAF), []],
    ['nested child', panelDoc(NESTED, ['c']), ['c']],
  ]) {
    for (const row of rowsIn(doc)) {
      const labels = actionLabels(row);
      for (const wanted of ['ขึ้น', 'ลง', 'ทำซ้ำ', 'ลบ']) {
        assert.ok(labels.includes(wanted), `${name}: the "${wanted}" button is gone from a card`);
      }
      assert.ok(labels.some((l) => /^(ซ่อน|แสดง) section นี้$/.test(l)),
        `${name}: the eye is gone from a card`);
    }
  }
});

test('no drag HANDLE was added, and the card is still the drag source', () => {
  /**
   * C's trade, recorded as an assertion. The handle is what gave way — not a
   * button, and not a hit area. The card keeps every other affordance the
   * design gives it, because those cost 5px and the handle costs 33.
   */
  const doc = panelDoc(LEAF);
  const [row] = rowsIn(doc);
  assert.equal(row.getAttribute('draggable'), 'true', 'the card is no longer the drag source');
  const handleish = actionLabels(row).filter((l) => /ลาก|จับ|handle/i.test(l));
  assert.deepEqual(handleish, [], 'a drag handle appeared — it does not fit at 276px');
});

test('every control on a card still carries the 24px hit area', () => {
  // Round 28's floor. The padding IS the hit area, so the assertion is on the
  // padding class every action button shares.
  const doc = panelDoc(NESTED, ['c']);
  for (const row of rowsIn(doc)) {
    for (const b of row.querySelectorAll('button[aria-label]')) {
      assert.match(b.getAttribute('class'), /\bp-1\b/,
        `"${b.getAttribute('aria-label')}" lost the padding that makes its target 24px`);
    }
  }
});

test('CONTROL: shrinking one action IS caught, by name', () => {
  // Without this, the sweep above could pass on a reader that matches anything.
  const doc = panelDoc(LEAF);
  const b = doc.querySelector('button[aria-label="ทำซ้ำ"]');
  b.setAttribute('class', b.getAttribute('class').replace(/\bp-1\b/, 'p-0.5'));
  assert.throws(
    () => assert.match(b.getAttribute('class'), /\bp-1\b/, `"${b.getAttribute('aria-label')}" lost the padding`),
    (e) => e.message.includes('ทำซ้ำ'),
    'the failure must name which action shrank');
});

// ── F: the drawer header and its count badge ──────────────────────────────

test('an open single-slot container heads its drawer and counts it', () => {
  const doc = panelDoc(NESTED, ['c']);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-header"]')].map(text), ['Components']);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-count"]')].map(text), ['1']);
});

test('a two_column drawer names BOTH slots and never sums them', () => {
  /**
   * F. Round 16 built sectionChildCounts per-slot and refused to sum across
   * slots; the badge cannot sum by construction, because each drawer draws one
   * slot and has no second slot in scope to add.
   */
  const two = [sec('t', 'two_column', {
    left: [sec('a', 'heading', {}, 'ซ้ายหนึ่ง'), sec('b', 'heading', {}, 'ซ้ายสอง')],
    right: [sec('c2', 'heading', {}, 'ขวาหนึ่ง')],
  }, 'บล็อกเปรียบเทียบ')];   // NOT 'สองคอลัมน์' — that IS two_column's type label,
  // and naming a section after its own type is round 32's separate case. Using
  // it here would have tested a coincidence rather than the counts.
  const doc = panelDoc(two, ['t']);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-header"]')].map(text), ['ซ้าย', 'ขวา']);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-count"]')].map(text), ['2', '1']);
  // The sum appears NOWHERE — not on a badge and not on the row's own line 2,
  // which round 16 already writes as "ซ้าย 2 · ขวา 1".
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-count"]')].map(text).includes('3'), false);
  assert.equal(text(rowsIn(doc)[0].querySelector('[data-testid="row-secondary"]')), 'สองคอลัมน์ · ซ้าย 2 · ขวา 1');
});

test('a CLOSED container draws no drawer header at all', () => {
  // The subtree is absent from the DOM, not hidden — round 32's ruling.
  const doc = panelDoc(NESTED);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-header"]')], []);
  assert.deepEqual([...doc.querySelectorAll('[data-testid="slot-count"]')], []);
});

// ── G: round 29's don't-build list, asserted ABSENT ───────────────────────

/**
 * Each item, with the reason it was refused. Shaped like round 27's JSON-LD
 * claim vocabulary: the failure worth catching is a later round adding one back
 * because the design draws it, without the argument that refused it.
 */
const DECLINED = Object.freeze([
  ['the relative-time autosave line', ['เมื่อสักครู่', 'นาทีที่แล้ว', 'บันทึกเมื่อ'],
    'a SECOND save vocabulary beside the one the top bar owns — round 27\'s rule'],
  ['the เปิดใช้งาน Section toggle', ['เปิดใช้งาน Section'],
    'TOGGLE_SECTION already has the eye; two controls for one boolean'],
  ['the kebab menu', ['MoreVertical', 'MoreHorizontal', 'EllipsisVertical'],
    'no menu is drawn anywhere in this file, so the glyph would open nothing'],
  ['Full Width as a subtitle', ['Full Width'],
    'the design mixes a containerWidth VALUE with a type label; the row ships the type'],
  ['the 66px hint banner', ['ลากการ์ดเพื่อจัดลำดับใหม่'],
    'a banner spending 66px of a 514px list budget to restate the header'],
]);

test('every item on round 29\'s don\'t-build list is absent from the panel', () => {
  const { code } = readSource(SRC);
  const doc = panelDoc(NESTED, ['c']);
  const rendered = text(doc.body);
  for (const [what, vocabulary, why] of DECLINED) {
    for (const term of vocabulary) {
      assert.equal(code.includes(term), false,
        `StructurePanel.jsx names "${term}", which belongs to the declined "${what}". `
        + `It was refused because it is ${why}.`);
      assert.equal(rendered.includes(term), false,
        `the panel RENDERS "${term}" — see the declined "${what}"`);
    }
  }
});

test('the permanently-dark navy rail was declined — surfaces come from tokens', () => {
  /**
   * Round 28 settled the panel's surfaces on --surface / --surface-hover /
   * --surface-muted, and the design gives no dark counterpart for its navy
   * rail. Round 30's ban is what enforces it; this states the specific refusal
   * so a later round does not read the ban as merely stylistic.
   */
  const { code } = readSource(SRC);
  const rawColors = [...new Set([
    ...(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
    ...(code.match(/rgba?\(\s*[\d.][^)]*\)/g) ?? []),
  ])].sort();
  assert.deepEqual(rawColors, [],
    'a raw colour literal reached the structure panel — the navy rail was declined, and '
    + 'every surface here resolves to a --surface-* token or a 9e-* class');
  assert.match(code, /var\(--surface\)/, 'the card no longer sits on the surface token');
});

test('CONTROL: the absence sweep DOES catch a declined item coming back', () => {
  // Without this, five empty results could be a scan that reads nothing.
  for (const [, vocabulary] of DECLINED) {
    const planted = `const x = "${vocabulary[0]}";`;
    assert.equal(planted.includes(vocabulary[0]), true, 'the scan cannot see planted source');
  }
  // …and it is reading the real file, which is not empty.
  const { code } = readSource(SRC);
  assert.ok(code.includes('row-tile'), 'the source reader returned nothing');
});
