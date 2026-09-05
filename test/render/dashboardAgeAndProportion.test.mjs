import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { __setPathname, __setSearchParams } from 'next/navigation';
import { DashboardClient } from '@/app/admin/_components/DashboardClient';
import { buildDashboardMetrics, AGE_BUCKETS } from '@/lib/dashboard/buildMetrics';

/**
 * ROUND E5.1 + E5.2 — อายุของงานที่ค้าง, and the donut becoming one bar.
 *
 * ══ THE HISTOGRAM'S WHOLE VALUE IS THAT IT IS LOPSIDED ══════════════════════
 *
 * Round E1 measured production: 2 / 0 / 0 / 27 pending registrations by age.
 * Twenty-seven of the twenty-nine are more than a fortnight old, and the last
 * bar being ~13x the first IS the finding. Every instinct a charting library
 * encourages — normalise to the total, cap the longest bar, log-scale the axis,
 * give the smallest bar a minimum width so it is visible — destroys it, and
 * every one of them leaves a chart that still looks correct.
 *
 * So the assertions below are mostly about ARITHMETIC ON WIDTHS, which is the
 * only thing that can tell a shared scale from a flattering one. Control (a)
 * caps the scale and these are the tests that go red.
 *
 * ── FIXTURES ARE ABSOLUTE LITERALS ────────────────────────────────────────
 * The counts, the expected widths and the bucket labels are written out. A
 * width derived from AGE_BUCKETS or from the fixture's own max would assert
 * that the component agrees with the test's copy of the formula, which is not
 * the claim. AGE_BUCKETS is imported for one thing only — the count of buckets
 * the SERVER emits — and that use says so.
 *
 * ── WHAT THIS FILE CANNOT SEE ─────────────────────────────────────────────
 * Pixels. jsdom lays nothing out, so "the 2% segment is a visible sliver" and
 * "four bars read as lopsided at a glance" are browser facts. What is asserted
 * here is the percentage each element was given, which is the property that
 * produces them. The report says which is which.
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

const facetOf = (over = {}) => ({ current: [], previous: [], series: [], ages: [], bounds: [], ...over });

const PRODUCTION_BOUNDS = [{
  _id: null,
  min: new Date('2026-04-23T00:00:00Z'),
  max: new Date('2026-08-29T00:00:00Z'),
  n: 49,
}];

/** `ages` rows as Mongo would group them: one per {source, status, bucket}. */
const agesRows = (byBucket, status = 'pending', source = 'public') =>
  Object.entries(byBucket).map(([bucket, n]) => ({ _id: { source, status, bucket }, n }));

/**
 * PRODUCTION'S SHAPE, written out: 2 / 0 / 0 / 27.
 * The two empty buckets are ABSENT from the rows, exactly as a `$group` returns
 * them — a bucket with no documents produces no row at all, and the fold has to
 * put it back at zero.
 */
const PRODUCTION_AGES = agesRows({ '0-3': 2, '15+': 27 });

async function render(facet, range = 'all', scopes = REG) {
  const data = await buildDashboardMetrics({
    scopes, range, models: modelsReturning(facet), now: NOW,
  });
  __setPathname('/admin');
  __setSearchParams('');
  const html = renderToStaticMarkup(createElement(DashboardClient, {
    data: JSON.parse(JSON.stringify(data)),
    openSchedulesCount: null,
    initialRange: range,
  }));
  return { data, html, doc: new JSDOM(`<!doctype html><body>${html}</body>`).window.document };
}

/** The inline width percentage on one bucket's bar, or null if it drew no bar. */
function barPct(doc, id) {
  const bar = doc.querySelector(`[data-age-bar="${id}"]`);
  if (!bar) return null;
  const m = /width:\s*([\d.]+)%/.exec(bar.getAttribute('style') ?? '');
  return m ? Number(m[1]) : null;
}

// ── 1. THE HISTOGRAM ────────────────────────────────────────────────────────

test('the server folds the ages branch into four buckets, always all four', async () => {
  const { data } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }));
  assert.equal(data.ageDist.length, 4, 'a bucket went missing from the payload');
  // AGE_BUCKETS used only to say "as many as the module declares", which is the
  // claim; the VALUES below are literals.
  assert.equal(data.ageDist.length, AGE_BUCKETS.length);
  assert.deepEqual(
    data.ageDist.map((b) => b.count), [2, 0, 0, 27],
    'the fold does not reproduce the shape E1 measured',
  );
  assert.deepEqual(
    data.ageDist.map((b) => b.label),
    ['0–3 วัน', '4–7 วัน', '8–14 วัน', 'เกิน 14 วัน'],
  );
  assert.equal(data.ageTotal, 29, 'the buckets do not sum to the pending total');
});

test('the four bars share ONE scale, and the longest is the full width of it', async () => {
  /**
   * The load-bearing arithmetic. 2 and 27 against a max of 27 is 7.407…% and
   * 100%. Written as literals: a test that recomputed `2/27*100` would agree
   * with a capped implementation that also recomputed it against a cap.
   */
  const { doc } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }));
  const first = barPct(doc, '0-3');
  const last = barPct(doc, '15+');
  assert.ok(first !== null && last !== null, 'a populated bucket drew no bar');
  assert.equal(last, 100, 'the largest bucket is not the full width — the scale is capped');
  assert.ok(Math.abs(first - 7.4) < 0.1, `the 2-record bar is ${first}%, expected ~7.4%`);
  // And the ratio is the finding: ~13.5x, not squashed toward parity.
  assert.ok(last / first > 12, `the bars are only ${(last / first).toFixed(1)}x apart — the scale flatters`);
});

test('the last bar reflects its VALUE, not a ceiling — doubling it changes nothing else', async () => {
  /**
   * A cap is invisible when the largest bucket is already at 100%. This is the
   * test that sees it: make the small bucket smaller relative to the big one and
   * its width must fall proportionally. Under a cap or a normalisation the
   * smaller bar stops tracking the ratio.
   */
  const { doc } = await render(facetOf({
    ages: agesRows({ '0-3': 2, '15+': 54 }),
    bounds: PRODUCTION_BOUNDS,
  }));
  const first = barPct(doc, '0-3');
  assert.equal(barPct(doc, '15+'), 100);
  assert.ok(Math.abs(first - 3.7) < 0.1, `the 2-record bar is ${first}%, expected ~3.7% against a max of 54`);
});

test('a zero bucket renders its label and a plain 0, and NO track behind it', async () => {
  /**
   * E5.1 is explicit. An empty full-width rail reads as "there is something
   * here", which is the opposite of true — in production two of the four
   * buckets are empty, so this is the common case rather than an edge one.
   */
  const { doc } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }));
  for (const id of ['4-7', '8-14']) {
    const row = doc.querySelector(`[data-age-bucket="${id}"]`);
    assert.ok(row, `the ${id} bucket did not render at all`);
    assert.equal(
      doc.querySelector(`[data-age-bar="${id}"]`), null,
      `the empty ${id} bucket drew a track`,
    );
    assert.match(row.textContent, /0/, `the empty ${id} bucket did not state its zero`);
  }
  // …and the labels are present for the empty ones too, or the axis renumbers.
  assert.match(doc.querySelector('[data-age-bucket="4-7"]').textContent, /4–7 วัน/);
  assert.match(doc.querySelector('[data-age-bucket="8-14"]').textContent, /8–14 วัน/);
});

test('the histogram is titled and subtitled with the pending total', async () => {
  const { html } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }));
  assert.ok(html.includes('อายุของงานที่ค้าง'), 'the histogram has no title');
  assert.ok(html.includes('รอดำเนินการ 29 รายการ'), 'the subtitle does not state the pending total');
});

test('every bar wears the รอดำเนินการ colour, and none of them is red', async () => {
  // These 27 are a SUBSET of the 29 on the pending card; one colour is what
  // connects them. Red would read as "the system is broken".
  const { doc } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }));
  for (const id of ['0-3', '15+']) {
    const style = doc.querySelector(`[data-age-bar="${id}"]`).getAttribute('style');
    assert.match(style, /#f59e0b/, `the ${id} bar is not the pending amber`);
  }
  const chart = doc.querySelector('[data-chart="age-histogram"]').outerHTML;
  assert.ok(!/#ef4444|#dc2626|red-6|red-5/.test(chart), 'a bar was coloured as an alarm');
});

test('the histogram follows the range control, like the section it sits in', async () => {
  // The `ages` branch carries the same window `$match` as the cards. A section
  // describing a different window from the header above it is the defect E3
  // fixed in the trend chart's title.
  const { data } = await render(facetOf({ ages: PRODUCTION_AGES, bounds: PRODUCTION_BOUNDS }), 'today');
  assert.equal(data.ageDist.length, 4, 'the histogram vanished on a narrow range');
  assert.equal(data.ageTotal, 29, 'the fixture rows should still fold — the WINDOW is applied in Mongo');
});

test('no pending work at all says so, rather than drawing four empty rails', async () => {
  const { html, doc } = await render(facetOf({ ages: [], bounds: PRODUCTION_BOUNDS }));
  assert.equal(doc.querySelector('[data-chart="age-histogram"]'), null, 'an empty chart rendered its rows');
  assert.ok(html.includes('ไม่มีงานที่ค้างอยู่ในช่วงนี้'), 'the empty state does not say what is absent');
});

test('only PENDING public rows reach the buckets', async () => {
  /**
   * The branch groups every row and the JS fold filters, so a paid or in-house
   * document reaching the histogram would be a fold bug that no Mongo-side
   * `$match` is there to catch.
   */
  const { data } = await render(facetOf({
    ages: [
      ...agesRows({ '0-3': 2 }),
      ...agesRows({ '0-3': 99 }, 'paid'),
      ...agesRows({ '0-3': 50 }, 'pending', 'inhouse'),
    ],
    bounds: PRODUCTION_BOUNDS,
  }));
  assert.equal(data.ageTotal, 2, 'a non-pending or in-house row was counted as pending work');
});

/**
 * ══ THE BUCKET EDGES, EVALUATED — THE ONE THING NOTHING ELSE HERE SEES ══════
 *
 * Every other test in this file hands `buildDashboardMetrics` rows that are
 * ALREADY BUCKETED (`{_id: {bucket: '15+'}, n: 27}`), because that is what a
 * `$group` returns. So they exercise the fold, the drawing and the scale — and
 * NOT the expression that decides which bucket a record belongs to. That
 * expression runs inside Mongo, no double evaluates it, and a `$gte` slipped to
 * `$gt`, or an edge computed at the wrong multiple of a day, was invisible to
 * all ten thousand tests in this suite.
 *
 * This closes that. It takes the pipeline the REAL code builds, pulls out the
 * `$switch`, and classifies documents of known age with it.
 *
 * ── IT WAS OPENED BY A REPORT THAT TURNED OUT NOT TO BE A BUG ──────────────
 * The histogram was reported as off by one: production shows 0–3 = 0 and
 * 4–7 = 2, where round E1 measured 2 / 0 / 0 / 27. The edges are correct. The
 * DATA AGED — E1 measured those two registrations when they were fresh, the
 * newest is 2026-08-29T15:42:24Z, and the chart is relative to `now`, so at
 * 2026-09-05 they are 6.51 days old and 6.51 belongs in 4–7. The last assertion
 * below pins exactly that case so the next person does not re-open it.
 *
 * ── THE AGES ARE ABSOLUTE LITERALS, AND THAT IS THE POINT ─────────────────
 * `AGE_BUCKETS` is NOT read here. Every age is a written-out number of days and
 * every expected id is a written-out string. A fixture built from the constant
 * — `now - AGE_BUCKETS[0].upTo * DAY_MS` — asserts that the code agrees with a
 * second copy of its own arithmetic, which is satisfied by any edge at all,
 * including a wrong one. Round E3 shipped that shape twice before it was
 * caught. The values here are chosen to straddle each edge from both sides.
 *
 * ── THE EVALUATOR REFUSES WHAT IT DOES NOT UNDERSTAND ─────────────────────
 * It handles exactly `{$gte: ['$createdAt', <Date>]}` and THROWS on anything
 * else. That is deliberate: if someone changes the operator or the shape, this
 * test must go red and be re-read, not silently start measuring something else.
 * A permissive evaluator here would be a second implementation of the rule and
 * would drift away from the one under test.
 */
test('each bucket edge classifies the ages either side of it, in days', async () => {
  // Capture the FACETED pipeline the real code builds — not the activity read.
  let captured = null;
  const models = Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: (pipeline) => {
      if (Array.isArray(pipeline) && pipeline.some((st) => st && '$facet' in st)) {
        captured = pipeline;
        return Promise.resolve([facetOf({ bounds: PRODUCTION_BOUNDS })]);
      }
      return Promise.resolve([]);
    },
  }]));
  await buildDashboardMetrics({ scopes: REG, range: 'all', models, now: NOW });

  assert.ok(captured, 'no faceted pipeline captured — every assertion below is vacuous');
  const ages = captured.find((s) => s.$facet).$facet.ages;
  assert.ok(ages, 'the facet has no ages branch');
  const sw = ages.at(-1).$group._id.bucket.$switch;
  assert.ok(sw, 'the ages branch does not classify with a $switch');

  // $switch is ORDER-SENSITIVE: the first matching branch wins, so three
  // branches in this order plus a default is part of the rule, not decoration.
  assert.equal(sw.branches.length, 3, 'expected three edges and an open-ended default');
  assert.deepEqual(sw.branches.map((b) => b.then), ['0-3', '4-7', '8-14']);
  assert.equal(sw.default, '15+');

  /** Run the captured expression over a document created `days` ago. */
  const bucketAt = (days) => {
    const createdAt = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
    for (const branch of sw.branches) {
      const ops = Object.keys(branch.case);
      assert.deepEqual(ops, ['$gte'], `this test only evaluates $gte; the pipeline now uses ${ops.join(', ')} — re-read it`);
      const [field, edge] = branch.case.$gte;
      assert.equal(field, '$createdAt', `the switch classifies on ${field}, not the creation date`);
      assert.ok(edge instanceof Date, 'an edge is not a Date — the clock is not being subtracted');
      if (createdAt >= edge) return branch.then;
    }
    return sw.default;
  };

  // Literal ages in days -> the bucket each must land in. Both sides of every
  // edge, and the exact edge itself, which is where a $gte/$gt slip shows.
  const CASES = [
    [0,       '0-3'],   // created this instant
    [1,       '0-3'],
    [2,       '0-3'],   // the two records E1 measured, on the day it measured them
    [2.9,     '0-3'],
    [3,       '0-3'],   // the edge itself is INSIDE the first bucket
    [3.0001,  '4-7'],   // …and a hair past it is not
    [3.9,     '4-7'],
    [4,       '4-7'],
    [6.51,    '4-7'],   // production's newest record, today
    [7,       '4-7'],
    [7.0001,  '8-14'],
    [7.9,     '8-14'],
    [8,       '8-14'],
    [14,      '8-14'],
    [14.0001, '15+'],
    [14.1,    '15+'],
    [30,      '15+'],
    [135,     '15+'],   // the oldest of the 27, roughly
  ];
  for (const [days, want] of CASES) {
    assert.equal(bucketAt(days), want, `a registration ${days} days old landed in ${bucketAt(days)}, not ${want}`);
  }

  // Exhaustive and non-overlapping: every case above resolved, and each bucket
  // was actually reached — otherwise the table could pass while a branch was
  // dead.
  assert.deepEqual(
    [...new Set(CASES.map(([d]) => bucketAt(d)))].sort(),
    ['0-3', '15+', '4-7', '8-14'],
    'a bucket is unreachable — some age range can never land in it',
  );

  /**
   * THE REPORTED CASE, PINNED. The newest production registration is
   * 2026-08-29T15:42:24Z (recorded in test/pure/dashboardFacet). Against
   * NOW = 2026-09-05T04:00Z that is 6.51 days, which is 4–7 วัน and NOT 0–3.
   * The histogram showing 0–3 = 0 and 4–7 = 2 is those records having aged out
   * of the first bucket since E1 measured them, not an edge in the wrong place.
   */
  const NEWEST = new Date('2026-08-29T15:42:24Z');
  const ageOfNewest = (NOW.getTime() - NEWEST.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(Math.abs(ageOfNewest - 6.51) < 0.01, `the newest record is ${ageOfNewest} days old, not 6.51`);
  assert.equal(bucketAt(ageOfNewest), '4-7', 'a 6.5-day-old registration must not be drawn as 0–3 วัน');
});

// ── 2. THE PROPORTIONAL BAR ─────────────────────────────────────────────────

/** Production's split, written out: 29 pending, 8 paid, 3 quoted, 1 cancelled = 41. */
const PRODUCTION_SPLIT = [
  { _id: { source: 'public', status: 'pending' },   n: 29 },
  { _id: { source: 'public', status: 'paid' },      n: 8 },
  { _id: { source: 'public', status: 'confirmed' }, n: 3 },
  { _id: { source: 'public', status: 'cancelled' }, n: 1 },
];

test('the donut is gone and one bar with four segments took its place', async () => {
  const { doc } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }));
  const bar = doc.querySelector('[data-chart="status-bar"]');
  assert.ok(bar, 'the proportional bar did not render');
  const segments = [...doc.querySelectorAll('[data-segment]')];
  assert.equal(segments.length, 4, `expected four segments, found ${segments.length}`);
  // A donut draws its arcs with strokeDasharray on circles; nothing else on the
  // page does, so its absence is the honest marker that it was replaced rather
  // than hidden.
  assert.equal(doc.querySelectorAll('circle[stroke-dasharray]').length, 0, 'the donut still renders');
});

test('the segments are in the order E5.2 specifies', async () => {
  const { doc } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }));
  assert.deepEqual(
    [...doc.querySelectorAll('[data-segment]')].map((el) => el.getAttribute('data-segment')),
    ['pending', 'paid', 'confirmed', 'cancelled'],
  );
});

test('the segment widths are the shares, and they sum to the whole bar', async () => {
  const { doc } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }));
  const pct = (status) => {
    const m = /width:\s*([\d.]+)%/.exec(
      doc.querySelector(`[data-segment="${status}"]`).getAttribute('style'),
    );
    return Number(m[1]);
  };
  // 29/41, 8/41, 3/41, 1/41 — literals, not recomputed from the fixture.
  assert.ok(Math.abs(pct('pending') - 70.7) < 0.1, `pending is ${pct('pending')}%, expected ~70.7%`);
  assert.ok(Math.abs(pct('paid') - 19.5) < 0.1, `paid is ${pct('paid')}%, expected ~19.5%`);
  assert.ok(Math.abs(pct('confirmed') - 7.3) < 0.1, `confirmed is ${pct('confirmed')}%, expected ~7.3%`);
  assert.ok(Math.abs(pct('cancelled') - 2.4) < 0.1, `cancelled is ${pct('cancelled')}%, expected ~2.4%`);
  const sum = pct('pending') + pct('paid') + pct('confirmed') + pct('cancelled');
  assert.ok(Math.abs(sum - 100) < 0.01, `the segments sum to ${sum}%, not the whole bar`);
});

test('the 1-record sliver is left as a sliver — no minimum width', async () => {
  /**
   * E5.2 is explicit: a floor would draw one record the same size as three, and
   * a bar that does that is lying. 2.4% is about 7px in a half-width card, which
   * is the honest picture; the legend is where a small segment becomes legible.
   */
  const { doc } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }));
  const style = doc.querySelector('[data-segment="cancelled"]').getAttribute('style');
  const width = Number(/width:\s*([\d.]+)%/.exec(style)[1]);
  assert.ok(width < 3, `the sliver was widened to ${width}% — a floor is in place`);
  assert.ok(width > 0, 'the sliver was dropped entirely');
});

test('the legend leads with the raw count, then the percentage', async () => {
  // `รอดำเนินการ 29 (71%)`. At N=41 a bare "2%" makes one record look like a
  // measurement — the count says how many things were counted.
  const { doc } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }));
  const row = doc.querySelector('[data-legend="pending"]').textContent.replace(/\s+/g, ' ').trim();
  assert.match(row, /รอดำเนินการ\s*29\s*\(71%\)/, `the pending legend row reads "${row}"`);
  const cancelled = doc.querySelector('[data-legend="cancelled"]').textContent.replace(/\s+/g, ' ').trim();
  assert.match(cancelled, /ยกเลิก\s*1\s*\(2%\)/, `the cancelled legend row reads "${cancelled}"`);
  // The count must come BEFORE the percentage in the text, not merely be present.
  assert.ok(row.indexOf('29') < row.indexOf('71%'), 'the percentage is printed before the count');
});

test('the subtitle still names the range and the total', async () => {
  // A proportion with no stated window is unreadable, and "71%" of an unnamed N
  // is not a figure.
  const { html } = await render(facetOf({ current: PRODUCTION_SPLIT, bounds: PRODUCTION_BOUNDS }), 'all');
  assert.ok(html.includes('สัดส่วนสถานะ Public'), 'the chart lost its title');
  assert.ok(html.includes('ทั้งหมด — 41 รายการ'), 'the subtitle does not name the range and the total');
});

test('an empty window renders the track and says so, rather than four zero segments', async () => {
  const { doc, html } = await render(facetOf({ current: [], bounds: PRODUCTION_BOUNDS }));
  assert.equal(doc.querySelectorAll('[data-segment]').length, 0, 'zero-width segments rendered');
  assert.ok(html.includes('ไม่มีรายการในช่วงนี้'), 'the empty bar does not say it is empty');
});
