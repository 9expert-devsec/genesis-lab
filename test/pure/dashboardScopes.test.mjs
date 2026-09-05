import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_PAGE_KEYS } from '@/lib/rbac/pages';
import {
  DASHBOARD_SCOPE_KEYS,
  dashboardScopes,
  hasNoDashboardScope,
} from '@/lib/dashboard/scopes';
import { buildDashboardMetrics, dateRange } from '@/lib/dashboard/buildMetrics';

/**
 * The dashboard scopes: which halves a session may see, and — the part that
 * matters — WHICH READS RUN.
 *
 * ══ WHY THE READ COUNT IS ASSERTED AND NOT JUST THE MARKUP ══════════════════
 *
 * Round E2's rule is "a figure an admin may not see must not be QUERIED and must
 * not appear in the PAYLOAD". Those are two different claims and markup can
 * witness neither:
 *
 *   · a component that fetches everything and renders half of it passes every
 *     rendering assertion ever written about it, while shipping every number to
 *     the browser;
 *   · a payload assertion catches that one, but still passes for an
 *     implementation that queried everything and deleted keys afterwards — the
 *     database work happened, the admin waited for it, and E1 measured that work
 *     as three sequential Atlas round trips.
 *
 * So the models are COUNTING DOUBLES and the assertions are on the calls. The
 * real `buildDashboardMetrics` runs — real branching, real filter objects, real
 * wave grouping — against doubles that record what it asked for. Nothing about
 * Mongo is being claimed here; the queries themselves are unchanged from the
 * ones round E1 measured against the live database.
 */

// ── the counting doubles ────────────────────────────────────────────────────

/**
 * The MONGO COLLECTION NAME each double stands in for.
 *
 * Not decoration. `readRegistrations` builds its `$unionWith` from
 * `RegisterInhouse.collection.name` rather than from a literal, so a double
 * without this would let the test pass while production sent
 * `$unionWith: { coll: undefined }`. Supplying it is what makes the doubles
 * exercise the real pipeline construction rather than a simplified one.
 */
const COLLECTION_OF = Object.freeze({
  RegisterPublic: 'register_public',
  RegisterInhouse: 'register_inhouse',
  Banner: 'banners',
  Promotion: 'promotions',
  Article: 'articles',
  FeaturedReview: 'featured_reviews',
  Recruit: 'recruits',
  // Round E3's action queue: (d) reads masterclass, (e) reads the webhook log.
  MasterclassRegistration: 'masterclass_registrations',
  WebhookLog: 'webhook_logs',
});

/**
 * The empty result the registration aggregation would return against an empty
 * collection — one facet document with every branch present and empty.
 *
 * Shaped rather than `[]`, because `readRegistrations` reads `facet.current`,
 * `facet.series` and `facet.bounds` off it. Returning a bare `[]` would exercise
 * only the optional-chaining fallbacks and never the folding code that the round
 * actually changed.
 */
const EMPTY_FACET = () => [{ current: [], series: [], previous: [], bounds: [] }];

/** Records every countDocuments/aggregate call, with the filter it was given. */
function spyModel(name, reads, aggregateResult) {
  return {
    collection: { name: COLLECTION_OF[name] },
    countDocuments(filter) {
      reads.push({ model: name, op: 'countDocuments', filter });
      return Promise.resolve(0);
    },
    aggregate(pipeline) {
      reads.push({ model: name, op: 'aggregate', pipeline });
      return Promise.resolve(aggregateResult ? aggregateResult(pipeline) : EMPTY_FACET());
    },
  };
}

const MODEL_NAMES = [
  'RegisterPublic', 'RegisterInhouse',
  'Banner', 'Promotion', 'Article', 'FeaturedReview', 'Recruit',
  'MasterclassRegistration', 'WebhookLog',
];

/**
 * The collections a REGISTRATION-scope figure can come from.
 *
 * `MasterclassRegistration` joined in round E3: queue card (d) is the first
 * masterclass figure on this page, and it is registration-scoped. Leaving it out
 * would have made "no registration model was touched" pass while a masterclass
 * count fired for a system-only caller.
 */
const REGISTRATION_MODELS = new Set([
  'RegisterPublic', 'RegisterInhouse', 'MasterclassRegistration',
]);

function spyModels(aggregateResult) {
  const reads = [];
  const models = Object.fromEntries(
    MODEL_NAMES.map((n) => [n, spyModel(n, reads, aggregateResult)])
  );
  return { models, reads };
}

const NOW = new Date('2026-09-05T04:00:00.000Z');
const run = (scopes, range = 'today') => {
  const { models, reads } = spyModels();
  return buildDashboardMetrics({ scopes, range, models, now: NOW }).then((data) => ({ data, reads }));
};

/** Same, with a custom window — E4.4's second way of asking for a window. */
const runWindow = (scopes, range, custom) => {
  const { models, reads } = spyModels();
  return buildDashboardMetrics({ scopes, range, custom, models, now: NOW })
    .then((data) => ({ data, reads }));
};

const BOTH   = { registrations: true,  system: true  };
const REG    = { registrations: true,  system: false };
const SYS    = { registrations: false, system: true  };
const NONE   = { registrations: false, system: false };

// ── the doubles are asserted before anything is concluded from them ─────────
test('scopes: the spy actually records — a both-scopes run does real work', async () => {
  // Without this, every "no registration read fired" assertion below would pass
  // for a spy that records nothing at all.
  const { reads } = await run(BOTH);
  assert.ok(reads.length >= 6, `both scopes recorded only ${reads.length} reads`);
  assert.ok(reads.some((r) => r.model === 'RegisterPublic'));
  assert.ok(reads.some((r) => r.model === 'Banner'));
  assert.ok(reads.some((r) => r.op === 'aggregate'));
});

// ── 1. the keys are real registry keys ──────────────────────────────────────
test('scopes: both keys are registered pages, not invented strings', () => {
  for (const key of Object.values(DASHBOARD_SCOPE_KEYS)) {
    assert.ok(
      ALL_PAGE_KEYS.includes(key),
      `${key} is not in ALL_PAGE_KEYS — canAccess narrows an unregistered key to `
      + '"no access" for every role INCLUDING the superadmin bypass\'s downstream '
      + 'consumers, so the section would be silently invisible rather than error',
    );
  }
  assert.equal(DASHBOARD_SCOPE_KEYS.registrations, 'dashboard_registrations');
  assert.equal(DASHBOARD_SCOPE_KEYS.system, 'dashboard_system');
});

test('scopes: `dashboard` itself is NOT one of the scope keys', () => {
  // It gates the PAGE. Treating it as a third section would let a caller who
  // may merely open the dashboard be mistaken for one who may read it.
  assert.equal(Object.values(DASHBOARD_SCOPE_KEYS).includes('dashboard'), false);
});

// ── 2. resolution from a session user ───────────────────────────────────────
test('scopes: resolved from the pages array on the session user', () => {
  assert.deepEqual(
    dashboardScopes({ pages: ['dashboard', 'dashboard_registrations'] }),
    { registrations: true, system: false },
  );
  assert.deepEqual(
    dashboardScopes({ pages: ['dashboard', 'dashboard_system'] }),
    { registrations: false, system: true },
  );
  assert.deepEqual(
    dashboardScopes({ pages: ['dashboard', 'dashboard_registrations', 'dashboard_system'] }),
    { registrations: true, system: true },
  );
  assert.deepEqual(
    dashboardScopes({ pages: ['dashboard'] }),
    { registrations: false, system: false },
  );
});

test('scopes: superadmin gets both without holding either key', () => {
  // The same bypass every other page key gets — which is the whole reason these
  // are ordinary page keys instead of a second permission mechanism.
  assert.deepEqual(dashboardScopes({ isSuperadmin: true, pages: [] }), BOTH);
  assert.deepEqual(dashboardScopes({ pages: null }), BOTH, 'the pages == null sentinel');
});

test('scopes: a missing session FAILS CLOSED — no section, not every section', () => {
  assert.deepEqual(dashboardScopes(null), NONE);
  assert.deepEqual(dashboardScopes(undefined), NONE);
  assert.equal(hasNoDashboardScope(dashboardScopes(null)), true);
  assert.equal(hasNoDashboardScope(BOTH), false);
  assert.equal(hasNoDashboardScope(REG), false);
  assert.equal(hasNoDashboardScope(SYS), false);
});

// ── 3. THE READ COUNTS ──────────────────────────────────────────────────────

test('reads: both scopes — 12 reads, 10 counts and 2 aggregates', async () => {
  /**
   * ── E2 MEASURED 15. E3 WAS 11. E5 IS 12, AND DRAWS SIX MORE SECTIONS ────
   *
   * E2's fifteen were nine countDocuments for the registration cards, five for
   * the ภาพรวมระบบ strip, and one aggregate for the trend.
   *
   * E3 folded those nine counts AND the trend into a single faceted aggregation
   * that additionally returns the previous period, the in-house series and the
   * corpus bounds — ten round trips become one. It then spent four counts on
   * the registration action queue and one on the webhook queue.
   *
   * ── WHAT ROUND E5 ADDED, AND WHAT IT DID NOT ──────────────────────────────
   * E5 draws four new things: the age histogram, the proportional bar, the
   * per-card sparkline colours and รายการล่าสุด. THREE of them cost nothing.
   * The histogram is one more BRANCH of the facet that was already running — the
   * union is already materialised, so it walks the same rows again inside the
   * same round trip. The bar and the colours are the same `statusDist` E3 built.
   *
   * รายการล่าสุด is the exception, and it is exactly ONE read. It cannot come
   * off the facet: that pipeline projects every document down to
   * `{createdAt, status, source}` before the union, deliberately, and this table
   * needs the applicant name and the course name — two of the fields that
   * projection exists to discard. Widening it would inflate the union over the
   * whole corpus, for every branch, to label six rows.
   *
   *   1  facet          registration cards, status split, ages, trend, previous, bounds
   *   1  aggregate      รายการล่าสุด — sorted, limited to 6, projected  ← E5
   *   4  counts         queue (a) (b) (c) (d)
   *   5  counts         the ภาพรวมระบบ strip, unchanged
   *   1  count          queue (e)
   *  ──
   *  12
   */
  const { reads } = await run(BOTH);
  assert.equal(reads.length, 12);
  assert.equal(reads.filter((r) => r.op === 'countDocuments').length, 10, '4 queue + 5 content + 1 webhook');
  assert.equal(
    reads.filter((r) => r.op === 'aggregate').length, 2,
    'one facet for the registration half, one limited read for รายการล่าสุด',
  );
});

test('the E5 read is ONE read, limited and projected — not a second facet', async () => {
  /**
   * The count above says "two aggregates". This says the second one is small.
   * A `$limit`-less or `$project`-less second pass over the same collection
   * would satisfy the count and would be the cost this round promised not to
   * add — and `$facet` appearing twice would mean someone answered the table by
   * cloning the pipeline rather than by writing a narrow read.
   */
  const { reads } = await run(REG);
  const aggregates = reads.filter((r) => r.op === 'aggregate');
  assert.equal(aggregates.length, 2);
  const facets = aggregates.filter((r) => r.pipeline.some((st) => st && '$facet' in st));
  assert.equal(facets.length, 1, 'the registration half runs more than one faceted pipeline');
  const activity = aggregates.find((r) => !r.pipeline.some((st) => st && '$facet' in st));
  assert.equal(activity.model, 'RegisterPublic', 'รายการล่าสุด reads the wrong collection');
  const limit = activity.pipeline.find((st) => st && '$limit' in st);
  assert.ok(limit, 'the activity read is unbounded — it would pull the whole collection');
  assert.equal(limit.$limit, 6, 'the activity read does not fetch the six rows it draws');
  assert.ok(
    activity.pipeline.some((st) => st && '$sort' in st),
    'the activity read does not sort — "newest first" would be collection order',
  );
  assert.ok(
    activity.pipeline.some((st) => st && '$project' in st),
    'the activity read is unprojected — invoice and payment fields would reach the page payload',
  );
});

test('reads: registration-only — 6 reads, and NOT ONE touches a content model', async () => {
  const { reads } = await run(REG);
  assert.equal(reads.length, 6, 'one facet + รายการล่าสุด + the four queue counts');
  assert.equal(reads.filter((r) => r.op === 'aggregate').length, 2);
  assert.equal(
    reads.filter((r) => r.op === 'aggregate').every((r) => r.model === 'RegisterPublic'), true,
    'in-house arrives through $unionWith, not a second read',
  );
  const contentReads = reads.filter((r) => !REGISTRATION_MODELS.has(r.model));
  assert.deepEqual(
    contentReads, [],
    'a content collection was queried for an admin without dashboard_system',
  );
  assert.equal(
    reads.some((r) => r.model === 'WebhookLog'), false,
    'queue (e) is SYSTEM scope — it must not run for a registration-only caller',
  );
});

test('reads: system-only — 6 reads, and NOT ONE touches a registration model', async () => {
  const { reads } = await run(SYS);
  assert.equal(reads.length, 6, 'the five content counts plus queue (e), one wave');
  const regReads = reads.filter((r) => REGISTRATION_MODELS.has(r.model));
  assert.deepEqual(
    regReads, [],
    'a registration collection was queried for an admin without '
    + 'dashboard_registrations — this is the assertion that fails when someone '
    + '"fetches everything and filters in the component"',
  );
  assert.equal(reads.some((r) => r.op === 'aggregate'), false, 'the registration facet ran');
  assert.equal(
    reads.filter((r) => r.model === 'WebhookLog').length, 1,
    'queue (e) belongs to this scope and must run',
  );
  assert.equal(
    reads.some((r) => r.model === 'MasterclassRegistration'), false,
    'queue (d) is REGISTRATION scope — masterclass figures must not reach a '
    + 'system-only caller',
  );
});

test('reads: NEITHER scope — ZERO reads, of any collection, of any kind', async () => {
  const { reads, data } = await run(NONE);
  assert.deepEqual(reads, [], 'the no-section state must cost nothing');
  assert.equal(reads.length, 0);
  assert.deepEqual(data.scopes, NONE);
});

test('reads: a system-only admin pays ONE wave — E1 measured three', async () => {
  // The claim in the round brief, asserted as the thing that makes it true: all
  // five content counts are launched before any of them resolves. A sequential
  // implementation would show a strictly increasing read log per await; a
  // parallel one records all five before the first promise settles.
  const { models, reads } = spyModels();
  const promise = buildDashboardMetrics({ scopes: SYS, range: 'all', models, now: NOW });
  // Nothing has awaited yet — Promise.all has already called all six. Round E3
  // added queue (e) to this half and put it in the SAME wave as the five content
  // counts rather than after them: one more parallel read, not one more trip.
  assert.equal(reads.length, 6, `${reads.length} reads issued synchronously, expected 6`);
  await promise;
  assert.equal(reads.length, 6, 'a second wave fired after the first resolved');
});

// ── 4. THE PAYLOAD — absence, not nulls ─────────────────────────────────────

test('payload: a system-only caller carries NO registration key at all', async () => {
  const { data } = await run(SYS);
  for (const key of ['public', 'inhouse', 'trend', 'statusDist', 'range']) {
    assert.equal(
      key in data, false,
      `'${key}' is in the payload for an admin without dashboard_registrations. `
      + 'Omitted, NOT null: a null key still tells the reader the shape, and a '
      + 'hidden card still ships its number to devtools',
    );
  }
  assert.ok('content' in data);
  assert.deepEqual(data.scopes, SYS);
});

test('payload: a registration-only caller carries NO content key', async () => {
  const { data } = await run(REG);
  assert.equal('content' in data, false);
  assert.ok('public' in data && 'inhouse' in data && 'trend' in data && 'statusDist' in data);
  assert.deepEqual(data.scopes, REG);
});

test('payload: NO REGISTRATION OR PAYMENT NUMBER survives serialisation for system-only', async () => {
  /**
   * The strong form of test 5 in the round brief: not "the card is absent" but
   * "the NUMBER is absent". Asserted over the SERIALISED payload — the actual
   * bytes a browser would receive — rather than over object keys, because a
   * figure could hide inside a nested structure no key name gives away.
   *
   * The doubles return 0 for every count, which would make a naive
   * "no digits present" assertion trivially satisfiable. So the registration
   * doubles return DISTINCTIVE values instead, and the assertion is that none of
   * them appears anywhere in the JSON.
   */
  const reads = [];
  const SENTINEL = 918273;
  const models = Object.fromEntries(MODEL_NAMES.map((n) => [n, {
    collection: { name: COLLECTION_OF[n] },
    countDocuments(filter) {
      reads.push({ model: n, filter });
      return Promise.resolve(REGISTRATION_MODELS.has(n) ? SENTINEL : 4);
    },
    // A facet carrying the sentinel in EVERY branch — the counts, the previous
    // period, the series and the corpus bounds — so no branch can be the one
    // that quietly leaks.
    aggregate() {
      reads.push({ model: n, op: 'aggregate' });
      return Promise.resolve([{
        current:  [{ _id: { source: 'public', status: 'pending' }, n: SENTINEL }],
        previous: [{ _id: { source: 'public', status: 'pending' }, n: SENTINEL }],
        series:   [{ _id: { source: 'public', key: '2026-01' }, n: SENTINEL }],
        bounds:   [{ _id: null, min: new Date('2026-01-01'), max: new Date('2026-01-02'), n: SENTINEL }],
      }]);
    },
  }]));

  const data = await buildDashboardMetrics({ scopes: SYS, range: 'all', models, now: NOW });
  const wire = JSON.stringify(data);

  assert.equal(
    wire.includes(String(SENTINEL)), false,
    `a registration figure reached the wire: ${wire}`,
  );
  // And the control: the same sentinel DOES reach the wire when the scope is
  // held, so the assertion above is about the scope and not about the sentinel
  // being unreachable in general.
  const allowed = await buildDashboardMetrics({ scopes: REG, range: 'all', models, now: NOW });
  assert.equal(JSON.stringify(allowed).includes(String(SENTINEL)), true);
});

// ── 5. the range parameter is inert without the scope ───────────────────────

test('range: a system-only caller gets byte-identical output for every range', async () => {
  const results = [];
  for (const range of ['today', 'week', 'month', 'all']) {
    const { data, reads } = await run(SYS, range);
    results.push({ wire: JSON.stringify(data), count: reads.length, filters: reads.map((r) => r.filter) });
  }
  const [first, ...rest] = results;
  for (const r of rest) {
    assert.equal(r.wire, first.wire, 'the payload changed with the range');
    assert.equal(r.count, first.count, 'the read count changed with the range');
    assert.deepEqual(r.filters, first.filters, 'a query filter changed with the range');
  }
  // And the range never appears in the payload at all for them.
  assert.equal(first.wire.includes('"range"'), false);
});

test('range: a CUSTOM window changes nothing for a system-only caller either', async () => {
  /**
   * E4.4's scope requirement, and test 8. The custom range is a second way to
   * ask for a window, so it is a second way the range control could have leaked
   * into a half it does not own.
   *
   * Compared against the SAME caller with no window at all — byte-identical
   * payload AND the same read count — rather than against an expectation typed
   * out here, so the assertion is that the parameter is inert rather than that
   * the output happens to match a string somebody wrote down.
   *
   * The reversed and absurd pairs are included deliberately: a system-only
   * caller must reach neither the happy path nor the validation's fallback, and
   * both must cost the same nothing.
   */
  const baseline = await runWindow(SYS, 'all', null);

  for (const custom of [
    { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-31T00:00:00Z') },
    { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-09-05T00:00:00Z') },
  ]) {
    const withWindow = await runWindow(SYS, 'all', custom);
    assert.equal(
      JSON.stringify(withWindow.data), JSON.stringify(baseline.data),
      'the payload moved for a caller who cannot see registrations',
    );
    assert.equal(
      withWindow.reads.length, baseline.reads.length,
      'the READ COUNT moved — a registration query fired for a system-only caller',
    );
    assert.deepEqual(
      withWindow.reads.map((r) => r.filter), baseline.reads.map((r) => r.filter),
      'a query filter moved',
    );
  }
});

test('range: a registration-only caller DOES see a custom window take effect', async () => {
  // The other direction, so the test above is about the SCOPE rather than about
  // `custom` being ignored everywhere.
  const preset = await runWindow(REG, 'all', null);
  const custom = await runWindow(REG, 'all', {
    from: new Date('2026-08-01T00:00:00Z'), to: new Date('2026-08-31T00:00:00Z'),
  });
  assert.notEqual(JSON.stringify(custom.data), JSON.stringify(preset.data));
  assert.equal(custom.data.range, 'custom', 'the payload does not report the custom window');
  assert.equal(preset.data.range, 'all');
});

/** The `$match` a facet branch applies, or null when the branch is unbounded. */
function branchMatch(pipeline, branch) {
  const facet = pipeline.find((s) => s.$facet)?.$facet;
  const stages = facet?.[branch];
  if (!stages) return undefined; // the branch is absent entirely
  return stages.find((s) => s.$match)?.$match ?? null;
}

test('range: a registration-only caller DOES see the range change the query', async () => {
  /**
   * The other direction, so the test above is about the scope rather than about
   * `range` having no effect anywhere.
   *
   * Read off the PIPELINE now, not off a `countDocuments` filter: round E3
   * folded the nine counts into one `$facet`, so the window lives inside the
   * `current` branch's own `$match` rather than in a filter argument. Asserting
   * the old shape would have gone on passing against a pipeline that had
   * silently stopped filtering — the branch simply would not be found.
   */
  const today = await run(REG, 'today');
  const all   = await run(REG, 'all');
  assert.notEqual(JSON.stringify(today.data.range), JSON.stringify(all.data.range));

  const todayMatch = branchMatch(today.reads.find((r) => r.op === 'aggregate').pipeline, 'current');
  const allMatch   = branchMatch(all.reads.find((r) => r.op === 'aggregate').pipeline, 'current');
  assert.ok(todayMatch?.createdAt?.$gte instanceof Date, 'today must bound createdAt');
  assert.ok(todayMatch?.createdAt?.$lte instanceof Date, 'and must bound the far end too');
  assert.equal(allMatch, null, "'all' is unbounded — E1 measured that and it is unchanged");
});

test('range: the pipeline unions in-house rather than reading it separately', () => {
  // The claim E3.3 makes about cost: the in-house series is one `$unionWith`,
  // not a second query per series. Asserted on the pipeline, because a second
  // read would show up in the read count and a second SERIES would not.
  //
  // ── IT WAS `aggregates.length === 1` UNTIL ROUND E5 ──────────────────────
  // E5.3 added รายการล่าสุด, which is a second aggregate on the same model and
  // made a bare count of aggregations the wrong instrument — it would have gone
  // red on a change that costs one small limited read and adds no series at all.
  // The CLAIM is unchanged and is about the FACET: exactly one faceted pipeline
  // runs, and in-house reaches it through $unionWith. The read count itself is
  // asserted where it belongs, in the three `reads:` tests above, which is where
  // a genuine second series would be caught.
  return run(REG, 'week').then(({ reads }) => {
    const aggregates = reads
      .filter((r) => r.op === 'aggregate')
      .filter((r) => r.pipeline.some((st) => st && '$facet' in st));
    assert.equal(aggregates.length, 1, 'more than one faceted aggregation ran');
    const union = aggregates[0].pipeline.find((s) => s.$unionWith);
    assert.ok(union, 'no $unionWith in the pipeline — where does in-house come from?');
    assert.equal(
      union.$unionWith.coll, 'register_inhouse',
      'the collection name must come off the model, not a literal — a double '
      + 'without `collection.name` would let this pass while production sent undefined',
    );
  });
});

test('range: dateRange is unchanged — all four arms, `all` still unbounded', () => {
  assert.equal(dateRange('all').from, null);
  for (const range of ['today', 'week', 'month']) {
    assert.ok(dateRange(range).from instanceof Date, `${range} must have a start`);
    assert.ok(dateRange(range).from <= dateRange(range).to);
  }
});

// ── 6. CONTROL: the read-count assertions can fail ──────────────────────────

test('CONTROL: a fetch-everything-then-filter implementation is caught', async () => {
  /**
   * Breaking the real module to prove the assertions bite would redden the whole
   * file, so the defect is reconstructed here instead: run BOTH scopes (which is
   * what "fetch everything" does) and then delete the unauthorised keys (which is
   * what "filter in the component" does). The result satisfies every payload
   * assertion above and fails the read-count ones — which is exactly the split
   * the round brief predicted, and the reason both kinds are written.
   */
  const { data, reads } = await run(BOTH);
  const filtered = { ...data, scopes: SYS };
  delete filtered.public; delete filtered.inhouse;
  delete filtered.trend;  delete filtered.statusDist; delete filtered.range;

  // The payload check is satisfied by the impostor …
  for (const key of ['public', 'inhouse', 'trend', 'statusDist', 'range']) {
    assert.equal(key in filtered, false);
  }
  // … and the read count is not.
  assert.notEqual(reads.length, 5, 'the impostor still paid for 15 reads');
  assert.ok(
    reads.some((r) => REGISTRATION_MODELS.has(r.model)),
    'and it still queried the registration collections',
  );
});

test('CONTROL: the spy would notice a read it was not told about', () => {
  const { models, reads } = spyModels();
  models.RegisterPublic.countDocuments({ sentinel: true });
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0], { model: 'RegisterPublic', op: 'countDocuments', filter: { sentinel: true } });
});
