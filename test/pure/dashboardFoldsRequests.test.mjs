import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';
import { REQUEST_KEY_EXPR } from '@/lib/registrations/foldRequests';
import { requestStatusExpr } from '@/lib/registrations/requestStatus';

/**
 * ══ THE DASHBOARD COUNTS REQUESTS, NOT LEGS ═════════════════════════════════
 *
 * A three-course bundle is ONE registration request written as three rows.
 * /admin/registrations folds them and shows one row. Until this round the
 * dashboard counted documents, so the same purchase read 1 on one screen and 3
 * on the other with nothing on either explaining which was right.
 *
 * ══ WHY THIS FILE ASSERTS THE PIPELINE OBJECT AND NOT THE SOURCE TEXT ═══════
 *
 * The guarantee used to live in test/fs/registrationsFoldWiring as three
 * `assert.match` calls against `src/lib/actions/dashboard.js`. Those three
 * PASSED for a day against a file that could not compile, because a cherry-pick
 * had concatenated two versions of the module and left the folding code
 * unreachable: nothing read its locals, and the function returned a payload
 * built somewhere else entirely. A regex matches text, and text survives in
 * dead code.
 *
 * So the subject here is the PIPELINE THE REAL CODE BUILDS. `buildDashboardMetrics`
 * runs against counting doubles that capture the array it hands to `aggregate()`,
 * and every assertion below reads that captured object. It cannot pass on dead
 * code, because a dead branch constructs nothing — the object only exists if the
 * code that builds it executed.
 *
 * ── WHAT THIS STILL CANNOT SEE, NAMED RATHER THAN IMPLIED ─────────────────
 * This is not a behavioural test and does not claim to be. Nothing in `npm test`
 * can execute a `$facet`: the doubles record pipelines, `test/fakeDb.mjs` has no
 * `aggregate` at all, and the only aggregation engine in the project is a real
 * MongoDB behind `test/smoke.mjs`, which is deliberately not part of this suite.
 * So "a three-leg bundle yields a total of 1" is asserted STRUCTURALLY here —
 * the stages that produce that number are present and are built from the shared
 * expressions — and is confirmed against real data only by the smoke tier or by
 * looking at the page. That gap is real and is why the stages are compared
 * against the imported expressions rather than by shape: if the dashboard and
 * the list ever fold by different rules, that is caught here even though the
 * arithmetic is not run.
 *
 * ── TWO KINDS OF COMPARISON, AND THE DIFFERENCE IS NOT COSMETIC ────────────
 * `REQUEST_KEY_EXPR` is compared by IDENTITY (`assert.equal`, `===`). It is a
 * frozen exported singleton, so the pipeline can and must carry the very object
 * the list imports. This was measured: a hand-written `$ifNull` copy of the same
 * shape is accepted by `assert.deepEqual` and rejected by identity, and "not a
 * second copy" is exactly the claim being made — a duplicate agrees today and
 * drifts the first time one of the two is edited.
 *
 * `requestStatusExpr('$statuses')` cannot be compared that way: it is a FUNCTION
 * returning a fresh object per call, so identity is impossible and deep equality
 * is the strongest available check. It catches a DIFFERENT precedence rule,
 * which is the failure that matters, but it would accept a hand-written literal
 * that happened to match today's `$switch`. That limit is stated rather than
 * hidden; closing it would mean exporting a frozen expression instead of a
 * factory, which is a change to the shared module, not to this test.
 */

const COLLECTION_OF = Object.freeze({
  RegisterPublic: 'register_public',
  RegisterInhouse: 'register_inhouse',
  Banner: 'banners',
  Promotion: 'promotions',
  Article: 'articles',
  FeaturedReview: 'featured_reviews',
  Recruit: 'recruits',
  MasterclassRegistration: 'masterclass_registrations',
  WebhookLog: 'webhook_logs',
});

const EMPTY_FACET = () => [{ current: [], series: [], previous: [], ages: [], bounds: [] }];

const MODEL_NAMES = Object.keys(COLLECTION_OF);

/** Captures the pipeline array each `aggregate()` was actually given. */
function spyModels() {
  const pipelines = [];
  const models = Object.fromEntries(MODEL_NAMES.map((name) => [name, {
    collection: { name: COLLECTION_OF[name] },
    countDocuments: () => Promise.resolve(0),
    aggregate(pipeline) {
      pipelines.push({ model: name, pipeline });
      return Promise.resolve(EMPTY_FACET());
    },
  }]));
  return { models, pipelines };
}

const NOW = new Date('2026-09-05T04:00:00.000Z');
const BOTH = { registrations: true, system: true };

/** The registration `$facet` pipeline, as the real code built it. */
async function facetPipeline(range = 'week') {
  const { models, pipelines } = spyModels();
  await buildDashboardMetrics({ scopes: BOTH, range, models, now: NOW });
  const hit = pipelines.find((p) => p.pipeline.some((st) => st && '$facet' in st));
  assert.ok(hit, 'no $facet pipeline was captured — the registration half did not run, '
    + 'and every assertion below would be vacuous');
  return hit.pipeline;
}

const facetOf = (pipeline) => pipeline.find((st) => st && '$facet' in st).$facet;
const projectionsOf = (pipeline) => {
  const top = pipeline.filter((st) => st && '$project' in st);
  const unioned = pipeline
    .filter((st) => st && '$unionWith' in st)
    .flatMap((st) => (st.$unionWith.pipeline ?? []).filter((s) => s && '$project' in s));
  return [...top, ...unioned];
};

/** Does this branch fold legs into requests before it counts? */
function foldsBeforeCounting(stages) {
  const first = stages.find((st) => st && '$group' in st && st.$group.statuses);
  if (!first) return { ok: false, why: 'no $addToSet stage collecting the legs’ statuses' };
  if (!first.$group.statuses.$addToSet || first.$group.statuses.$addToSet !== '$status') {
    return { ok: false, why: 'the first group does not $addToSet the leg statuses' };
  }
  if (first.$group._id?.reqKey !== '$reqKey') {
    return { ok: false, why: 'the first group does not key on the request' };
  }
  const second = stages[stages.indexOf(first) + 1];
  if (!second || !('$group' in second)) return { ok: false, why: 'nothing resolves the collected set' };
  const status = second.$group._id?.status;
  try {
    assert.deepEqual(status, requestStatusExpr('$statuses'));
  } catch {
    return { ok: false, why: 'the resolve step is not requestStatusExpr over the collected set' };
  }
  return { ok: true, why: '' };
}

// ── the doubles are asserted before anything is concluded from them ─────────

test('the spy captures a real pipeline — the assertions below have a subject', async () => {
  const pipeline = await facetPipeline();
  assert.ok(Array.isArray(pipeline) && pipeline.length >= 3,
    `captured ${pipeline?.length} stages — too few to be the registration pipeline`);
  const branches = Object.keys(facetOf(pipeline));
  assert.ok(branches.includes('current') && branches.includes('series') && branches.includes('bounds'),
    `the facet has branches [${branches}] — not the registration facet`);
});

test('CONTROL: the fold predicate REJECTS the pipeline this round replaced', () => {
  /**
   * The exact pre-port shape — one `$group` on `{source, status}`, counting
   * documents. Without this, `foldsBeforeCounting` could be returning true for
   * anything and every assertion below would be decorative.
   */
  const legacy = [{ $group: { _id: { source: '$source', status: '$status' }, n: { $sum: 1 } } }];
  const verdict = foldsBeforeCounting(legacy);
  assert.equal(verdict.ok, false, 'the leg-counting pipeline was accepted as folding');
  assert.match(verdict.why, /\$addToSet/, `unexpected reason: ${verdict.why}`);

  // …and it rejects a HALF-DONE fold: collects the set, then never resolves it.
  const halfDone = [{ $group: { _id: { source: '$source', reqKey: '$reqKey' }, statuses: { $addToSet: '$status' } } }];
  assert.equal(foldsBeforeCounting(halfDone).ok, false, 'a fold with no resolve step was accepted');

  // …and one that resolves with a HAND-WRITTEN rule instead of the shared one.
  const ownRule = [
    { $group: { _id: { source: '$source', reqKey: '$reqKey' }, statuses: { $addToSet: '$status' } } },
    { $group: { _id: { source: '$_id.source', status: { $arrayElemAt: ['$statuses', 0] } }, n: { $sum: 1 } } },
  ];
  const own = foldsBeforeCounting(ownRule);
  assert.equal(own.ok, false, 'a second, hand-written precedence rule was accepted');
  assert.match(own.why, /requestStatusExpr/, `unexpected reason: ${own.why}`);
});

// ── the key reaches the branches, because the projection carries it ─────────

test('BOTH projections carry the request key, and it IS the shared expression', async () => {
  /**
   * `REQUEST_KEY_EXPR` reads `$bundle.requestId` and `$_id`. The projection
   * drops `_id` and never carried `bundle`, so downstream of it both inputs are
   * gone and no branch could fold if it wanted to. It has to be computed here.
   *
   * IDENTITY, not deep equality and not a regex for `reqKey`. Measured: a
   * hand-written `$ifNull` of the same shape passes `assert.deepEqual` — so deep
   * equality does not express "not a second copy", which is the whole claim.
   * `REQUEST_KEY_EXPR` is a frozen singleton; the pipeline carries the object the
   * list imports, or it carries a duplicate that will drift.
   */
  const projections = projectionsOf(await facetPipeline());
  assert.equal(projections.length, 2,
    `expected a projection for each source, found ${projections.length}`);
  for (const p of projections) {
    assert.equal(p.$project.reqKey, REQUEST_KEY_EXPR,
      'a projection does not compute the request key with the SHARED expression — '
      + 'a structurally identical copy fails here on purpose');
  }
});

test('CONTROL: a hand-written copy of the key is rejected, a deep-equal check would not be', () => {
  /**
   * The control for the assertion above, and the reason it is identity. Both
   * halves matter: the copy must fail the check that is used, and must PASS the
   * weaker one — otherwise "identity is stronger here" is an unproven claim.
   */
  const copy = { $ifNull: ['$bundle.requestId', { $toString: '$_id' }] };
  assert.notEqual(copy, REQUEST_KEY_EXPR, 'the copy is somehow the same object');
  assert.doesNotThrow(() => assert.deepEqual(copy, REQUEST_KEY_EXPR),
    'the copy is not structurally identical, so it does not demonstrate the gap');
  assert.throws(() => assert.equal(copy, REQUEST_KEY_EXPR),
    'identity accepted a copy — the assertion above is not doing what it claims');
});

test('the in-house side projects the key too — or its rows collapse to one', async () => {
  /**
   * In-house registrations carry no `bundle`, so the expression degrades to the
   * document id and every one is its own request. That is correct and is why the
   * in-house numbers do not move. But a MISSING `reqKey` would group the whole
   * source under one null key and report every in-house registration as a single
   * request — a far louder wrong number than the one this round fixes.
   */
  const pipeline = await facetPipeline();
  const union = pipeline.find((st) => st && '$unionWith' in st);
  assert.ok(union, 'the in-house union is gone');
  const inner = (union.$unionWith.pipeline ?? []).find((s) => s && '$project' in s);
  assert.ok(inner, 'the in-house union projects nothing');
  assert.equal(inner.$project.reqKey, REQUEST_KEY_EXPR,
    'the in-house projection omits the request key, or restates it as a copy');
});

// ── every counting branch folds ─────────────────────────────────────────────

for (const branch of ['current', 'series', 'ages']) {
  test(`the ${branch} branch counts requests, not legs`, async () => {
    const verdict = foldsBeforeCounting(facetOf(await facetPipeline())[branch]);
    assert.equal(verdict.ok, true, `the ${branch} branch counts legs: ${verdict.why}`);
  });
}

test('the previous branch folds too — a delta between two rules is not a delta', async () => {
  // `previous` is absent at range `all` by design, so this asks for a range that
  // has one. A percentage comparing folded requests against counted legs would
  // be wrong by the bundle rate and would look plausible.
  const facet = facetOf(await facetPipeline('week'));
  assert.ok(facet.previous, 'the previous branch is missing at range=week');
  const verdict = foldsBeforeCounting(facet.previous);
  assert.equal(verdict.ok, true, `the previous branch counts legs: ${verdict.why}`);
});

test('a request is dated by its FIRST leg, in every branch that dates one', async () => {
  /**
   * The legs of one request are written inside a single transaction milliseconds
   * apart. Taking any leg but the first can push a request submitted at
   * 23:59:59.9 into the following day — drawing it on the wrong trend bar, and
   * ageing it into the wrong histogram bucket.
   */
  const facet = facetOf(await facetPipeline());
  for (const branch of ['series', 'ages']) {
    const fold = facet[branch].find((st) => st && '$group' in st && st.$group.statuses);
    assert.deepEqual(fold.$group.createdAt, { $min: '$createdAt' },
      `the ${branch} branch does not date a request by its first leg`);
  }
});

test('the empty state’s total counts requests as well', async () => {
  /**
   * `bounds` feeds "there are N registrations, the most recent on <date>, none
   * in the window you selected". Left counting documents it would be the one
   * total on the page still counting legs — and it is read precisely when the
   * rest of the screen is empty and there is nothing to compare it against.
   */
  const bounds = facetOf(await facetPipeline()).bounds;
  assert.equal(bounds.length, 2, `bounds has ${bounds.length} stage(s) — it cannot be folding`);
  assert.equal(bounds[0].$group._id?.reqKey, '$reqKey', 'bounds does not group by request first');
  assert.deepEqual(bounds[1].$group.n, { $sum: 1 }, 'bounds does not count the folded groups');
  // min/max survive the fold: the minimum of the per-request minima is the
  // minimum of the legs, so the empty state's DATES are unchanged by this round.
  assert.deepEqual(bounds[1].$group.min, { $min: '$min' }, 'the corpus start is no longer a minimum of minima');
  assert.deepEqual(bounds[1].$group.max, { $max: '$max' }, 'the corpus end is no longer a maximum of maxima');
});

test('CONTROL: the branch walk would notice a branch that vanished', async () => {
  // Guards the loop above: `facetOf(...)[branch]` on a missing branch would be
  // `undefined`, and a predicate that tolerated it would pass for nothing.
  const facet = facetOf(await facetPipeline());
  assert.throws(() => foldsBeforeCounting(facet.doesNotExist),
    'the predicate accepted a branch that is not there');
});
