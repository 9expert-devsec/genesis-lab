import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planPromotion,
  planDemotion,
  planMoveToPosition,
  planBlockNormalization,
  applyPositionPlan,
  isPositioned,
} from '@/lib/articlePositioning';
import { assignArticleRanks } from '@/lib/articleRank';

// Promotion/demotion is the affordance that replaces "type a rank into a box".
// The list is two contiguous blocks — positioned articles by `pinOrder`, then
// everything else by `publishedAt` — so the only expressible targets are
// 1..(block + 1). These tests are stated in terms of the RESULTING RANK rather
// than the raw pinOrder, because the rank is what the admin is actually being
// promised, and it is computed by the shipped ranker rather than restated here.

const art = (over) => ({
  _id: over._id,
  active: true,
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  publishedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

const pinned = (id, order, pub) =>
  art({ _id: id, isPinnedOnArticlePage: true, pinOrder: order, publishedAt: pub ?? '2025-01-01T00:00:00.000Z' });

const rankOf = (list, id) =>
  assignArticleRanks(list).find((a) => a._id === id)?.rank ?? null;

const orderMap = (list) =>
  new Map(list.filter(isPositioned).map((a) => [a._id, a.pinOrder]));

// ── 6 ─────────────────────────────────────────────────────────────────────

test('promoting into a block of N yields rank N+1 and renumbers nobody', () => {
  const block = [
    pinned('p1', 1, '2020-01-01T00:00:00.000Z'),
    pinned('p2', 2, '2021-01-01T00:00:00.000Z'),
    pinned('p3', 3, '2022-01-01T00:00:00.000Z'),
  ];
  const dated = art({ _id: 'newcomer', publishedAt: '2026-06-01T00:00:00.000Z' });
  const list = [...block, dated, art({ _id: 'other', publishedAt: '2026-05-01T00:00:00.000Z' })];

  const N = block.length;
  const before = orderMap(list);
  const plan = planPromotion(list, 'newcomer');
  const after = applyPositionPlan(list, plan);

  assert.equal(
    rankOf(after, 'newcomer'), N + 1,
    `promoting must land at the END of the block (rank ${N + 1}), not the top — the ` +
    'top is a position the admin deliberately chose earlier',
  );

  assert.equal(plan.writes.length, 1, 'exactly one document is touched');
  for (const [id, order] of before) {
    assert.equal(
      after.find((a) => a._id === id).pinOrder, order,
      `existing member ${id} was renumbered — promotion must not disturb the block`,
    );
  }
  // and the incumbents keep the ranks they had
  assert.deepEqual([rankOf(after, 'p1'), rankOf(after, 'p2'), rankOf(after, 'p3')], [1, 2, 3]);
});

test('promotion appends after the HIGHEST pinOrder, not after the count (values need not be contiguous)', () => {
  // A free-number input; 0/5/9 is a legitimate state.
  const list = [pinned('a', 0), pinned('b', 5), pinned('c', 9), art({ _id: 'x' })];
  const after = applyPositionPlan(list, planPromotion(list, 'x'));
  const x = after.find((a) => a._id === 'x');
  assert.ok(x.pinOrder > 9, `expected > 9, got ${x.pinOrder} — count+1 would have been 4 and landed mid-block`);
  assert.equal(rankOf(after, 'x'), 4, 'still rank N+1 in the list users see');
});

// ── 7 ─────────────────────────────────────────────────────────────────────

test('promoting into an EMPTY block yields rank 1', () => {
  const list = [
    art({ _id: 'x', publishedAt: '2024-01-01T00:00:00.000Z' }),
    art({ _id: 'y', publishedAt: '2026-01-01T00:00:00.000Z' }),
  ];
  const after = applyPositionPlan(list, planPromotion(list, 'x'));

  assert.equal(rankOf(after, 'x'), 1, 'the first positioned article is rank 1');
  assert.equal(after.find((a) => a._id === 'x').pinOrder, 1);
  assert.equal(rankOf(after, 'y'), 2, 'and the newer date-ordered article falls in behind it');
});

// ── 8 ─────────────────────────────────────────────────────────────────────

test('demoting leaves the surviving pinOrder values contiguous — no gap behind it', () => {
  const list = [
    pinned('p1', 1, '2020-01-01T00:00:00.000Z'),
    pinned('p2', 2, '2021-01-01T00:00:00.000Z'),
    pinned('p3', 3, '2022-01-01T00:00:00.000Z'),
    pinned('p4', 4, '2023-01-01T00:00:00.000Z'),
    art({ _id: 'd', publishedAt: '2026-01-01T00:00:00.000Z' }),
  ];

  const after = applyPositionPlan(list, planDemotion(list, 'p2'));

  const demoted = after.find((a) => a._id === 'p2');
  assert.equal(isPositioned(demoted), false, 'p2 left the block');
  assert.equal(demoted.pinOrder, 0, 'and its order was cleared');

  const survivors = after.filter(isPositioned).sort((a, b) => a.pinOrder - b.pinOrder);
  assert.deepEqual(
    survivors.map((a) => a.pinOrder), [1, 2, 3],
    'a hole at 2 would inflate the maximum and make every later promotion drift upward',
  );
  assert.deepEqual(
    survivors.map((a) => a._id), ['p1', 'p3', 'p4'],
    'renumbering must preserve the relative order the admin chose',
  );
  assert.deepEqual(
    [rankOf(after, 'p1'), rankOf(after, 'p3'), rankOf(after, 'p4')], [1, 2, 3],
  );
});

test('a demoted article rejoins date ordering in the right place', () => {
  const list = [
    pinned('p1', 1, '2019-01-01T00:00:00.000Z'),
    art({ _id: 'newer', publishedAt: '2026-06-01T00:00:00.000Z' }),
    art({ _id: 'older', publishedAt: '2020-06-01T00:00:00.000Z' }),
  ];
  // p1 is old; once demoted it should sit BELOW `newer` and above `older`.
  const after = applyPositionPlan(list, planDemotion(list, 'p1'));
  assert.deepEqual(
    assignArticleRanks(after).sort((a, b) => a.rank - b.rank).map((a) => a._id),
    ['newer', 'older', 'p1'],
  );
});

// ── controls ──────────────────────────────────────────────────────────────

test('CONTROL: promotion actually moves the article — the fixture is not already sitting at rank N+1', () => {
  // `x` is the OLDER of the two date-ordered articles, so by date it is last.
  // Promoting must lift it above `newer`; if the fixture had `x` already at
  // N+1, this file could not tell a working planner from a no-op one.
  const list = [
    pinned('p1', 1),
    pinned('p2', 2),
    art({ _id: 'newer', publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'x', publishedAt: '2020-01-01T00:00:00.000Z' }),
  ];
  const before = rankOf(list, 'x');
  const after = applyPositionPlan(list, planPromotion(list, 'x'));

  assert.equal(before, 4, 'by date it starts last');
  assert.equal(rankOf(after, 'x'), 3, 'promotion lifts it to the end of the block');
  assert.notEqual(before, rankOf(after, 'x'), 'a no-op planner would leave the rank alone');
  assert.equal(after.find((a) => a._id === 'x').isPinnedOnArticlePage, true);
  assert.equal(rankOf(after, 'newer'), 4, 'and the newer article is pushed down one');
});

test('CONTROL: demotion writes are not a no-op list', () => {
  const list = [pinned('p1', 1), pinned('p2', 2), pinned('p3', 3)];
  const plan = planDemotion(list, 'p1');
  assert.ok(plan.writes.length >= 2, 'demoting the head must renumber the survivors too');
  assert.equal(plan.writes[0]._id, 'p1');
});

test('demotion writes ONLY the survivors that actually move', () => {
  // GAP FOUND WHILE VERIFYING THE b-005 CONTROLS: planDemotion has always had
  // the same minimal-write discipline as renumberWrites, and nothing pinned it
  // — deliberately breaking that guard produced ZERO failures across the whole
  // suite. The control above only asserts `>= 2`, which a plan that writes
  // every row also satisfies.
  //
  // Demoting the TAIL is the case that distinguishes them: both survivors keep
  // the numbers they already hold, so a correct plan touches exactly one row.
  const list = [pinned('p1', 1), pinned('p2', 2), pinned('p3', 3)];
  const plan = planDemotion(list, 'p3');
  assert.deepEqual(
    plan.writes.map((w) => w._id), ['p3'],
    'p1 and p2 keep pinOrder 1 and 2 — writing them again inflates modifiedCount ' +
    'and makes "did this move anything?" unanswerable from the plan',
  );
});

// ── b-005 / b-006: moving, and the block invariant ────────────────────────
//
// `pinOrder` was a free number input: it could write any integer to ONE row
// while knowing nothing about the others, so duplicates and gaps were
// reachable. Production held `1,1,2,3,4,5,6,7,9,10` — one duplicate, one
// missing 8. A duplicate is not cosmetic: the cascade falls through to
// `publishedAt`, so the number the admin typed stops deciding the position, and
// the tie consumes two slots so pinOrder 2 renders as rank 3.
//
// planMoveToPosition always re-emits the block as contiguous 1..M, which makes
// both states unrepresentable rather than merely repaired.
//
// EVERY test below is written against UN-NORMALIZED input where it can be,
// because the repair script runs AFTER this code ships — the code has to be
// correct on the broken data, not on the data the script will produce.

/**
 * The production shape, exactly: a duplicate at 1 and no 8.
 *
 * RETURNED SCRAMBLED, on purpose. If the array arrived already in cascade order
 * then `blockInOrder`'s sort would be doing nothing observable, and the
 * order-preservation control — which works by DELETING that sort — would stay
 * green while proving nothing. Same discipline as the "fixtures are supplied out
 * of order" control in test/pure/articleRank.test.mjs. One test below pins that
 * this fixture really is out of order.
 */
function messyBlock() {
  // Distinct publishedAt values, descending with position, so the cascade has a
  // defined answer for the `1,1` tie (newer first) instead of falling to _id.
  const at = (y) => `20${y}-01-01T00:00:00.000Z`;
  const rows = {
    m01: pinned('m01', 1,  at(30)),
    m02: pinned('m02', 1,  at(29)), // ← the duplicate
    m03: pinned('m03', 2,  at(28)),
    m04: pinned('m04', 3,  at(27)),
    m05: pinned('m05', 4,  at(26)),
    m06: pinned('m06', 5,  at(25)),
    m07: pinned('m07', 6,  at(24)),
    m08: pinned('m08', 7,  at(23)),
    m09: pinned('m09', 9,  at(22)), // ← 8 is missing
    m10: pinned('m10', 10, at(21)),
  };
  return [
    rows.m06, rows.m01, rows.m09, rows.m04, rows.m10,
    rows.m02, rows.m08, rows.m03, rows.m07, rows.m05,
  ];
}

/** The cascade order of the fixture, which is NOT its array order. */
const MESSY_CASCADE_ORDER = [
  'm01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10',
];

/** Ids in public order, by the shipped ranker. */
const publicOrder = (list) =>
  assignArticleRanks(list)
    .filter((a) => a.rank != null)
    .sort((a, b) => a.rank - b.rank)
    .map((a) => a._id);

/** pinOrder values of the block, in public order. */
const blockOrders = (list) => {
  const rank = new Map(assignArticleRanks(list).map((a) => [a._id, a.rank]));
  return list
    .filter(isPositioned)
    .sort((a, b) => rank.get(a._id) - rank.get(b._id))
    .map((a) => a.pinOrder);
};

test('move DOWN: 10 → 5 lands at rank 5 and pushes the incumbents down one', () => {
  const list = messyBlock();
  const before = publicOrder(list);
  const after = applyPositionPlan(list, planMoveToPosition(list, 'm10', 5));

  assert.deepEqual(
    publicOrder(after),
    ['m01', 'm02', 'm03', 'm04', 'm10', 'm05', 'm06', 'm07', 'm08', 'm09'],
  );
  assert.equal(before.indexOf('m10'), 9, 'it started last');
});

test('move UP: 5 → 10 lands at rank 10 and pulls the others up one', () => {
  const list = messyBlock();
  const after = applyPositionPlan(list, planMoveToPosition(list, 'm05', 10));
  assert.deepEqual(
    publicOrder(after),
    ['m01', 'm02', 'm03', 'm04', 'm06', 'm07', 'm08', 'm09', 'm10', 'm05'],
  );
});

test('move to 1 puts the article at the head of the block', () => {
  const list = messyBlock();
  const after = applyPositionPlan(list, planMoveToPosition(list, 'm07', 1));
  assert.equal(publicOrder(after)[0], 'm07');
  assert.equal(after.find((a) => a._id === 'm07').pinOrder, 1);
});

test('move to M puts the article at the tail of the block, still above the date mass', () => {
  const list = [...messyBlock(), art({ _id: 'dated', publishedAt: '2026-01-01T00:00:00.000Z' })];
  const after = applyPositionPlan(list, planMoveToPosition(list, 'm01', 10));
  const order = publicOrder(after);
  assert.equal(order[9], 'm01', 'last in the block');
  assert.equal(order[10], 'dated', 'and the date-ordered article is still below the whole block');
});

test('b-005: any move renumbers the block to contiguous 1..M — the duplicate and the gap are gone', () => {
  const list = messyBlock();
  const after = applyPositionPlan(list, planMoveToPosition(list, 'm10', 5));
  const orders = blockOrders(after);

  assert.deepEqual(
    orders, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    'production held 1,1,2,3,4,5,6,7,9,10 — a move must leave no duplicate and no gap, ' +
    'or the number in the control keeps disagreeing with the rank in the column',
  );
  assert.equal(new Set(orders).size, orders.length, 'no duplicates');
});

test('moving to the position it already holds writes NOTHING', () => {
  // A no-op write is not harmless: it inflates modifiedCount and makes "did
  // this move anything?" unanswerable from the plan.
  const clean = [pinned('a', 1), pinned('b', 2), pinned('c', 3)];
  assert.deepEqual(planMoveToPosition(clean, 'b', 2).writes, []);
});

test('a move touches ONLY the rows between the old and new position', () => {
  const clean = [
    pinned('a', 1), pinned('b', 2), pinned('c', 3), pinned('d', 4), pinned('e', 5),
  ];
  const plan = planMoveToPosition(clean, 'd', 2);
  assert.deepEqual(
    plan.writes.map((w) => w._id).sort(), ['b', 'c', 'd'],
    'a and e do not move, so they must not be written',
  );
});

test('b-006: normalization zeroes a stray unpinned pinOrder and leaves the other unpinned rows alone', () => {
  const list = [
    pinned('p1', 1),
    pinned('p2', 2),
    art({ _id: 'stray', pinOrder: 7, publishedAt: '2026-06-01T00:00:00.000Z' }),
    art({ _id: 'ok1', publishedAt: '2026-05-01T00:00:00.000Z' }),
    art({ _id: 'ok2', publishedAt: '2026-04-01T00:00:00.000Z' }),
  ];

  const plan = planBlockNormalization(list);
  const touched = plan.writes.map((w) => w._id);
  assert.deepEqual(touched, ['stray'], 'only the offending row is written');
  assert.equal(plan.writes[0].pinOrder, 0);

  const after = applyPositionPlan(list, plan);
  assert.deepEqual(
    publicOrder(after), ['p1', 'p2', 'stray', 'ok1', 'ok2'],
    'with pinOrder cleared the stray row rejoins date ordering at its real place — ' +
    'it was sorting below every pinOrder:0 row and landing dead last',
  );
});

test('b-006: the stray row really was mis-sorted BEFORE normalization (the bug is reproduced, not assumed)', () => {
  const list = [
    pinned('p1', 1),
    art({ _id: 'stray', pinOrder: 7, publishedAt: '2026-06-01T00:00:00.000Z' }),
    art({ _id: 'ok1', publishedAt: '2026-05-01T00:00:00.000Z' }),
    art({ _id: 'ok2', publishedAt: '2026-04-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    publicOrder(list), ['p1', 'ok1', 'ok2', 'stray'],
    'BEFORE the repair the stray row sinks below every pinOrder:0 row despite the ' +
    'newest publishedAt of the three. If this ever reads as already-correct, the ' +
    'cascade changed and the normalization above is fixing nothing.',
  );
});

test('b-005: normalization preserves the order WITHIN THE PINNED BLOCK — that half is invisible', () => {
  // SCOPE MATTERS AND THE NAME NOW SAYS SO. Normalization has TWO effects and
  // only ONE of them is invisible:
  //
  //   b-005 (this test)  renumber the block  → nothing a reader can see moves
  //   b-006 (next test)  zero a stray row    → that row DOES move, on purpose
  //
  // Claiming "the migration is invisible" over both would be false, and it
  // would be false in exactly the direction that matters: b-006's entire
  // content is that one article moves ~130 positions. So this fixture is the
  // pinned block ALONE — no stray row — and the claim is scoped to it.
  //
  // Asserted as ORDER only, never as values, so it stays isolated from the
  // contiguity claim: renumbering from 0 keeps this green, and numbering before
  // sorting reddens this one alone.
  const list = messyBlock();
  assert.equal(
    list.every(isPositioned), true,
    'this fixture must contain no unpinned rows, or the claim silently widens ' +
    'to cover the b-006 move it is not making',
  );

  const before = publicOrder(list);
  const after = applyPositionPlan(list, planBlockNormalization(list));

  assert.deepEqual(
    publicOrder(after), before,
    'renumbering the block must not move anything a reader can see — it only ' +
    'replaces the numbers underneath with ones that mean what they say',
  );
});

test('b-006: the stray row MOVING is the intended repair, not a side effect', () => {
  // The other half of normalization, stated as a deliberate outcome so nobody
  // reading a merged before/after list mistakes a ~130-position jump for a bug.
  // The stray row is not being relocated; it is being returned to where its
  // publishedAt always said it belonged, having been exiled by a pinOrder that
  // should never have applied to it.
  const list = [
    pinned('p1', 1),
    art({ _id: 'stray', pinOrder: 7, publishedAt: '2026-06-01T00:00:00.000Z' }),
    art({ _id: 'n1', publishedAt: '2026-05-01T00:00:00.000Z' }),
    art({ _id: 'n2', publishedAt: '2026-04-01T00:00:00.000Z' }),
    art({ _id: 'n3', publishedAt: '2026-03-01T00:00:00.000Z' }),
  ];

  const before = publicOrder(list);
  const after = applyPositionPlan(list, planBlockNormalization(list));
  const afterOrder = publicOrder(after);

  assert.equal(before.indexOf('stray'), 4, 'exiled to last by a pinOrder that should not apply to it');
  assert.equal(afterOrder.indexOf('stray'), 1, 'restored to the position its publishedAt earns');
  assert.notDeepEqual(
    afterOrder, before,
    'the public order MUST change here — if it did not, b-006 was not repaired',
  );

  // and every other row keeps its relative order; only the stray row moved
  assert.deepEqual(
    before.filter((id) => id !== 'stray'),
    afterOrder.filter((id) => id !== 'stray'),
    'nothing except the stray row may be disturbed',
  );
});

test('b-005: normalization yields contiguous 1..M on the production shape', () => {
  const after = applyPositionPlan(messyBlock(), planBlockNormalization(messyBlock()));
  assert.deepEqual(blockOrders(after), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('normalization is IDEMPOTENT — a second run plans nothing', () => {
  // This is what the repair script asserts after --apply to prove the invariant
  // holds, so it has to be a property of the planner and not of the script.
  const once = applyPositionPlan(messyBlock(), planBlockNormalization(messyBlock()));
  assert.deepEqual(planBlockNormalization(once).writes, []);
});

test('neither planner ever emits isPinnedOnArticlePage or showPinBadge', () => {
  // Moving is not promoting, demoting, or re-badging. A planner that quietly did
  // two of those at once is the shape of the bug being fixed here.
  const list = [...messyBlock(), art({ _id: 'stray', pinOrder: 4 })];
  const plans = [
    planMoveToPosition(list, 'm10', 3),
    planMoveToPosition(list, 'm01', 10),
    planBlockNormalization(list),
  ];
  for (const plan of plans) {
    assert.ok(plan.writes.length > 0, `${plan.kind} produced no writes — nothing is being checked`);
    for (const w of plan.writes) {
      assert.deepEqual(
        Object.keys(w).sort(), ['_id', 'pinOrder'],
        `${plan.kind} wrote ${Object.keys(w).join('/')} — positioning planners move ` +
        'things, they do not promote, demote or re-badge',
      );
    }
  }
});

test('a move never omits a row it meant to renumber — every changed value is written', () => {
  // applyArticlePositionPlan gates pinOrder on Number.isFinite, so `0` writes
  // and an ABSENT key silently leaves the old value. A row dropped from the
  // plan is therefore invisible: no error, just a stale number.
  const list = messyBlock();
  const plan = planMoveToPosition(list, 'm09', 2);
  const after = applyPositionPlan(list, plan);

  const written = new Set(plan.writes.map((w) => w._id));
  for (const a of after.filter(isPositioned)) {
    const was = list.find((x) => x._id === a._id).pinOrder;
    if (a.pinOrder !== was) {
      assert.ok(written.has(a._id), `${a._id} changed ${was} → ${a.pinOrder} but was not in the plan`);
    }
  }
  assert.deepEqual(blockOrders(after), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('target out of range CLAMPS rather than throwing at the admin', () => {
  const clean = [pinned('a', 1), pinned('b', 2), pinned('c', 3)];
  assert.equal(planMoveToPosition(clean, 'c', 0).target, 1, 'below the block clamps to 1');
  assert.equal(planMoveToPosition(clean, 'c', -5).target, 1);
  assert.equal(planMoveToPosition(clean, 'a', 99).target, 3, 'above the block clamps to M');
  assert.equal(
    publicOrder(applyPositionPlan(clean, planMoveToPosition(clean, 'c', 0)))[0], 'c',
  );
});

test('an UNUSABLE target is a NO-OP, never a move to the top', () => {
  // `null`, `''`, `[]` and `false` all pass Number.isFinite as 0 — so a guard
  // written as `Number.isFinite(Number(target))` clamps them to position 1 and
  // silently moves the article to the head of the block. Caught by this test
  // during implementation; the parse is now type-aware rather than coercive.
  // A select reads back `''` before a choice is made, so this is reachable.
  // NaN is in this sweep on purpose: `typeof NaN === 'number'`, so it passes the
  // typeof gate and is stopped only by the Number.isFinite check behind it. If
  // that check is ever dropped in favour of the typeof gate alone, NaN reaches
  // `block[NaN - 1]` and the move silently corrupts the block.
  const clean = [pinned('a', 1), pinned('b', 2), pinned('c', 3)];
  for (const junk of [NaN, undefined, null, '', '   ', [], false, {}, 'x']) {
    const plan = planMoveToPosition(clean, 'c', junk);
    assert.deepEqual(
      plan.writes, [],
      `target ${JSON.stringify(junk)} moved something — silently promoting an article ` +
      'to rank 1 because a control handed us junk is worse than doing nothing',
    );
    assert.equal(plan.target, 3, `target ${JSON.stringify(junk)} must resolve to the CURRENT position`);
  }
});

test('±Infinity NO-OPS rather than clamping — and that is the safe answer', () => {
  // Worth pinning because the intuition points the other way: ±Infinity reads
  // like "as far as possible", so clamping to M / 1 looks right. It does not
  // happen, because `Number.isFinite(Infinity)` is FALSE and the guard that
  // stops NaN stops Infinity with it.
  //
  // Keeping it that way is deliberate. Making Infinity clamp would mean
  // relaxing the finite check to `!Number.isNaN`, which is the same check that
  // keeps NaN out of `block[NaN - 1]` — a real corruption path — in exchange for
  // better handling of a value no `1..M` select can produce. Staying put is a
  // safe answer for junk; the clamp exists for out-of-range REAL positions.
  const clean = [pinned('a', 1), pinned('b', 2), pinned('c', 3)];
  assert.deepEqual(planMoveToPosition(clean, 'a', Infinity).writes, []);
  assert.equal(planMoveToPosition(clean, 'a', Infinity).target, 1, 'stays where it was');
  assert.deepEqual(planMoveToPosition(clean, 'c', -Infinity).writes, []);
  assert.equal(planMoveToPosition(clean, 'c', -Infinity).target, 3, 'stays where it was');

  // the clamp is alive for real out-of-range integers, which is its actual job
  assert.equal(planMoveToPosition(clean, 'a', 99).target, 3);
  assert.equal(planMoveToPosition(clean, 'c', 0).target, 1);
});

test('moving an article that is NOT in the block throws a named error', () => {
  const list = [pinned('a', 1), art({ _id: 'unpinned' })];
  assert.throws(
    () => planMoveToPosition(list, 'unpinned', 1),
    { name: 'NotInBlockError', message: /not in the positioned block/ },
    'the control only renders on positioned rows, so this is a programmer error — ' +
    'returning an empty plan would look exactly like a successful no-op move',
  );
  assert.throws(() => planMoveToPosition(list, 'ghost', 1), { name: 'NotInBlockError' });
});

// ── controls for the new planners ─────────────────────────────────────────

test('CONTROL: the messy fixture really is messy — it is not already 1..10', () => {
  // Every contiguity assertion above is vacuous if the fixture arrives clean.
  const orders = messyBlock().map((a) => a.pinOrder).sort((x, y) => x - y);
  assert.deepEqual(orders, [1, 1, 2, 3, 4, 5, 6, 7, 9, 10], 'the production shape');
  assert.notEqual(new Set(orders).size, orders.length, 'it contains a duplicate');
  assert.equal(orders.includes(8), false, 'and a gap at 8');
});

test('CONTROL: the messy fixture is supplied OUT OF cascade order', () => {
  // The order-preservation control works by deleting the sort in blockInOrder.
  // If the fixture's array order already matched the cascade, deleting that sort
  // would change nothing and the control would pass while proving nothing.
  const arrayOrder = messyBlock().map((a) => a._id);
  assert.deepEqual(
    publicOrder(messyBlock()), MESSY_CASCADE_ORDER,
    'the cascade order of this fixture',
  );
  assert.notDeepEqual(
    arrayOrder, MESSY_CASCADE_ORDER,
    'the fixture arrives in cascade order, so a planner that never sorted would ' +
    'pass every test in this file',
  );
});

test('CONTROL: the order-preservation claim is falsifiable — a different order IS detected', () => {
  // publicOrder() could be returning a constant, or comparing a list to itself.
  // Show it distinguishes two genuinely different arrangements of the same ids.
  const list = messyBlock();
  const moved = applyPositionPlan(list, planMoveToPosition(list, 'm10', 1));
  assert.notDeepEqual(
    publicOrder(moved), publicOrder(list),
    'a move that puts the last article first must change the public order — if this ' +
    'passes, the preservation test above proves nothing',
  );
});

test('CONTROL: a move on the messy block writes MORE than one row', () => {
  // The old free-number input wrote exactly one row and left the block
  // inconsistent. If a "move" ever touches one row again, it is that bug back.
  const list = messyBlock();
  const plan = planMoveToPosition(list, 'm10', 5);
  assert.ok(
    plan.writes.length > 1,
    `only ${plan.writes.length} row(s) written — a move renumbers the rows it passes`,
  );
});
