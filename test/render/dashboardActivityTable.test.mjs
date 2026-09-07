import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';

/**
 * ROUND E5.3 — รายการล่าสุด, and E5.5's section order.
 *
 * ══ THE ONE THING THAT IS EASY TO GET WRONG HERE IS THE TAB STOPS ═══════════
 *
 * "The whole row is one link" has a tidy implementation — one <Link> with
 * `position:absolute; inset:0` over a `position:relative` <tr> — and this repo
 * has already rejected it, in writing, in
 * registrations/_components/tableParts.jsx: relative positioning on a table row
 * was undefined in CSS 2.1, and where a browser declines, `inset:0` resolves
 * against the nearest positioned ancestor instead, so ONE row's link covers the
 * whole table and every row navigates to that record. E5.3 says to copy the
 * existing pattern rather than invent one, and this file is what proves the
 * copy is faithful: four links per row, one tab stop.
 *
 * A tab-stop count is exactly the sort of claim that reads as satisfied by
 * eyeballing markup and is not, which is why it is counted here rather than
 * asserted as "the row is a link".
 *
 * ── FIXTURES ARE ABSOLUTE LITERALS ────────────────────────────────────────
 * Ids, names, courses and timestamps are written out, and the expected relative
 * strings ("2 ชั่วโมงที่แล้ว") are written out too rather than recomputed from
 * NOW — a test that recomputed the offset would agree with an off-by-one
 * implementation of the same arithmetic.
 *
 * ── WHAT THIS FILE CANNOT SEE ─────────────────────────────────────────────
 * That a real Tab press moves once per row (jsdom runs no focus model), that
 * the focus ring is visible, and what the table does at a phone width — it has
 * a `min-w` and an `overflow-x-auto` parent, and whether that scrolls or
 * squashes is a layout fact. The report says so.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');
const REG = { registrations: true, system: false };
const SYS = { registrations: false, system: true };

const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
  'MasterclassRegistration', 'WebhookLog',
];
const COLLECTION_OF = {
  RegisterPublic: 'register_public', RegisterInhouse: 'register_inhouse',
  Banner: 'banners', Promotion: 'promotions', Article: 'articles',
  FeaturedReview: 'featured_reviews', Recruit: 'recruits',
  MasterclassRegistration: 'masterclass_registrations', WebhookLog: 'webhook_logs',
};

const facetOf = (over = {}) => ({ current: [], previous: [], series: [], ages: [], bounds: [], ...over });

const PRODUCTION_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T00:00:00Z'),
  max: new Date('2026-08-29T00:00:00Z'),
  n: 49,
}];

/**
 * Six raw documents as the projection returns them, newest first.
 *
 * The names are split across two fields because the pipeline projects
 * `coordinator.firstName` / `coordinator.lastName`; the join is the read's job,
 * and row 6 has only a first name so the "undefined undefined" case is covered.
 */
const RAW_ROWS = [
  { _id: 'r1', createdAt: new Date('2026-09-05T03:59:30.000Z'), status: 'pending',   courseName: 'Power BI Intermediate', firstName: 'สมชาย',  lastName: 'ใจดี' },
  { _id: 'r2', createdAt: new Date('2026-09-05T02:00:00.000Z'), status: 'paid',      courseName: 'Excel Advanced',        firstName: 'สมหญิง', lastName: 'รักเรียน' },
  { _id: 'r3', createdAt: new Date('2026-09-04T04:00:00.000Z'), status: 'confirmed', courseName: 'Python for Data',       firstName: 'วีระ',   lastName: 'พงศ์' },
  { _id: 'r4', createdAt: new Date('2026-08-31T04:00:00.000Z'), status: 'cancelled', courseName: 'Power Automate',        firstName: 'อนันต์', lastName: 'สุข' },
  { _id: 'r5', createdAt: new Date('2026-04-23T04:00:00.000Z'), status: 'pending',   courseName: 'Copilot 365',           firstName: 'มานี',   lastName: 'ดีงาม' },
  { _id: 'r6', createdAt: new Date('2026-09-05T03:00:00.000Z'), status: 'pending',   courseName: null,                    firstName: 'เดี่ยว', lastName: null },
];

/**
 * A model double that answers the TWO aggregates differently.
 *
 * The facet pipeline ends in `$facet`; the activity pipeline ends in `$project`
 * after a `$limit`. Branching on the stage the pipeline actually carries is what
 * makes this double exercise the real call rather than returning one shape to
 * both and letting the shape-check hide a wiring error.
 */
function modelsReturning(facet, rows = RAW_ROWS) {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: (pipeline) => Promise.resolve(
      pipeline.some((st) => st && '$facet' in st) ? [facet] : rows,
    ),
  }]));
}

async function render(facet, { range = 'all', scopes = REG, rows = RAW_ROWS } = {}) {
  const data = await buildDashboardMetrics({
    scopes, range, models: modelsReturning(facet, rows), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: JSON.parse(JSON.stringify(data)),
    openSchedulesCount: scopes.system ? 103 : null,
    initialRange: scopes.registrations ? range : null,
  }));
  return { data, html, doc: new JSDOM(`<!doctype html><body>${html}</body>`).window.document };
}

const table = (doc) => doc.querySelector('[data-table="latest-activity"]');

// ── 1. The read and its shape ───────────────────────────────────────────────

test('the payload carries six rows, newest first, with the four fields shown', async () => {
  const { data } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  assert.equal(data.latestActivity.length, 6);
  assert.deepEqual(data.latestActivity.map((r) => r.id), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
  assert.equal(data.latestActivity[0].name, 'สมชาย ใจดี', 'the name halves were not joined');
  assert.equal(data.latestActivity[0].courseName, 'Power BI Intermediate');
  assert.equal(data.latestActivity[0].status, 'pending');
});

test('a half-missing name joins to the half that exists, never to "undefined"', async () => {
  const { data } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const only = data.latestActivity.find((r) => r.id === 'r6');
  assert.equal(only.name, 'เดี่ยว');
  assert.equal(only.courseName, null, 'an absent course should stay absent, not become a string');
});

test('the read projects to the fields it renders, and no more', async () => {
  /**
   * A dashboard payload is serialised into the page and shipped to the browser,
   * so a field fetched "just in case" is a field anyone can read out of
   * devtools. These documents carry invoice addresses and payment records.
   */
  const { data } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  for (const row of data.latestActivity) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ['courseName', 'createdAt', 'id', 'name', 'status'],
      `an unexpected field reached the payload: ${Object.keys(row).join(', ')}`,
    );
  }
});

// ── 2. The row is a link, with ONE tab stop ─────────────────────────────────

test('the whole row is a link to that registration, in every cell', async () => {
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const row = doc.querySelector('[data-activity-row="r3"]');
  assert.ok(row, 'the row did not render');
  const links = [...row.querySelectorAll('a')];
  assert.equal(links.length, 4, `expected one link per cell, found ${links.length}`);
  for (const a of links) {
    assert.equal(
      a.getAttribute('href'), '/admin/registrations/r3',
      'a cell links somewhere other than its own row’s record',
    );
  }
});

test('one tab stop per row — the other three cells are removed from the order', async () => {
  /**
   * THE COST OF THE FOUR-LINK PATTERN, AND THE THING THAT PAYS IT. Without
   * `tabIndex={-1}` a six-row table is 24 tab stops. The first cell keeps its
   * natural stop so the row is reachable; the rest are clickable and
   * middle-clickable but not tabbable.
   */
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const rows = [...doc.querySelectorAll('[data-activity-row]')];
  assert.equal(rows.length, 6);
  for (const row of rows) {
    const links = [...row.querySelectorAll('a')];
    const tabbable = links.filter((a) => a.getAttribute('tabindex') !== '-1');
    assert.equal(
      tabbable.length, 1,
      `row ${row.getAttribute('data-activity-row')} has ${tabbable.length} tab stops, expected 1`,
    );
    // …and it is the FIRST cell, so focus order follows reading order.
    assert.equal(links[0].getAttribute('tabindex'), null, 'the first cell was removed from the tab order');
  }
  const allTabbable = [...table(doc).querySelectorAll('a')]
    .filter((a) => a.getAttribute('tabindex') !== '-1');
  assert.equal(allTabbable.length, 6, `the table adds ${allTabbable.length} tab stops, expected 6`);
});

test('one focus ring, on the row, not four inside it', async () => {
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const row = doc.querySelector('[data-activity-row="r1"]');
  assert.match(row.className, /focus-within:outline/, 'the row carries no focus treatment');
  for (const a of row.querySelectorAll('a')) {
    assert.ok(
      !/focus(-visible)?:(ring|outline)/.test(a.className),
      'a cell carries its own ring — four rings would light up for one focus',
    );
  }
});

// ── 3. What the row says ────────────────────────────────────────────────────

test('the status is a coloured pill wearing the shared chip classes', async () => {
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const pill = doc.querySelector('[data-activity-row="r2"] [data-status-pill]');
  assert.ok(pill, 'the status cell rendered no pill');
  assert.equal(pill.getAttribute('data-status-pill'), 'paid');
  assert.match(pill.className, /bg-emerald-100/, 'the pill is not wearing the paid chip');
  assert.match(pill.textContent, /ชำระแล้ว/, 'the pill does not name the status');
});

test('the time is relative Thai text, and falls back to a date past a month', async () => {
  // Literals, against NOW = 2026-09-05T04:00Z. r1 is 30s ago, r2 two hours,
  // r3 a day, r4 five days, r5 April — which is well past thirty.
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const timeIn = (id) => doc.querySelector(`[data-activity-row="${id}"] td:last-child`).textContent.trim();
  assert.equal(timeIn('r1'), 'เมื่อสักครู่');
  assert.equal(timeIn('r2'), '2 ชั่วโมงที่แล้ว');
  assert.equal(timeIn('r3'), '1 วันที่แล้ว');
  assert.equal(timeIn('r4'), '5 วันที่แล้ว');
  assert.ok(!/ที่แล้ว/.test(timeIn('r5')), `an April record reads "${timeIn('r5')}" — 135 วันที่แล้ว helps nobody`);
});

test('the four columns are headed in Thai', async () => {
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  assert.deepEqual(
    [...table(doc).querySelectorAll('thead th')].map((th) => th.textContent.trim()),
    ['ชื่อผู้สมัคร', 'หลักสูตร', 'สถานะ', 'เวลา'],
  );
});

// ── 4. Empty, and scope ─────────────────────────────────────────────────────

test('no registrations yet says so, and renders no table at all', async () => {
  const { doc, html } = await render(facetOf({ bounds: [] }), { rows: [] });
  assert.equal(table(doc), null, 'an empty table with headers rendered');
  assert.ok(html.includes('ยังไม่มีรายการลงทะเบียน'), 'the empty state does not say what is missing');
});

test('a system-only caller gets no activity table and no activity DATA', async () => {
  // The read is inside the registration half, so it never ran. The key must be
  // absent rather than empty — a key that does not exist cannot be read out of
  // the page payload.
  const { data, doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }), { scopes: SYS, range: 'all' });
  assert.equal('latestActivity' in data, false, 'the payload carries activity for a system-only caller');
  assert.equal(table(doc), null, 'the activity table rendered without the scope');
});

// ── 5. E5.5's order ─────────────────────────────────────────────────────────

test('the sections run in the order round E5.5 specifies', async () => {
  /**
   * Asserted by POSITION IN THE MARKUP, because "the order down the page" is
   * what E5.5 actually specifies and a set of "is it present" checks would pass
   * against any arrangement at all.
   */
  const { html } = await render(facetOf({
    current: [{ _id: { source: 'public', status: 'pending' }, n: 29 }],
    ages: [{ _id: { source: 'public', status: 'pending', bucket: '15+' }, n: 27 }],
    bounds: PRODUCTION_BOUNDS,
  }), { scopes: { registrations: true, system: true } });

  const at = (needle, from = 0) => {
    const i = html.indexOf(needle, from);
    assert.ok(i > 0, `not found in the markup: ${needle}`);
    return i;
  };
  const queue     = at('รอดำเนินการ</h2>') || at('สถานะปัจจุบัน — ไม่กรองตามช่วงวันที่');
  const cards     = at('การลงทะเบียน —');
  const histogram = at('อายุของงานที่ค้าง');
  const bar       = at('สัดส่วนสถานะ Public');
  const trend     = at('แนวโน้มการลงทะเบียน —');
  const activity  = at('data-table="latest-activity"');
  // The strip's SUBTITLE, not its heading. 'ภาพรวมระบบ' is also the PAGE
  // TITLE at the top of this component, so a heading match resolves to index
  // ~213 and every ordering assertion below it inverts. This suite has been
  // bitten by over-broad Thai markers before — dashboardSections keeps a
  // STRIP_ONLY constant for exactly this, and this is the same string.
  const system    = at('ข้อมูล Live — ไม่กรองตามวันที่');

  assert.ok(queue < cards,      'the action queue is not first');
  assert.ok(cards < histogram,  'the registration cards do not precede the histogram');
  assert.ok(histogram < bar,    'the histogram does not precede the proportional bar');
  assert.ok(bar < trend,        'the trend chart is not below the two status visuals');
  assert.ok(trend < activity,   'รายการล่าสุด is not below the trend chart');
  assert.ok(activity < system,  'the system strip is not last');
});

test('the two status visuals share one row and the trend gets its own', async () => {
  // The histogram and the bar answer "what is the state now" and are read
  // together; the trend is a different question and no longer shares a
  // two-column row with one of them.
  const { doc } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }));
  const twoCol = [...doc.querySelectorAll('section')]
    .find((el) => el.className.includes('lg:grid-cols-2') && el.textContent.includes('อายุของงานที่ค้าง'));
  assert.ok(twoCol, 'the histogram is not in a two-column section');
  assert.ok(twoCol.textContent.includes('สัดส่วนสถานะ Public'), 'the bar does not share the row');
  assert.ok(
    !twoCol.textContent.includes('แนวโน้มการลงทะเบียน'),
    'the trend chart is still sharing the two-column row',
  );
});
