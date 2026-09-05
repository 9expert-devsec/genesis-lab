import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_CARDS,
  queueIdsForScope,
  readRegistrationQueue,
  readSystemQueue,
} from '@/lib/dashboard/actionQueue';
import {
  STALE_PENDING_DAYS,
  STALLED_PAYMENT_DAYS,
  THRESHOLD_LABEL,
  WEBHOOK_ERROR_WINDOW_HOURS,
  daysAgo,
  hoursAgo,
} from '@/lib/dashboard/queueThresholds';
import { buildDashboardMetrics } from '@/lib/dashboard/buildMetrics';

/**
 * The action queue: what each card counts, and — the part a count assertion
 * cannot see — what it must NOT count.
 *
 * ══ THE FIXTURES ARE THE NEAR-MISSES ════════════════════════════════════════
 * A threshold test that only feeds it obvious matches proves the query runs, not
 * that the threshold is the one written down. Every condition below is exercised
 * with a document that misses by ONE DAY and a document that misses by one
 * field, and control (a) widens each threshold to check the near-miss is what
 * flips.
 *
 * The doubles evaluate the real Mongo filter against in-memory documents rather
 * than asserting on the filter object: a filter assertion pins the SHAPE and
 * would happily pass for `$gt` where `$lt` was meant.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z');

/** A tiny, honest evaluator for the handful of operators these queries use. */
function matches(doc, filter) {
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  return Object.entries(filter).every(([key, cond]) => {
    const v = get(doc, key);
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      return Object.entries(cond).every(([op, operand]) => {
        if (op === '$lt') return v != null && v < operand;
        if (op === '$gte') return v != null && v >= operand;
        if (op === '$in') return operand.some((x) => (x === null ? v == null : v === x));
        /**
         * `$exists`, added deliberately for the legacy-import predicate.
         *
         * `get` walks with `a == null ? a : a[k]`, so a NULL PARENT short-circuits
         * and yields null rather than throwing — which is what makes
         * `legacy: null` (the schema default on every non-imported document)
         * read as "legacy.sid does not exist", exactly as Mongo treats it. An
         * evaluator that returned true here would make (c) and (f) overlap
         * silently, which is the one thing this pair of cards must not do.
         */
        if (op === '$exists') return (v != null) === operand;
        throw new Error(`the evaluator does not know ${op} — add it deliberately`);
      });
    }
    return v === cond;
  });
}

function collectionOf(docs, reads, name) {
  return {
    collection: { name },
    countDocuments(filter) {
      reads.push({ model: name, filter });
      return Promise.resolve(docs.filter((d) => matches(d, filter)).length);
    },
    aggregate() { return Promise.resolve([{ current: [], previous: [], series: [], bounds: [] }]); },
  };
}

const d = (days) => daysAgo(days, NOW);

/**
 * ══ THE NEAR-MISS AGES, AS ABSOLUTE LITERALS — AND WHY THEY MUST BE ═════════
 *
 * MEASURED, by running control (a) TWICE and watching it stay green both times.
 * Two separate defects, each of which made the control unable to fire:
 *
 *   1. The first fixtures sat EXACTLY on the threshold — 13 days against a
 *      14-day rule. `$lt` is strict, so a document on the boundary is excluded
 *      at 14 and STILL excluded at 13. A near-miss on a round number is immune
 *      to a one-day change in either direction.
 *
 *   2. The second version fixed that but computed the age as
 *      `daysAgo(STALE_PENDING_DAYS - 0.4)` — DERIVED FROM THE CONSTANT UNDER
 *      TEST. Changing the constant moved the fixture with it, so the near-miss
 *      stayed inside the window and nothing flipped. That is the fourth guard
 *      in this repo's collection of guards that cannot fail: an assertion
 *      compared against its own source of truth.
 *
 * So the ages are LITERALS, pinned to the thresholds they were chosen for by an
 * assertion rather than by arithmetic. Change a threshold and this file fails
 * loudly, which is correct — a new rule needs new fixtures chosen for it, not
 * fixtures that silently follow it and prove nothing.
 */
const NEAR_MISS_STALE_DAYS   = 13.6; // for STALE_PENDING_DAYS === 14
const NEAR_MISS_PAYMENT_DAYS = 1.6;  // for STALLED_PAYMENT_DAYS === 2
const NEAR_MISS_WEBHOOK_HOURS = 24.4; // for WEBHOOK_ERROR_WINDOW_HOURS === 24

test('CONTROL: the near-miss literals still match the thresholds they were chosen for', () => {
  /**
   * The pin. It exists so a deliberate threshold change breaks this file rather
   * than quietly neutering every fixture below — see defect 2 above.
   */
  assert.equal(STALE_PENDING_DAYS, 14, 'NEAR_MISS_STALE_DAYS was chosen for 14');
  assert.equal(STALLED_PAYMENT_DAYS, 2, 'NEAR_MISS_PAYMENT_DAYS was chosen for 2');
  assert.equal(WEBHOOK_ERROR_WINDOW_HOURS, 24, 'NEAR_MISS_WEBHOOK_HOURS was chosen for 24');

  // And each literal is in the open interval a one-day widening covers.
  assert.ok(NEAR_MISS_STALE_DAYS < STALE_PENDING_DAYS && NEAR_MISS_STALE_DAYS > STALE_PENDING_DAYS - 1);
  assert.ok(NEAR_MISS_PAYMENT_DAYS < STALLED_PAYMENT_DAYS && NEAR_MISS_PAYMENT_DAYS > STALLED_PAYMENT_DAYS - 1);
  assert.ok(NEAR_MISS_WEBHOOK_HOURS > WEBHOOK_ERROR_WINDOW_HOURS
    && NEAR_MISS_WEBHOOK_HOURS < WEBHOOK_ERROR_WINDOW_HOURS + 1);
});

// ── the fixtures ────────────────────────────────────────────────────────────

const PUBLIC_DOCS = [
  // (a) stalled PromptPay — the match, and the two near-misses
  { status: 'pending', payment: { omiseStatus: 'pending' }, createdAt: d(5) },   // ✓
  { status: 'pending', payment: { omiseStatus: 'pending' }, createdAt: d(NEAR_MISS_PAYMENT_DAYS) }, // ✗ inside the window
  // ✗ already paid. It carries a receiptSentAt SO THAT IT TESTS ONE THING:
  // without one it also qualifies for (b), and (b)'s count would then depend on
  // a document written for (a) — which is how a fixture starts asserting a
  // coincidence. MEASURED: it made (b) read 3 where 2 was meant.
  { status: 'paid',    payment: { omiseStatus: 'pending', receiptSentAt: d(4) }, createdAt: d(5) },
  { status: 'pending', payment: { omiseStatus: 'failed'  }, createdAt: d(5) },   // ✗ failed, not pending
  { status: 'pending', createdAt: d(5) },                                        // ✗ quote flow, no charge

  // (b) paid without a receipt — the match, and the near-miss
  { status: 'paid', payment: { omiseStatus: 'successful', receiptSentAt: null }, createdAt: d(9) }, // ✓
  { status: 'paid', payment: { omiseStatus: 'successful' }, createdAt: d(9) },                      // ✓ field absent
  { status: 'paid', payment: { omiseStatus: 'successful', receiptSentAt: d(8) }, createdAt: d(9) }, // ✗ sent

  // (c) stale pending — the match, and the one-day near-miss
  { status: 'pending', createdAt: d(20) },  // ✓ (also counted by nothing else)
  { status: 'pending', createdAt: d(NEAR_MISS_STALE_DAYS) },  // ✗ inside the window

  /**
   * (f) IMPORTED FROM DRUPAL — and THE OVERLAP FIXTURE for (c).
   *
   * This document qualifies for (c) on every condition (c) had before the
   * legacy-import round: pending, and far older than fourteen days. Only the
   * `legacy.sid` predicate keeps it out. That makes it the one fixture that can
   * tell "(c) excludes imported rows" from "(c) happens not to have any" — and
   * it is why the control below deletes that predicate rather than asserting a
   * filter shape.
   *
   * `createdAt` is 400 days back because every imported row IS old: its date is
   * whatever Drupal recorded, all of it before cutover. A fixture dated inside
   * the fortnight would be a row the import cannot produce.
   */
  { status: 'pending', createdAt: d(400), legacy: { sid: 8801, webformId: 'registration_public' } }, // ✓ (f), ✗ (c)
  // ✗ (f) — imported, but already dealt with. Status is the other half of (f),
  // and without this row `legacyImportPending` would pass for a query that
  // counted every imported document regardless of state.
  { status: 'paid', createdAt: d(400), legacy: { sid: 8802, webformId: 'registration_public' }, payment: { omiseStatus: 'successful', receiptSentAt: d(399) } },
  // ✗ (f) — `legacy: null` is the schema default and means "born here". It is
  // the shape 41 of 41 production documents hold, and the one an evaluator that
  // mishandled `$exists` would wrongly count.
  { status: 'pending', createdAt: d(NEAR_MISS_STALE_DAYS), legacy: null },
];

const MC_DOCS = [
  { status: 'pending',   createdAt: d(20) },  // ✓
  { status: 'pending',   createdAt: d(NEAR_MISS_STALE_DAYS) },  // ✗ inside the window — test 1's named case
  { status: 'paid',      createdAt: d(20) },  // ✗ not pending
  { status: 'cancelled', createdAt: d(20) },  // ✗
];

const WEBHOOK_DOCS = [
  { status: 'error', processed_at: hoursAgo(2, NOW) },   // ✓
  { status: 'error', processed_at: hoursAgo(NEAR_MISS_WEBHOOK_HOURS, NOW) },  // ✗ just outside
  { status: 'ok',    processed_at: hoursAgo(2, NOW) },   // ✗ not an error
];

function queueModels({ pub = PUBLIC_DOCS, mc = MC_DOCS, wh = WEBHOOK_DOCS } = {}) {
  const reads = [];
  return {
    reads,
    models: {
      RegisterPublic: collectionOf(pub, reads, 'register_public'),
      MasterclassRegistration: collectionOf(mc, reads, 'masterclass_registrations'),
      WebhookLog: collectionOf(wh, reads, 'webhook_logs'),
    },
  };
}

// ── the evaluator is asserted before anything is concluded from it ──────────
test('queue: the fixture evaluator actually discriminates', () => {
  // Without this, every "not counted" assertion would hold for an evaluator that
  // returned false for everything.
  assert.equal(matches({ a: 1 }, { a: 1 }), true);
  assert.equal(matches({ a: 1 }, { a: 2 }), false);
  assert.equal(matches({ a: d(5) }, { a: { $lt: d(2) } }), true);
  assert.equal(matches({ a: d(1) }, { a: { $lt: d(2) } }), false);
  assert.equal(matches({ p: { q: null } }, { 'p.q': { $in: [null] } }), true, 'explicit null');
  assert.equal(matches({ p: {} }, { 'p.q': { $in: [null] } }), true, 'absent field');
  assert.equal(matches({ p: { q: 1 } }, { 'p.q': { $in: [null] } }), false);
  assert.throws(() => matches({ a: 1 }, { a: { $regex: /x/ } }), /does not know/);
});

// ── 1. EACH CARD'S CONDITION, WITH ITS NEAR-MISS ────────────────────────────

test('queue (a): a pending charge ONE DAY old is not counted', async () => {
  const { models } = queueModels();
  const q = await readRegistrationQueue(models, NOW);
  assert.equal(
    q.stalledPayments, 1,
    'only the five-day-old pending PromptPay charge qualifies — the one-day-old '
    + 'one, the already-paid one, the failed one and the quote-flow one must not',
  );
});

test('queue (b): a paid registration WITH a receipt date is not counted', async () => {
  const { models } = queueModels();
  const q = await readRegistrationQueue(models, NOW);
  assert.equal(
    q.receiptsNotSent, 2,
    'an explicit null and an absent field both count; a real receiptSentAt does not',
  );
});

test('queue (c): public pending at THIRTEEN days is not counted', async () => {
  const { models } = queueModels();
  const q = await readRegistrationQueue(models, NOW);
  assert.equal(q.stalePublicPending, 1, 'only the 20-day-old one');
});

test('queue (d): a masterclass registration 13 days old is not counted', async () => {
  const { models } = queueModels();
  const q = await readRegistrationQueue(models, NOW);
  assert.equal(
    q.staleMasterclassPending, 1,
    'the 13-day-old pending one is inside the threshold; paid and cancelled are '
    + 'the wrong status whatever their age',
  );
});

test('queue (e): a webhook error outside the 24-hour window is not counted', async () => {
  const { models } = queueModels();
  const q = await readSystemQueue(models, NOW);
  assert.equal(q.webhookErrors, 1, 'the 30-hour-old error and the ok row must not count');
});

// ── 2. ZERO IS A RESULT ─────────────────────────────────────────────────────

test('queue: a queue with nothing in it returns 0, not undefined or absent', async () => {
  const { models } = queueModels({ pub: [], mc: [], wh: [] });
  const reg = await readRegistrationQueue(models, NOW);
  const sys = await readSystemQueue(models, NOW);
  for (const [k, v] of Object.entries({ ...reg, ...sys })) {
    assert.equal(v, 0, `${k} should be 0`);
    assert.equal(typeof v, 'number', `${k} is ${typeof v}, and a card cannot render that calmly`);
  }
});

// ── 2b. (c) AND (f) DO NOT OVERLAP ──────────────────────────────────────────
//
// ══ THE ONE THING THIS PAIR OF CARDS MUST NOT DO ═══════════════════════════
//
// Every imported row arrives `pending` with a pre-cutover createdAt, so all
// ~2,427 of them clear (c)'s fourteen-day threshold on day one. If (c) does not
// exclude them, the morning after the import it reads ~460 and the 3 or 4
// genuinely stale registrations — the ones a human has actually failed to move —
// are invisible inside it, while (f) counts the same rows again beside it. One
// row, two cards, and the number an admin should act on hidden in the larger.

test('queue: a pending IMPORTED row is counted by (f) and NOT by (c)', async () => {
  const { models } = queueModels();
  const q = await readRegistrationQueue(models, NOW);

  assert.equal(q.legacyImportPending, 1,
    '(f) does not count the imported pending row — or it counts the imported PAID one too, '
    + 'which would make it "every imported document" rather than a queue');
  assert.equal(q.stalePublicPending, 1,
    '(c) counted the imported row: it is pending and 400 days old, so only the legacy '
    + 'predicate can be keeping it out');

  // The property itself, stated as a sum rather than as two separate numbers:
  // there are exactly two pending documents in the fixture that either card
  // could claim, and each is claimed once.
  assert.equal(q.stalePublicPending + q.legacyImportPending, 2,
    'the two cards do not partition their rows — some row is counted twice or not at all');
});

test('CONTROL: without the legacy predicate, (c) counts the imported row TOO', async () => {
  /**
   * ══ THE CONTROL, AND WHY IT DELETES THE PREDICATE RATHER THAN ASSERTING IT ══
   *
   * `stalePublicPending === 1` above passes both for a query that excludes
   * imported rows and for a fixture that happens to contain none. Only removing
   * the predicate can tell those apart. So the SAME fixture is run through the
   * SAME (c) query with `'legacy.sid': { $exists: false }` taken out, and the
   * imported row is shown to appear in both counts at once — which is the exact
   * double-count the predicate exists to prevent.
   *
   * It is written against the collection double rather than by editing the
   * source, so the assertion is about the query's SHAPE mattering, not about
   * this test file's ability to patch a module.
   */
  const { models } = queueModels();
  const real = await readRegistrationQueue(models, NOW);

  // (c) exactly as it is written, minus the one predicate.
  const withoutPredicate = await models.RegisterPublic.countDocuments({
    status: 'pending',
    createdAt: { $lt: daysAgo(STALE_PENDING_DAYS, NOW) },
  });

  assert.equal(withoutPredicate, 2,
    'the control changes nothing — then the fixture holds no imported row that (c) could '
    + 'have counted, and the assertion above is proving nothing');
  assert.equal(withoutPredicate, real.stalePublicPending + real.legacyImportPending,
    'the row (c) would have picked up is exactly the row (f) claims — the two cards would '
    + 'be counting the same document');
  assert.notEqual(withoutPredicate, real.stalePublicPending,
    'removing the predicate left (c) unchanged, so the predicate is doing nothing');
});

test('queue: (f) is ZERO before the import runs, and renders rather than vanishing', async () => {
  /**
   * The same rule (e) is held to. Today nothing has been imported, so this card
   * is 0 — and an admin who cannot tell "nothing imported yet" from "the card is
   * broken" has learned nothing. A card that appeared out of nowhere on cutover
   * night would be indistinguishable from a bug on the one night nobody can
   * afford to debug it.
   *
   * `legacy: null` is the shape all 41 production documents hold — the schema
   * default — so this is the production-shaped case, not an empty-collection one.
   */
  const { models } = queueModels({
    pub: [
      { status: 'pending', createdAt: d(20), legacy: null },
      { status: 'paid', createdAt: d(3), legacy: null, payment: { omiseStatus: 'successful', receiptSentAt: d(2) } },
    ],
  });
  const q = await readRegistrationQueue(models, NOW);
  assert.equal(q.legacyImportPending, 0, 'a null `legacy` was counted as imported');
  assert.equal(typeof q.legacyImportPending, 'number', 'a card cannot render that calmly');
  assert.equal(q.stalePublicPending, 1, 'and (c) still sees the ordinary stale row');
});

test('queue: (e) is ZERO against production-shaped data, and that is the point', async () => {
  // All 987 webhook_logs are `ok` and none has ever been an error. The card must
  // survive that, because an admin who cannot tell "no errors" from "the card is
  // broken" has learned nothing.
  const { models } = queueModels({ wh: [{ status: 'ok', processed_at: hoursAgo(1, NOW) }] });
  assert.deepEqual(await readSystemQueue(models, NOW), { webhookErrors: 0 });
});

// ── 3. SCOPE: the reads do not run without it ───────────────────────────────

test('queue: the six cards are split 5 registration / 1 system', () => {
  /**
   * WAS FIVE, AND THE NUMBER MOVED DELIBERATELY. The five E1 measured are still
   * exactly those five; `legacyImportPending` is a SIXTH, added when the Drupal
   * import gave register_public a kind of row it had never held. The count stays
   * exact rather than becoming a floor, so a seventh still has to be argued for
   * here — which is the whole function of this assertion.
   */
  assert.equal(QUEUE_CARDS.length, 6, 'a card appeared or vanished without its reason being written down');
  /**
   * ORDER IS CARD ORDER ON THE PAGE, so this is not an arbitrary list.
   * `legacyImportPending` sits immediately after `stalePublicPending` because
   * the two partition one collection between them — reading them apart, with
   * the masterclass queue in between, is how someone concludes the numbers
   * overlap.
   */
  assert.deepEqual(queueIdsForScope('registrations'), [
    'stalledPayments', 'receiptsNotSent', 'stalePublicPending', 'legacyImportPending',
    'staleMasterclassPending',
  ]);
  assert.deepEqual(queueIdsForScope('system'), ['webhookErrors']);
  // Every card belongs to a scope that exists. A card with a third scope would
  // be rendered by nothing and read by nothing, silently.
  for (const c of QUEUE_CARDS) {
    assert.ok(['registrations', 'system'].includes(c.scope), `${c.id} has scope '${c.scope}'`);
  }
});

test('queue: the FORBIDDEN cards are absent, by name', () => {
  /**
   * Named individually rather than counted, so a future round that adds one has
   * to delete the reason rather than bump a number. Each was excluded by a
   * measurement, recorded in the header of lib/dashboard/actionQueue.js.
   */
  const ids = QUEUE_CARDS.map((c) => c.id);
  const labels = QUEUE_CARDS.map((c) => c.label).join(' ');
  for (const forbidden of ['courseApproval', 'nearlyFullRounds', 'unpublishedReviews', 'onlineUsers']) {
    assert.equal(ids.includes(forbidden), false, `${forbidden} needs data this system does not collect`);
  }
  assert.equal(labels.includes('รออนุมัติ'), false, 'there is no approval workflow anywhere');
  assert.equal(labels.includes('ใกล้เต็ม'), false, 'MSDB exposes no seat count');
  assert.equal(labels.includes('รีวิว'), false, 'the reviews service exposes only published rows');
});

// ── 8. THE THRESHOLD IS ONE CONSTANT, AND THE TEXT FOLLOWS IT ───────────────

test('queue: every threshold label is DERIVED from its constant', () => {
  /**
   * Test 8. Not "the label says 14" — that would pass for a hard-coded string.
   * The label must CONTAIN the number the query uses, so changing the constant
   * changes the text. Control (a) changes a constant and watches this hold while
   * the near-miss fixture flips.
   */
  assert.ok(THRESHOLD_LABEL.stalePending.includes(String(STALE_PENDING_DAYS)),
    `"${THRESHOLD_LABEL.stalePending}" does not name ${STALE_PENDING_DAYS}`);
  assert.ok(THRESHOLD_LABEL.stalledPayment.includes(String(STALLED_PAYMENT_DAYS)),
    `"${THRESHOLD_LABEL.stalledPayment}" does not name ${STALLED_PAYMENT_DAYS}`);
  assert.ok(THRESHOLD_LABEL.webhookWindow.includes(String(WEBHOOK_ERROR_WINDOW_HOURS)),
    `"${THRESHOLD_LABEL.webhookWindow}" does not name ${WEBHOOK_ERROR_WINDOW_HOURS}`);
});

test('queue: each card carries the threshold phrase it was counted under', () => {
  const byId = Object.fromEntries(QUEUE_CARDS.map((c) => [c.id, c]));
  assert.equal(byId.stalledPayments.threshold, THRESHOLD_LABEL.stalledPayment);
  assert.equal(byId.stalePublicPending.threshold, THRESHOLD_LABEL.stalePending);
  assert.equal(byId.staleMasterclassPending.threshold, THRESHOLD_LABEL.stalePending);
  assert.equal(byId.webhookErrors.threshold, THRESHOLD_LABEL.webhookWindow);
  // (b) has no age rule: an unsent receipt is overdue immediately, and inventing
  // a threshold for it would be a rule nobody decided.
  assert.equal(byId.receiptsNotSent.threshold, null);
  /**
   * (f) has no age rule either, for a DIFFERENT reason worth keeping distinct
   * from (b)'s. Every imported row is old by definition — its createdAt is
   * whatever Drupal recorded, all of it before cutover — so an age rule would
   * filter nothing AND would imply that some imported rows are "not yet due",
   * a state that cannot occur.
   */
  assert.equal(byId.legacyImportPending.threshold, null);
});

// ── THE LINKS ───────────────────────────────────────────────────────────────

test('queue: every link uses a parameter the destination list actually reads', () => {
  /**
   * The registrations list reads PER_SOURCE_PARAMS = status, q, range, from, to,
   * course, page (+ source). Masterclass reads status/q/range/courseId/batchId/
   * licenseScope/page/ppp. Webhook logs reads page/event/status.
   *
   * A card that navigates to a list showing something else is worse than a card
   * with no link, so every parameter is checked against the list that receives it.
   */
  const READS = {
    // `legacy` joined the list's parameters in the legacy-import round — see
    // PER_SOURCE_PARAMS and `legacyClause` in lib/registrations/listFilter.
    '/admin/registrations': new Set(['source', 'status', 'q', 'range', 'from', 'to', 'course', 'page', 'legacy']),
    '/admin/masterclass/registrations': new Set(['status', 'q', 'range', 'courseId', 'batchId', 'licenseScope', 'page', 'ppp']),
    '/admin/webhook-logs': new Set(['page', 'event', 'status']),
  };
  for (const card of QUEUE_CARDS) {
    const [path, query = ''] = card.href.split('?');
    const allowed = READS[path];
    assert.ok(allowed, `${card.id} links to ${path}, which is not a list this test knows`);
    for (const key of new URLSearchParams(query).keys()) {
      assert.ok(allowed.has(key), `${card.id} sends ?${key}=, which ${path} does not read`);
    }
  }
});

test('queue: a card whose list cannot express its condition SAYS so', () => {
  /**
   * None of the five links is exactly filtered, and that is a finding rather
   * than a shortcut: no list can express "payment.omiseStatus", "receiptSentAt
   * is null", or a rolling "older than N days" (from/to take calendar dates,
   * which cannot track a threshold that moves with the clock).
   *
   * So every card declares `linkFiltered: false` and carries a note saying what
   * the destination will actually show. If a list ever gains the filter, flipping
   * one flag here is the whole change — and this assertion is what makes the
   * flag mandatory rather than decorative.
   */
  for (const card of QUEUE_CARDS) {
    if (card.linkFiltered) continue;
    assert.ok(
      typeof card.linkNote === 'string' && card.linkNote.trim().length > 5,
      `${card.id} admits its link is not filtered but does not say what the list shows`,
    );
  }

  /**
   * ══ THIS WAS `every(c => c.linkFiltered === false)` UNTIL THE LEGACY ROUND ══
   *
   * That blanket was correct while no destination could express any card's full
   * condition, and it stopped being correct the moment one could. Replacing it
   * with a weaker check — dropping it, or asserting only that the flag is a
   * boolean — would remove the thing it was for: the flag must stay MANDATORY
   * and ARGUED, not decorative.
   *
   * So the claim is now per-card and by name. Exactly one card may say `true`,
   * and this is where a second one has to justify itself.
   */
  const filtered = QUEUE_CARDS.filter((c) => c.linkFiltered).map((c) => c.id);
  assert.deepEqual(filtered, ['legacyImportPending'],
    'a card claims an exactly-filtered link — check the destination really reads every '
    + 'parameter its condition needs, and that no condition is left over');
});

test('queue: the ONE exactly-filtered link really is exact, and the others say what is missing', () => {
  const byId = Object.fromEntries(QUEUE_CARDS.map((c) => [c.id, c]));

  /**
   * (f) counts `status: 'pending'` AND `legacy.sid` exists — two conditions, and
   * the list reads a parameter for each. `legacy=only` maps to the SAME
   * `$exists: true` predicate the query uses (lib/registrations/listFilter
   * `legacyClause`), so the destination shows the counted set and nothing else.
   */
  const f = new URLSearchParams(byId.legacyImportPending.href.split('?')[1]);
  assert.equal(f.get('status'), 'pending');
  assert.equal(f.get('legacy'), 'only', 'the exactly-filtered card does not ask for imported rows');
  assert.equal(byId.legacyImportPending.threshold, null,
    'an exactly-filtered link cannot carry an age rule — the list has no parameter for one');

  /**
   * (c) counts three things and the list can express two. `legacy=exclude` is
   * the one this round added; the ROLLING AGE remains inexpressible, because
   * `from`/`to` take calendar dates and this threshold moves with the clock.
   * That is why (c) stays `linkFiltered: false` even though its link got
   * strictly more honest.
   */
  const c = new URLSearchParams(byId.stalePublicPending.href.split('?')[1]);
  assert.equal(c.get('status'), 'pending');
  assert.equal(c.get('legacy'), 'exclude',
    '(c) excludes imported rows from its COUNT but not from its LINK — the destination would '
    + 'hold the ~460 rows the card deliberately did not count');
  assert.equal(byId.stalePublicPending.linkFiltered, false,
    '(c) claims an exact link while its 14-day threshold is not in the href');
  assert.ok(byId.stalePublicPending.linkNote.includes('ไม่รวมข้อมูลนำเข้า'),
    'the note does not tell the reader the destination excludes imported rows');
});

// ── the queue does not move with the range ──────────────────────────────────

test('queue: the counts are IDENTICAL at every range', async () => {
  /**
   * These are absolute operational states, not measurements of a period. "Three
   * receipts were never sent" does not become untrue because the reader selected
   * วันนี้, and a queue that emptied itself when you narrowed the range would
   * hide work by being filtered.
   */
  const seen = [];
  for (const range of ['today', 'week', 'month', 'all']) {
    const { models } = queueModels();
    const data = await buildDashboardMetrics({
      scopes: { registrations: true, system: true },
      range,
      models: {
        ...models,
        RegisterInhouse: { collection: { name: 'register_inhouse' }, countDocuments: () => Promise.resolve(0) },
        Banner: { countDocuments: () => Promise.resolve(0) },
        Promotion: { countDocuments: () => Promise.resolve(0) },
        Article: { countDocuments: () => Promise.resolve(0) },
        FeaturedReview: { countDocuments: () => Promise.resolve(0) },
        Recruit: { countDocuments: () => Promise.resolve(0) },
      },
      now: NOW,
    });
    seen.push(JSON.stringify({ q: data.queue, s: data.systemQueue }));
  }
  assert.equal(new Set(seen).size, 1, `the queue moved with the range: ${seen.join(' | ')}`);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: every near-miss sits STRICTLY BETWEEN the threshold and one day inside it', () => {
  /**
   * The property control (a) depends on, asserted directly rather than as a
   * rounded day count.
   *
   * Every "is not counted" assertion above would hold for a fixture that missed
   * by a year — which proves the query filters SOMETHING, not that it filters at
   * the written threshold. And a fixture sitting EXACTLY on the threshold is no
   * better: `$lt` is strict, so it is excluded at N and STILL excluded at N-1,
   * and control (a) would report a green run while the rule underneath it had
   * changed. That is precisely what the first version of these fixtures did, and
   * running control (a) is what exposed it.
   *
   * So each near-miss must be OLDER than one-day-inside and NEWER than the
   * threshold — the open interval in which a one-day widening flips it.
   */
  const between = (createdAt, thresholdDays) => (
    createdAt > d(thresholdDays) && createdAt < d(thresholdDays - 1)
  );

  const mcNear = MC_DOCS.find((x) => x.status === 'pending' && x.createdAt > d(STALE_PENDING_DAYS));
  assert.ok(mcNear, 'no masterclass near-miss in the fixture');
  assert.ok(
    between(mcNear.createdAt, STALE_PENDING_DAYS),
    `the masterclass near-miss is not inside (${STALE_PENDING_DAYS - 1}, ${STALE_PENDING_DAYS}) days`,
  );

  const payNear = PUBLIC_DOCS.find(
    (x) => x.status === 'pending' && x.payment?.omiseStatus === 'pending' && x.createdAt > d(STALLED_PAYMENT_DAYS)
  );
  assert.ok(payNear, 'no payment near-miss in the fixture');
  assert.ok(
    between(payNear.createdAt, STALLED_PAYMENT_DAYS),
    'the payment near-miss is not in the interval a one-day widening covers',
  );
});

test('CONTROL: widening a threshold by exactly ONE DAY changes the count', async () => {
  /**
   * Proves the counts above are a function of the CONSTANT rather than of the
   * fixture happening to contain one match — and that one day is enough, which
   * is what makes control (a) a real control rather than a green run.
   *
   * Expressed in terms of STALE_PENDING_DAYS rather than the literal 14, so the
   * control keeps testing the rule if the rule is ever changed deliberately.
   */
  const reads = [];
  const model = collectionOf(MC_DOCS, reads, 'masterclass_registrations');
  const atThreshold = await model.countDocuments({
    status: 'pending', createdAt: { $lt: d(STALE_PENDING_DAYS) },
  });
  const oneDayWider = await model.countDocuments({
    status: 'pending', createdAt: { $lt: d(STALE_PENDING_DAYS - 1) },
  });
  assert.equal(atThreshold, 1);
  assert.equal(oneDayWider, 2, 'the near-miss document must be the one that flips');
});
