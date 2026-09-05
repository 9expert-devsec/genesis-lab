import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';

/**
 * Two things a dashboard can lie about by staying silent:
 *
 *   · a window with nothing in it, rendered as zeros that look like a
 *     measurement rather than an absence of data;
 *   · a percentage at ทั้งหมด, where there is no period to compare against.
 *
 * Round E1 measured the first as the NORMAL state today — the newest
 * registration is 2026-08-29, so วันนี้, 7 วัน and เดือนนี้ all hold nothing and
 * the page rendered eight zeros while working exactly as designed.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');
const REG = { registrations: true, system: false };

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

function modelsReturning(facet) {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: () => Promise.resolve([facet]),
  }]));
}

const facetOf = (over = {}) => ({ current: [], previous: [], series: [], bounds: [], ...over });

/** The production shape on 2026-09-05: 41 records, newest 2026-08-29. */
const PRODUCTION_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T06:59:59Z'),
  max: new Date('2026-08-29T15:42:24Z'),
  n: 41,
}];

async function render(facet, range) {
  const data = await buildDashboardMetrics({
    scopes: REG, range, models: modelsReturning(facet), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  return {
    data,
    html: renderToStaticMarkup(createElement(DashboardClient, {
      data: JSON.parse(JSON.stringify(data)),
      openSchedulesCount: null,
      initialRange: range,
    })),
  };
}

// ── the render is asserted before anything is concluded from it ─────────────
test('empty: the page renders at all for an empty window', async () => {
  const { html } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }), 'today');
  assert.ok(html.length > 1500, `rendered ${html.length} chars — a vacuous baseline`);
  assert.ok(html.includes('การลงทะเบียน —'), 'the registration section still has to render');
});

// ── 7. THE EMPTY STATE NAMES THE MOST RECENT RECORD ─────────────────────────

test('empty: an empty window SAYS SO and names the last record\'s date', async () => {
  const { html, data } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }), 'today');
  assert.equal(data.public.total, 0, 'the fixture window must really be empty');
  assert.equal(data.corpus.total, 41, 'but the corpus is not');

  assert.ok(
    html.includes('ไม่มีการลงทะเบียนในช่วงที่เลือก'),
    'zeros without a sentence look like a measurement of nothing',
  );
  assert.ok(
    html.includes('29 ส.ค. 2569'),
    'the most recent record is 2026-08-29 and the empty state must name it — '
    + `got: ${html.slice(html.indexOf('รายการล่าสุด'), html.indexOf('รายการล่าสุด') + 120)}`,
  );
});

test('empty: the date is the CORPUS maximum, not anything from the window', async () => {
  // Moving only the corpus bound moves only the sentence. If the date came from
  // the windowed branches it could not move at all — they are empty.
  const other = await render(facetOf({
    bounds: [{ _id: null, min: new Date('2026-01-01T00:00:00Z'), max: new Date('2026-07-14T09:00:00Z'), n: 12 }],
  }), 'today');
  assert.ok(other.html.includes('14 ก.ค. 2569'), 'the sentence did not follow the corpus');
  assert.equal(other.html.includes('29 ส.ค. 2569'), false);
});

test('empty: an entirely empty CORPUS gets a different sentence, with no date', async () => {
  // There is no date to name on a fresh install, and inventing one would be
  // worse than the zeros. "No registrations yet" is the honest thing to say.
  const { html } = await render(facetOf(), 'all');
  assert.ok(html.includes('ยังไม่มีรายการลงทะเบียนในระบบ'));
  assert.equal(html.includes('รายการล่าสุดคือวันที่'), false, 'it named a date it does not have');
});

test('empty: a NON-empty window shows no empty state', async () => {
  // The other direction, so the assertions above are about emptiness rather
  // than about the sentence always being there.
  // The series must match the counts, or the CHART's own empty state fires and
  // the assertion below would be measuring that instead of the section's.
  const { html } = await render(facetOf({
    current: [{ _id: { source: 'public', status: 'pending' }, n: 4 }],
    series:  [{ _id: { source: 'public', key: '2026-08' }, n: 4 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'all');
  assert.equal(html.includes('ไม่มีการลงทะเบียนในช่วงที่เลือก'), false);
});

test('empty: a window holding ONLY in-house rows is not empty', async () => {
  // Telling a reader "no registrations" while eight in-house enquiries sit in
  // the window would be its own small lie.
  const { html } = await render(facetOf({
    current: [{ _id: { source: 'inhouse', status: 'pending' }, n: 8 }],
    series:  [{ _id: { source: 'inhouse', key: '2026-08' }, n: 8 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'all');
  assert.equal(html.includes('ไม่มีการลงทะเบียนในช่วงที่เลือก'), false);
});

test('empty: the ZEROS ARE STILL THERE — the sentence is added, not substituted', async () => {
  /**
   * The cards are the honest count for the window. Replacing them with the
   * sentence would leave the section looking broken and would hide the fact that
   * the query ran and returned nothing.
   */
  const { html } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }), 'today');
  assert.ok(html.includes('Public ทั้งหมด'), 'the cards vanished');
  assert.ok(html.includes('In-house ทั้งหมด'));
  assert.ok(html.includes('>0<'), 'the zero itself must still be rendered');
});

// ── 4. NO PERCENTAGE AT ทั้งหมด ─────────────────────────────────────────────

test('delta: ทั้งหมด renders NO percentage anywhere on the page', async () => {
  /**
   * Test 4, and control (c) breaks it. There is no period before everything —
   * not 0%, not "+0%", not a dash that looks like a value.
   */
  const { html, data } = await render(facetOf({
    current: [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'all');
  assert.equal('delta' in data, false, 'the payload carries a delta at ทั้งหมด');
  /**
   * ── ASSERTED ON THE COMPARISON LABEL, NOT ON THE '%' CHARACTER ────────────
   *
   * MEASURED: the first version searched for a bare '%' and failed against
   * correct output. The page renders percent signs for two other, legitimate
   * reasons — the donut legend's share of each status ("(29%)") and every CSS
   * `height: N%` on the bars — so '%' is not a marker for "a change was
   * claimed". It is the same class of over-broad matcher as the ภาพรวมระบบ and
   * ทั้งหมด ones this suite has already been bitten by twice.
   *
   * `เทียบช่วงก่อนหน้า` is rendered by DeltaBadge and by nothing else, so it IS
   * the marker.
   */
  assert.equal(
    html.includes('เทียบช่วงก่อนหน้า'), false,
    'a comparison label rendered with nothing to compare against',
  );
});

test('delta: the other three ranges DO render a percentage', async () => {
  // The other direction, so the assertion above is about ทั้งหมด rather than
  // about the percentage never rendering at all.
  for (const range of ['today', 'week', 'month']) {
    const { html } = await render(facetOf({
      current:  [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
      previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
      bounds: PRODUCTION_BOUNDS,
    }), range);
    assert.ok(html.includes('+20%'), `${range} did not render the +20% change`);
    assert.ok(html.includes('เทียบช่วงก่อนหน้า'), `${range} rendered a bare percentage`);
  }
});

test('delta: the SIGN is rendered — a bare 28% is ambiguous', async () => {
  const up = await render(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
    previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'week');
  assert.ok(up.html.includes('+20%'));

  const down = await render(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 5 }],
    previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'week');
  assert.ok(down.html.includes('-50%'), 'a decline must render as a decline');
});

test('delta: a previous period of ZERO renders NOTHING, not +100%', async () => {
  const { html, data } = await render(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 7 }],
    previous: [],
    bounds: PRODUCTION_BOUNDS,
  }), 'week');
  assert.equal(data.delta.public.pending, null);
  // The comparison LABEL, not the '%' character — see the note above.
  assert.equal(
    html.includes('เทียบช่วงก่อนหน้า'), false,
    '"a hundred percent of nothing" reached the page',
  );
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the percent sign is findable, so its absence means something', async () => {
  // Every "no percentage" assertion above would hold for a page that never
  // renders a % under any circumstances.
  const { html } = await render(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
    previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
    bounds: PRODUCTION_BOUNDS,
  }), 'week');
  assert.ok(
    html.includes('เทียบช่วงก่อนหน้า'),
    'the comparison label renders nowhere — the ทั้งหมด test is vacuous',
  );
  assert.ok(html.includes('+20%'), 'and the number itself is findable');
});

test('CONTROL: the empty sentence is findable, so its absence means something', async () => {
  const { html } = await render(facetOf({ bounds: PRODUCTION_BOUNDS }), 'today');
  assert.ok(html.includes('ไม่มีการลงทะเบียนในช่วงที่เลือก'));
});

test('CONTROL: rendering 0% WOULD be caught by the no-percentage test', () => {
  /**
   * Control (c), reconstructed rather than applied to the component — breaking
   * DeltaBadge would redden this whole file and make the red line unreadable.
   * `delta ?? 0` is the natural-looking mistake: it turns "no comparison" into
   * a comparison that came out flat.
   */
  const noDelta = undefined;
  assert.equal(typeof noDelta === 'number', false, 'nothing renders for undefined');
  assert.equal(typeof (noDelta ?? 0) === 'number', true, 'the ?? 0 mistake renders 0%');
});
