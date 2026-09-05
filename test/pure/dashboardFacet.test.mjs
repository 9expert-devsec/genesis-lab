import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { bucketForRange } from '@/lib/dashboard/ranges';
import { INHOUSE_LEGACY_STATUS_MAP } from '@/lib/registrations/statuses';

/**
 * ONE aggregation for the whole registration half — what it asks for, and what
 * it folds the answer into.
 *
 * ══ THE DOUBLE RETURNS A FACET, AND THE REAL FOLDING RUNS ═══════════════════
 * The pipeline is captured and asserted; the RESULT is a hand-built facet
 * document, so the folding code — the legacy-status widening, the zero-filling,
 * the percentage arithmetic, the corpus bounds — runs for real over data whose
 * shape the test controls. Nothing about Mongo's execution is claimed; the
 * queries themselves were measured against the live database in round E1.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');
const REG = { registrations: true, system: false };

const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
  // Round E3's action queue: (d) reads masterclass, (e) reads the webhook log.
  'MasterclassRegistration', 'WebhookLog',
];
const COLLECTION_OF = {
  RegisterPublic: 'register_public', RegisterInhouse: 'register_inhouse',
  Banner: 'banners', Promotion: 'promotions', Article: 'articles',
  FeaturedReview: 'featured_reviews', Recruit: 'recruits',
  MasterclassRegistration: 'masterclass_registrations', WebhookLog: 'webhook_logs',
};

/** Models whose registration aggregate returns `facet`, capturing the pipeline. */
function modelsReturning(facet) {
  const seen = { pipeline: null };
  const models = Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments: () => Promise.resolve(0),
    aggregate: (pipeline) => { seen.pipeline = pipeline; return Promise.resolve([facet]); },
  }]));
  return { models, seen };
}

const facetOf = (over = {}) => ({
  current: [], previous: [], series: [], bounds: [], ...over,
});

const build = (facet, range) => {
  const { models, seen } = modelsReturning(facet);
  return buildDashboardMetrics({ scopes: REG, range, models, now: NOW })
    .then((data) => ({ data, seen }));
};

// ── the double is asserted before anything is concluded from it ─────────────
test('facet: the pipeline was captured and has the three stages it must have', async () => {
  const { seen } = await build(facetOf(), 'week');
  assert.ok(Array.isArray(seen.pipeline), 'no pipeline captured — every assertion below is vacuous');
  assert.ok(seen.pipeline.find((s) => s.$project), 'no leading $project — the union would carry whole documents');
  assert.ok(seen.pipeline.find((s) => s.$unionWith), 'no $unionWith — where does in-house come from?');
  assert.ok(seen.pipeline.find((s) => s.$facet), 'no $facet — this is not one aggregation');
});

// ── E3.4: ONE aggregation serves everything ─────────────────────────────────

test('facet: current, series and bounds are branches of ONE aggregation', async () => {
  const { seen } = await build(facetOf(), 'week');
  const facet = seen.pipeline.find((s) => s.$facet).$facet;
  for (const branch of ['current', 'series', 'bounds', 'previous']) {
    assert.ok(facet[branch], `the ${branch} branch is missing`);
  }
});

test('facet: the bounds branch is UNFILTERED, so the empty state can see past the window', async () => {
  const { seen } = await build(facetOf(), 'today');
  const facet = seen.pipeline.find((s) => s.$facet).$facet;
  assert.equal(
    facet.bounds.some((s) => s.$match), false,
    'bounds must see every document — it answers "when WAS the last one", which is '
    + 'exactly the question the empty state asks when the window holds nothing',
  );
  // …while the branches that describe the window DO filter.
  assert.ok(facet.current.some((s) => s.$match), 'current must be windowed');
  assert.ok(facet.series.some((s) => s.$match), 'series must be windowed');
});

// ── 4. NO PERCENTAGE AT ทั้งหมด ─────────────────────────────────────────────

test('facet: ทั้งหมด has NO previous branch and NO percentage anywhere', async () => {
  const { data, seen } = await build(facetOf({
    current: [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
  }), 'all');

  const facet = seen.pipeline.find((s) => s.$facet).$facet;
  assert.equal('previous' in facet, false, 'a previous branch was sent for ทั้งหมด');

  assert.equal('previous' in data, false, 'the payload carries a previous period');
  assert.equal('delta' in data, false, 'the payload carries a percentage');
  // The strong form: no percent sign reaches the wire at all.
  assert.equal(
    JSON.stringify(data).includes('delta'), false,
    'there is no period before everything — a card rendering 0%, +0% or a dash '
    + 'there asserts a measurement nobody made',
  );
});

test('facet: the other three ranges DO carry a previous period and a delta', async () => {
  // The other direction, so the assertion above is about ทั้งหมด rather than
  // about the percentage never being computed.
  for (const range of ['today', 'week', 'month']) {
    const { data } = await build(facetOf({
      current:  [{ _id: { source: 'public', status: 'pending' }, n: 12 }],
      previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
    }), range);
    assert.ok(data.previous, `${range} lost its previous period`);
    assert.equal(data.delta.public.pending, 20, `${range}: 10 → 12 is +20%`);
    assert.equal(data.delta.public.total, 20);
  }
});

test('facet: a previous period of ZERO yields no percentage, not +100%', async () => {
  const { data } = await build(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 7 }],
    previous: [],
  }), 'week');
  assert.equal(
    data.delta.public.pending, null,
    '"+100% from nothing" is not a hundred percent of anything, and "+∞%" is not '
    + 'a number a card can render. The UI shows the two raw figures instead.',
  );
  assert.equal(data.previous.public.pending, 0, 'and the raw previous figure is still there to show');
});

test('facet: a decline is negative, so the sign is real', async () => {
  const { data } = await build(facetOf({
    current:  [{ _id: { source: 'public', status: 'pending' }, n: 5 }],
    previous: [{ _id: { source: 'public', status: 'pending' }, n: 10 }],
  }), 'week');
  assert.equal(data.delta.public.pending, -50);
});

// ── the legacy in-house widening survives the rewrite ───────────────────────

test('facet: a retired in-house status still counts as the live one it becomes', async () => {
  /**
   * `contacted` was retired by round 2 and migrates onto `pending`. Round E1
   * measured ONE live in-house document still storing it, so this is load-
   * bearing today rather than defensive. The nine countDocuments used
   * `storedValuesForFilter` to widen the QUERY; the facet groups raw and folds
   * with `effectiveStatus`, which is the same module's inverse.
   */
  assert.equal(INHOUSE_LEGACY_STATUS_MAP.contacted, 'pending', 'the map changed — update this test');
  const { data } = await build(facetOf({
    current: [
      { _id: { source: 'inhouse', status: 'pending' },   n: 5 },
      { _id: { source: 'inhouse', status: 'contacted' }, n: 1 },
      { _id: { source: 'inhouse', status: 'quoted' },    n: 1 },
    ],
  }), 'all');
  assert.equal(data.inhouse.pending, 6, 'the retired value did not fold onto pending');
  assert.equal(data.inhouse.quoted, 1);
  assert.equal(data.inhouse.total, 7, 'the total must count every row, folded or not');
});

test('facet: the cards still sum to the total, including unrecognised values', async () => {
  // The property the whole statuses module exists to protect: a strip reading
  // ทั้งหมด 8 over cards summing to 5.
  const { data } = await build(facetOf({
    current: [
      { _id: { source: 'public', status: 'pending' },  n: 3 },
      { _id: { source: 'public', status: 'archived' }, n: 2 }, // a word nobody knows
    ],
  }), 'all');
  assert.equal(data.public.total, 5, 'total must count the unrecognised row too');
  assert.equal(data.public.pending, 3);
});

// ── the series, both sources, zero-filled ───────────────────────────────────

test('facet: the series carries BOTH sources from the one pass', async () => {
  const { data } = await build(facetOf({
    series: [
      { _id: { source: 'public',  key: '2026-08' }, n: 9 },
      { _id: { source: 'inhouse', key: '2026-08' }, n: 4 },
    ],
    bounds: [{ _id: null, min: new Date('2026-07-01T00:00:00Z'), max: new Date('2026-08-29T00:00:00Z'), n: 13 }],
  }), 'all');
  const aug = data.trend.find((d) => d.key === '2026-08');
  assert.ok(aug, `no 2026-08 bucket in ${JSON.stringify(data.trend)}`);
  assert.equal(aug.publicCount, 9);
  assert.equal(aug.inhouseCount, 4, 'the in-house series is missing — E3.3 asked for it');
});

test('facet: a period with no registrations gets a ZERO bucket, not a missing one', async () => {
  const { data } = await build(facetOf({
    series: [{ _id: { source: 'public', key: '2026-09' }, n: 2 }],
    bounds: [{ _id: null, min: new Date('2026-07-01T00:00:00Z'), max: new Date('2026-09-01T00:00:00Z'), n: 2 }],
  }), 'all');
  const keys = data.trend.map((d) => d.key);
  assert.ok(keys.includes('2026-07'), 'July has no records and must still get a bar');
  assert.ok(keys.includes('2026-08'), 'August has no records and must still get a bar');
  assert.equal(data.trend.find((d) => d.key === '2026-08').publicCount, 0);
  assert.equal(data.trend.find((d) => d.key === '2026-09').publicCount, 2);
});

test('facet: ทั้งหมด starts its axis at the OLDEST RECORD, not an arbitrary date', async () => {
  // ทั้งหมด has no `from`, so the axis has to come from the data. Without this
  // the chart would either start at the epoch or draw nothing.
  const { data } = await build(facetOf({
    bounds: [{ _id: null, min: new Date('2026-04-23T00:00:00Z'), max: new Date('2026-08-29T00:00:00Z'), n: 41 }],
  }), 'all');
  assert.equal(data.trend[0].key, '2026-04');
  assert.equal(data.window.firstKey, '2026-04');
});

// ── 6. the payload states the bucket and the window it drew ─────────────────

test('facet: the payload names the bucket size and the window actually drawn', async () => {
  for (const range of ['today', 'week', 'month', 'all']) {
    const { data } = await build(facetOf({
      bounds: [{ _id: null, min: new Date('2026-04-23T00:00:00Z'), max: new Date('2026-08-29T00:00:00Z'), n: 41 }],
    }), range);
    assert.equal(data.bucket, bucketForRange(range), `${range} reported the wrong bucket`);
    assert.ok(data.window, `${range} has no window block`);
    assert.equal(typeof data.window.lastKey, 'string', `${range} drew no buckets`);
  }
});

// ── 7. the corpus bounds, for the empty state ───────────────────────────────

test('facet: the corpus bounds survive a window that matched nothing', async () => {
  /**
   * The production case measured on 2026-09-05: the newest registration is
   * 2026-08-29, so วันนี้ / 7 วัน / เดือนนี้ all hold zero rows. The page must
   * still be able to say WHEN the last one was, which means the bounds cannot
   * come from the windowed branches.
   */
  const { data } = await build(facetOf({
    current: [],
    series: [],
    bounds: [{ _id: null, min: new Date('2026-04-23T06:59:59Z'), max: new Date('2026-08-29T15:42:24Z'), n: 41 }],
  }), 'today');
  assert.equal(data.public.total, 0, 'the window really is empty');
  assert.equal(data.corpus.total, 41, 'but the corpus is not');
  assert.equal(data.corpus.latest, new Date('2026-08-29T15:42:24Z').toISOString());
  assert.equal(data.corpus.earliest, new Date('2026-04-23T06:59:59Z').toISOString());
});

test('facet: an entirely empty collection produces a calm zero, not a crash', async () => {
  const { data } = await build(facetOf(), 'all');
  assert.equal(data.public.total, 0);
  assert.equal(data.corpus.total, 0);
  assert.equal(data.corpus.latest, null);
  assert.deepEqual(data.trend, [], 'no records means no axis, and the chart says so itself');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the folding really reads the facet — it is not returning constants', async () => {
  const a = await build(facetOf({ current: [{ _id: { source: 'public', status: 'paid' }, n: 3 }] }), 'all');
  const b = await build(facetOf({ current: [{ _id: { source: 'public', status: 'paid' }, n: 8 }] }), 'all');
  assert.equal(a.data.public.paid, 3);
  assert.equal(b.data.public.paid, 8);
});

test('CONTROL: a source the fold does not know is ignored, not miscounted', async () => {
  // Guards the `row._id.source !== source` skip: without it a third source would
  // be added into both totals and the two cards would both be wrong.
  const { data } = await build(facetOf({
    current: [
      { _id: { source: 'public', status: 'paid' }, n: 3 },
      { _id: { source: 'martian', status: 'paid' }, n: 99 },
    ],
  }), 'all');
  assert.equal(data.public.total, 3);
  assert.equal(data.inhouse.total, 0);
});
