import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { PUBLIC_STATUS_VALUES, INHOUSE_STATUS_VALUES } from '@/lib/registrations/statuses';

/**
 * THE SPARKLINE — specified in round E3, whose commit plan then had no commit
 * that rendered one.
 *
 * ══ WHAT WAS ACTUALLY MISSING ═══════════════════════════════════════════════
 * Not just the drawing. E3's facet grouped its series by `{source, key}`, which
 * answers the trend chart and nothing else — so the payload carried a series for
 * "Public ทั้งหมด" and "In-house ทั้งหมด" and for NONE of the six status cards.
 * Round E4 added `status` to that grouping: the same branch of the same facet in
 * the same pass, no second query and no second bucket rule.
 *
 * That is what makes test 2 assertable as an identity rather than as a
 * coincidence — see its own note.
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

function modelsReturning(facet) {
  return Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: () => Promise.resolve([facet]),
  }]));
}

const facetOf = (over = {}) => ({ current: [], previous: [], series: [], bounds: [], ...over });

/** April→September, so ทั้งหมด has a multi-bucket axis to draw. */
const SPANNING_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T00:00:00Z'),
  max: new Date('2026-08-29T00:00:00Z'),
  n: 49,
}];

async function build(facet, range, scopes = REG) {
  return buildDashboardMetrics({
    scopes, range, models: modelsReturning(facet), now: NOW,
  });
}

async function render(facet, range, scopes = REG) {
  const data = await build(facet, range, scopes);
  __setPathname('/admin');
  __setSearchParams('');
  return {
    data,
    html: renderToStaticMarkup(createElement(DashboardClient, {
      data: JSON.parse(JSON.stringify(data)),
      openSchedulesCount: scopes.system ? 103 : null,
      initialRange: scopes.registrations ? range : null,
    })),
  };
}

/** Rows keyed for whatever bucket size applies, one per status. */
const POPULATED = (key) => facetOf({
  current: [
    { _id: { source: 'public',  status: 'pending' }, n: 9 },
    { _id: { source: 'public',  status: 'paid' },    n: 3 },
    { _id: { source: 'inhouse', status: 'quoted' },  n: 2 },
  ],
  series: [
    { _id: { source: 'public',  status: 'pending', key }, n: 9 },
    { _id: { source: 'public',  status: 'paid',    key }, n: 3 },
    { _id: { source: 'inhouse', status: 'quoted',  key }, n: 2 },
  ],
  bounds: SPANNING_BOUNDS,
});

const sparkCount = (html) => (html.match(/data-slot="sparkline"/g) ?? []).length;
const svgCount = (html) => (html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length;

// ── the render is asserted before anything is concluded from it ────────────
test('sparkline: the page renders with sparklines at all', async () => {
  const { html } = await render(POPULATED('2026-08'), 'all');
  assert.ok(sparkCount(html) >= 8, `only ${sparkCount(html)} sparkline slots rendered`);
  assert.ok(svgCount(html) >= 8, 'the slots are there but nothing drew inside them');
});

// ── 1. EVERY CARD HAS ONE, INCLUDING AN ALL-ZERO ONE ───────────────────────

test('sparkline: all eight registration cards render one', async () => {
  const { html, data } = await render(POPULATED('2026-08'), 'all');
  // The payload half: a named array per card, none missing.
  for (const k of ['total', ...PUBLIC_STATUS_VALUES]) {
    assert.ok(Array.isArray(data.sparklines.public[k]), `public.${k} has no series`);
  }
  for (const k of ['total', ...INHOUSE_STATUS_VALUES]) {
    assert.ok(Array.isArray(data.sparklines.inhouse[k]), `inhouse.${k} has no series`);
  }
  assert.equal(sparkCount(html), 8, 'one slot per registration card, and no more');
});

test('sparkline: an ALL-ZERO series still draws — flat, not absent', async () => {
  /**
   * Control (a) breaks this. The same ruling as E3's zero queue cards: an admin
   * must be able to tell "no registrations" from "no chart", and at the default
   * range on a quiet week "no registrations" is the common case.
   */
  const { html, data } = await render(facetOf({ bounds: SPANNING_BOUNDS }), 'all');
  assert.deepEqual(
    data.sparklines.public.pending.filter((v) => v !== 0), [],
    'the fixture must really be all zero',
  );
  assert.ok(data.sparklines.public.pending.length > 1, 'and must have buckets to be flat across');
  assert.equal(
    svgCount(html), 8,
    'a zero series drew nothing — an empty chart and an absent chart are '
    + 'different facts and must look different',
  );
});

test('sparkline: a zero series is drawn ON THE BASELINE, not at mid-height', async () => {
  // `max || 1` in the y scale. Dividing by a zero max would be NaN and the path
  // would vanish; a max of 1 puts every point on the floor, which is the flat
  // line the header promises.
  const { html } = await render(facetOf({ bounds: SPANNING_BOUNDS }), 'all');
  assert.equal(html.includes('NaN'), false, 'a NaN reached the path data');
  const path = /<path d="([^"]+)"/.exec(html);
  assert.ok(path, 'no path was drawn');
  const ys = [...path[1].matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.length > 1, 'the path has no points');
  assert.equal(new Set(ys).size, 1, `a flat series is not flat: ${ys}`);
  assert.ok(ys[0] > 15, `the flat line is not on the baseline (y=${ys[0]} of 20)`);
});

// ── 2. THE SPARKLINE'S BUCKETS ARE THE CHART'S BUCKETS ─────────────────────

test('sparkline: bucket count equals the trend chart\'s, at EVERY range', async () => {
  /**
   * ── ASSERTED TOGETHER, IN ONE PAYLOAD, NOT AS TWO NUMBERS THAT AGREE ──────
   *
   * `assert.equal(spark.length, 7)` and `assert.equal(trend.length, 7)` in two
   * places would both pass while the two came from different rules that happen
   * to coincide at that range. This compares them to EACH OTHER, per range, in
   * the same built payload — so the only way to pass is for them to be the same
   * enumeration, which they are: `seriesFor` maps the very `keys` array that
   * `trend` maps.
   *
   * Control (b) gives the sparkline its own rule and this is what catches it.
   */
  for (const [range, key] of [
    ['today', '2026-09-05T10'],
    ['week',  '2026-09-01'],
    ['month', '2026-09-01'],
    ['all',   '2026-08'],
  ]) {
    const data = await build(POPULATED(key), range);
    const trendLen = data.trend.length;
    assert.ok(trendLen > 0, `${range}: the chart drew no buckets`);
    for (const source of ['public', 'inhouse']) {
      for (const [name, arr] of Object.entries(data.sparklines[source])) {
        assert.equal(
          arr.length, trendLen,
          `${range}: ${source}.${name} has ${arr.length} buckets, the chart drew ${trendLen}`,
        );
      }
    }
  }
});

test('sparkline: the per-bucket values SUM to the chart\'s bar, bucket by bucket', async () => {
  // The other half of "same pass": not only the same length, the same numbers.
  // The chart's bar for a bucket is the sum of that source's status series there.
  const data = await build(POPULATED('2026-08'), 'all');
  data.trend.forEach((bar, i) => {
    const pub = PUBLIC_STATUS_VALUES.reduce((s, k) => s + data.sparklines.public[k][i], 0);
    const inh = INHOUSE_STATUS_VALUES.reduce((s, k) => s + data.sparklines.inhouse[k][i], 0);
    assert.equal(pub, bar.publicCount, `bucket ${bar.key}: public sparklines sum to ${pub}, bar says ${bar.publicCount}`);
    assert.equal(inh, bar.inhouseCount, `bucket ${bar.key}: in-house sparklines sum to ${inh}, bar says ${bar.inhouseCount}`);
    assert.equal(data.sparklines.public.total[i], bar.publicCount, 'the total series must equal the bar');
  });
});

test('sparkline: a retired in-house status folds into its live series', async () => {
  // Same rule the counts follow. Round E1 measured one live document still
  // storing `contacted`; its card number and its little chart must agree.
  const data = await build(facetOf({
    series: [
      { _id: { source: 'inhouse', status: 'pending',   key: '2026-08' }, n: 5 },
      { _id: { source: 'inhouse', status: 'contacted', key: '2026-08' }, n: 1 },
    ],
    bounds: SPANNING_BOUNDS,
  }), 'all');
  const i = data.trend.findIndex((b) => b.key === '2026-08');
  assert.ok(i >= 0, 'the August bucket is missing');
  assert.equal(data.sparklines.inhouse.pending[i], 6, 'the retired value did not fold');
  assert.equal(data.sparklines.inhouse.total[i], 6);
});

// ── ACCESSIBILITY: decorative, and never the only statement of a value ─────

test('sparkline: it is decorative — aria-hidden, no tab stop', async () => {
  const { html } = await render(POPULATED('2026-08'), 'all');
  const svgs = html.match(/<svg[^>]*>/g).filter((s) => s.includes('viewBox="0 0 96 20"'));
  assert.ok(svgs.length >= 8, `found ${svgs.length} sparkline svgs`);
  for (const svg of svgs) {
    assert.ok(svg.includes('aria-hidden="true"'), `a sparkline is exposed to screen readers: ${svg}`);
    assert.ok(svg.includes('focusable="false"'), 'a sparkline can take a tab stop');
    assert.equal(/tabindex/i.test(svg), false, 'a sparkline declares a tab stop');
  }
});

test('sparkline: the NUMBER is still stated in text beside it', async () => {
  // The sparkline must never become the only place a value appears. The card's
  // value slot carries it, in text, above the chart.
  const { html } = await render(POPULATED('2026-08'), 'all');
  assert.match(html, /data-slot="value"[^>]*>9</, 'the pending count is not stated as text');
  assert.match(html, /data-slot="value"[^>]*>3</, 'the paid count is not stated as text');
});

// ── SCOPE: registration only ───────────────────────────────────────────────

test('sparkline: a system-only caller gets no sparkline and no series', async () => {
  const { html, data } = await render(POPULATED('2026-08'), 'all', SYS);
  assert.equal('sparklines' in data, false, 'the series reached a system-only payload');
  assert.equal(sparkCount(html), 0, 'a sparkline slot rendered on a system-only page');
});

// ── CONTROLS ───────────────────────────────────────────────────────────────

test('CONTROL: the sparkline counter can see a difference', () => {
  // Without this, "8 sparklines rendered" would hold for a counter that always
  // returned 8, and "0 for system-only" for one that always returned 0.
  assert.equal(sparkCount('<div data-slot="sparkline"></div>'), 1);
  assert.equal(sparkCount('<div data-slot="badge"></div>'), 0);
  assert.equal(svgCount('<svg aria-hidden="true"></svg>'), 1);
  assert.equal(svgCount('<svg></svg>'), 0);
});

test('CONTROL: a series of DIFFERENT values is not flat, so flatness means something', async () => {
  /**
   * The zero test asserts every y is identical. That would also hold for a
   * component that drew a straight line whatever it was given.
   */
  const data = await build(facetOf({
    series: [
      { _id: { source: 'public', status: 'pending', key: '2026-05' }, n: 1 },
      { _id: { source: 'public', status: 'pending', key: '2026-08' }, n: 9 },
    ],
    bounds: SPANNING_BOUNDS,
  }), 'all');
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: JSON.parse(JSON.stringify(data)), openSchedulesCount: null, initialRange: 'all',
  }));
  const path = /<path d="([^"]+)"/.exec(html);
  const ys = [...path[1].matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(new Set(ys).size > 1, `a varying series drew flat: ${ys}`);
});
