import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { ActivityTrail } from '@/components/pageBuilder/editor/ActivityTrail';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { readSource } from '../sourceScan.mjs';

/**
 * ROUND 41, commit 1 — the collapse, RENDERED.
 *
 * test/pure/auditCollapse proves the rule. Only a render can prove the SURFACE
 * consumes it: a component that kept `rows.map` passes every pure case. Rows
 * are seeded through `initialRows` for round 38's reason — the list arrives from
 * a useEffect, effects do not run under renderToStaticMarkup, and the runner
 * never mounts a React root.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

const trail = (over = {}) => docOf(renderToStaticMarkup(createElement(ActivityTrail, {
  pageId: 'p1', open: true, ...over,
})));

const lines = (doc) => [...doc.querySelectorAll('[data-testid="activity-row"]')]
  .map((n) => n.textContent.replace(/\s+/g, ' ').trim());

const YANISA = { id: 'u1', name: 'Yanisa P.' };

/** One autosave tick at 11:25 + i minutes on 25 Aug 2026 (UTC). */
const tick = (i) => ({
  _id: `s${i}`, action: 'draft.save', actor: YANISA,
  createdAt: new Date(Date.UTC(2026, 7, 25, 4, 25 + i)).toISOString(),
});

/**
 * M's fixture: the real screenshot's shape. A long autosave run with a publish
 * and a preview action buried in the middle of it, newest first.
 *
 *   4 ticks · สร้างรหัสพรีวิวใหม่ · 12 ticks · เผยแพร่ · 4 ticks
 */
const REAL = [
  ...[36, 35, 34, 33].map(tick),
  { _id: 'prev', action: 'preview.regenerate', actor: YANISA, createdAt: new Date(Date.UTC(2026, 7, 25, 4, 57)).toISOString() },
  ...[20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9].map(tick),
  { _id: 'pub', action: 'publish', actor: YANISA, createdAt: new Date(Date.UTC(2026, 7, 25, 4, 33)).toISOString() },
  ...[3, 2, 1, 0].map(tick),
];

// ── the collapse ────────────────────────────────────────────────────────────

test('a 22-row screenshot renders as five lines, and the two events are visible', () => {
  const rendered = lines(trail({ initialRows: REAL }));
  assert.equal(REAL.length, 22, 'the fixture is not the run it claims to be');
  assert.equal(rendered.length, 5,
    'the run did not collapse — the list is still one row per autosave tick');

  assert.match(rendered[0], /^บันทึกฉบับร่าง 4 ครั้ง โดย Yanisa P\. เมื่อ /);
  assert.match(rendered[1], /^สร้างรหัสพรีวิวใหม่ โดย Yanisa P\. เมื่อ /);
  assert.match(rendered[2], /^บันทึกฉบับร่าง 12 ครั้ง โดย Yanisa P\. เมื่อ /);
  assert.match(rendered[3], /^เผยแพร่ โดย Yanisa P\. เมื่อ /);
  assert.match(rendered[4], /^บันทึกฉบับร่าง 4 ครั้ง โดย Yanisa P\. เมื่อ /);
});

test('the publish and the preview action each keep a line of their own', () => {
  // The point of the round: these are what an author opened the list for, and
  // in the screenshot they are one row in twenty-two.
  const rendered = lines(trail({ initialRows: REAL }));
  assert.equal(rendered.filter((l) => l.startsWith('เผยแพร่')).length, 1);
  assert.equal(rendered.filter((l) => l.startsWith('สร้างรหัสพรีวิวใหม่')).length, 1);
  for (const l of [...rendered.filter((x) => x.startsWith('เผยแพร่')), ...rendered.filter((x) => x.startsWith('สร้างรหัสพรีวิวใหม่'))]) {
    assert.equal(l.includes('ครั้ง'), false, 'an event row grew a count');
  }
});

test('CONTROL: the same fixture WITHOUT a collapse is 22 lines', () => {
  // Without this, "5 lines" would pass for a component that renders a fixed
  // handful of rows unrelated to the data. Each row given a distinct actor
  // breaks every run, which is the ungrouped rendering.
  const distinct = REAL.map((r, i) => ({ ...r, actor: { id: `u${i}`, name: `P${i}` } }));
  assert.equal(lines(trail({ initialRows: distinct })).length, 22);
});

test('a run of N says N — and the number is the ROW count, not the group count', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => tick(20 - i));
  const [only] = lines(trail({ initialRows: twenty }));
  assert.match(only, /^บันทึกฉบับร่าง 20 ครั้ง โดย Yanisa P\. เมื่อ /);
  assert.equal(lines(trail({ initialRows: twenty })).length, 1);
});

test('a SINGLE autosave renders as itself — round 38’s sentence, unchanged', () => {
  const [one] = lines(trail({ initialRows: [tick(1)] }));
  assert.match(one, /^บันทึกฉบับร่าง โดย Yanisa P\. เมื่อ /);
  for (const runWord of ['ครั้ง', 'อย่างน้อย']) {
    assert.equal(one.includes(runWord), false, `a lone autosave reads as a run: it says "${runWord}"`);
  }
});

test('a run of consecutive PUBLISH rows stays one row per publish', () => {
  // The control the round asks for, at the render: three publishes are three
  // public states, and the list must not report one event where there were three.
  const publishes = [3, 2, 1].map((i) => ({
    _id: `p${i}`, action: 'publish', actor: YANISA,
    createdAt: new Date(Date.UTC(2026, 7, 25, i, 0)).toISOString(),
  }));
  const rendered = lines(trail({ initialRows: publishes }));
  assert.equal(rendered.length, 3, 'consecutive publishes collapsed');
  for (const l of rendered) {
    assert.equal(l.includes('ครั้ง'), false, 'a publish row carries a count');
  }
});

// ── C: the page boundary, at the render ────────────────────────────────────

test('with a cursor the OLDEST group says its count is a floor', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => tick(25 - i));
  const [only] = lines(trail({ initialRows: twentyFive, initialCursor: 'c|s1' }));
  assert.match(only, /^บันทึกฉบับร่าง อย่างน้อย 25 ครั้ง โดย Yanisa P\. เมื่อ /,
    'a run that may continue into unfetched rows reported its partial count as a total');
});

test('CONTROL: the same 25 rows with no cursor state the count outright', () => {
  const twentyFive = Array.from({ length: 25 }, (_, i) => tick(25 - i));
  const [only] = lines(trail({ initialRows: twentyFive }));
  assert.match(only, /^บันทึกฉบับร่าง 25 ครั้ง โดย Yanisa P\. เมื่อ /);
  assert.equal(only.includes('อย่างน้อย'), false, 'a complete list hedges its count');
});

test('only the oldest group hedges — the ones bracketed by loaded rows do not', () => {
  const rendered = lines(trail({ initialRows: REAL, initialCursor: 'c|s0' }));
  assert.deepEqual(rendered.map((l) => l.includes('อย่างน้อย')), [false, false, false, false, true]);
});

test('the component groups the ACCUMULATED rows, so a split run cannot restart', () => {
  /**
   * The state after "ดูรายการก่อนหน้า" — page 1 then page 2 in one array, which
   * is exactly what `loadMore` appends into. The rendered count is the true
   * total; a per-page grouping would render two lines here.
   */
  const all = Array.from({ length: 30 }, (_, i) => tick(30 - i));
  const rendered = lines(trail({ initialRows: [...all.slice(0, 25), ...all.slice(25)] }));
  assert.equal(rendered.length, 1, 'the fetch boundary split one run into two rows');
  assert.match(rendered[0], /^บันทึกฉบับร่าง 30 ครั้ง /);
});

test('the append is still an append — loadMore was not turned into a replace', () => {
  const { code } = readSource('src/components/pageBuilder/editor/ActivityTrail.jsx');
  assert.match(code, /setRows\(\(prev\) => \[\.\.\.\(prev \?\? \[\]\), \.\.\./,
    'loadMore no longer appends; grouping only tells the truth over accumulated rows');
  assert.match(code, /groupAuditRows\(rows, \{ more: Boolean\(cursor\) \}\)/,
    'the component no longer groups over the accumulated rows with the cursor as the seam flag');
});

test('the transform lives in the pure module, not inline in the component', () => {
  const { code } = readSource('src/components/pageBuilder/editor/ActivityTrail.jsx');
  for (const piece of ['ครั้ง', 'อย่างน้อย']) {
    assert.equal(code.includes(piece), false,
      `ActivityTrail spells "${piece}" itself. auditTrail.js owns the composition so the pure `
      + 'tests can assert it by value.');
  }
  // …and the row composer is still called for the group of one.
  assert.match(code, /auditRowLine\(g\.newest, when\(g\.newest\.createdAt\)\)/,
    'a group of one no longer goes through round 38’s row composer');
});

test('CONTROL: the same reader DOES see the vocabulary when it is inline', () => {
  assert.equal('const s = `${n} ครั้ง`;'.includes('ครั้ง'), true,
    'the inline-vocabulary matcher does not work, so the check above means nothing');
});
