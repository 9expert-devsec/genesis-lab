import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SORT_KEY_GAP,
  assignSortKeysFromOrder,
  compareBySortKeyDesc,
  midpointSortKey,
  nextSortKeyForNew,
  planSortKeyMove,
  sortKeyOf,
  sortedBySortKey,
} from '@/lib/articleSortKey';
import { applyPositionPlan } from '@/lib/articlePositioning';
import { compareArticlesByDate, compareArticlesForPublicOrder } from '@/lib/articleRank';

// ROUND 1 OF 2 — the planner only. Nothing reads `sortKey` yet: the cascade,
// the index and the admin UI are round 2. What is being pinned here is that the
// numbers this module hands out are SPACED (so an insertion is one row, not
// 485), that the backfill assignment is DETERMINISTIC (so a re-run cannot
// silently reorder the list), and that a gap running out is DETECTED rather than
// rounded into a collision.
//
// Plans are replayed with `applyPositionPlan` from articlePositioning.js. Both
// modules emit `{kind, writes: [{_id, …fields}]}`, and that replayer is generic;
// reusing it keeps what the tests assert and what the server writes on one code
// path.

const art = (over) => ({
  _id: over._id,
  active: true,
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  publishedAt: '2025-01-01T00:00:00.000Z',
  createdAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

/** An article that already holds a key. */
const keyed = (id, sortKey) => art({ _id: id, sortKey });

/** Ids in sortKey order, highest first. */
const order = (list) => sortedBySortKey(list).map((a) => a._id);

/** id → sortKey, from a plan's writes. */
const keyMap = (plan) => new Map(plan.writes.map((w) => [w._id, w.sortKey]));

/**
 * Five articles, evenly spaced. The ARRAY order is deliberately not the sortKey
 * order — a planner that never sorted would otherwise pass every test below.
 */
function spaced() {
  return [
    keyed('c', 3000), keyed('e', 1000), keyed('a', 5000), keyed('d', 2000), keyed('b', 4000),
  ];
}
const SPACED_ORDER = ['a', 'b', 'c', 'd', 'e'];

// ── RULING 1 · the keys are SPACED ────────────────────────────────────────

test('R1-a — assignment spaces adjacent keys by exactly SORT_KEY_GAP', () => {
  const list = [
    art({ _id: 'x1', publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'x2', publishedAt: '2025-01-01T00:00:00.000Z' }),
    art({ _id: 'x3', publishedAt: '2024-01-01T00:00:00.000Z' }),
    art({ _id: 'x4', publishedAt: '2023-01-01T00:00:00.000Z' }),
  ];
  const keys = assignSortKeysFromOrder(list).writes.map((w) => w.sortKey);

  assert.deepEqual(keys, [4000, 3000, 2000, 1000], 'descending, one GAP apart');
  for (let i = 0; i < keys.length - 1; i += 1) {
    assert.equal(
      keys[i] - keys[i + 1], SORT_KEY_GAP,
      'contiguous 1..N would make every insert-at-top a whole-collection write',
    );
  }
  assert.ok(keys.every((k) => k > 0), 'every key stays positive');
});

test('R1-b — CONTROL: the gap is what makes insertion possible; contiguous keys exhaust immediately', () => {
  // If SORT_KEY_GAP were ever "simplified" to 1, every assertion about midpoint
  // insertion below would still be about a scheme with nowhere to insert.
  assert.ok(SORT_KEY_GAP > 1, 'a gap of 1 is a contiguous scheme wearing a constant');
  assert.equal(
    midpointSortKey(2, 1), null,
    'adjacent keys have no integer between them — this is the state a gap of 1 puts ' +
    'EVERY pair in, permanently',
  );
  assert.equal(midpointSortKey(1 + SORT_KEY_GAP, 1), Math.floor((2 + SORT_KEY_GAP) / 2),
    'and one GAP apart there is plenty of room');
});

test('R1-c — a new article takes max + GAP and outranks every existing key', () => {
  const list = spaced();
  const next = nextSortKeyForNew(list);

  assert.equal(next, 6000);
  for (const a of list) {
    assert.ok(next > sortKeyOf(a), `${a._id} (${a.sortKey}) must sort below a brand new article`);
  }
  const after = [...list, keyed('brand-new', next)];
  assert.equal(order(after)[0], 'brand-new', 'a new article goes to the TOP');
});

test('R1-d — it appends after the HIGHEST key, not after the count', () => {
  // Keys are spaced and need not be a function of the row count. count*GAP would
  // be 3000 here and land the new article mid-list.
  const list = [keyed('a', 5), keyed('b', 9000), keyed('c', 12)];
  const next = nextSortKeyForNew(list);
  assert.equal(next, 10000, 'max(9000) + GAP');
  assert.ok(next > 9000, 'count-based numbering would have produced 3000 and buried it');
});

test('R1-e — an empty collection starts at SORT_KEY_GAP', () => {
  assert.equal(nextSortKeyForNew([]), SORT_KEY_GAP);
  assert.equal(nextSortKeyForNew(undefined), SORT_KEY_GAP);
  assert.equal(
    nextSortKeyForNew([art({ _id: 'no-key-yet' })]), SORT_KEY_GAP,
    'a collection where nothing is backfilled yet behaves like an empty one, rather ' +
    'than producing NaN from Math.max over no finite values',
  );
});

test('R1-f — a move between two neighbours writes EXACTLY ONE row', () => {
  const list = spaced();
  const plan = planSortKeyMove(list, 'e', 2);

  assert.equal(plan.kind, 'move');
  assert.deepEqual(
    plan.writes, [{ _id: 'e', sortKey: 4500 }],
    'the midpoint of its new neighbours (a=5000, b=4000); nobody else is touched',
  );
  assert.deepEqual(order(applyPositionPlan(list, plan)), ['a', 'e', 'b', 'c', 'd']);
});

test('R1-g — a move to the TOP writes exactly one row and lands above everything', () => {
  const list = spaced();
  const plan = planSortKeyMove(list, 'e', 1);

  assert.deepEqual(plan.writes, [{ _id: 'e', sortKey: 6000 }], 'below + GAP — there is no ceiling');
  assert.deepEqual(order(applyPositionPlan(list, plan)), ['e', 'a', 'b', 'c', 'd']);
});

test('R1-h — a move to the BOTTOM writes exactly one row and stays positive', () => {
  const list = spaced();
  const plan = planSortKeyMove(list, 'a', 5);

  assert.deepEqual(
    plan.writes, [{ _id: 'a', sortKey: 500 }],
    'the midpoint between the last key and an implicit floor of 0 — which is what ' +
    'stops the tail of the list marching into negative numbers',
  );
  assert.deepEqual(order(applyPositionPlan(list, plan)), ['b', 'c', 'd', 'e', 'a']);
});

test('R1-i — CONTROL: the fixture is not already at the target, and a no-op writes nothing', () => {
  // Every "one row" assertion above is satisfied by a planner that writes one
  // pointless row, and every order assertion by a fixture already in place.
  const list = spaced();
  assert.deepEqual(order(list), SPACED_ORDER, 'the starting order');
  assert.notDeepEqual(
    list.map((a) => a._id), SPACED_ORDER,
    'the fixture arrives OUT of sortKey order, so a planner that never sorted cannot pass',
  );
  assert.equal(order(list).indexOf('e'), 4, 'e starts last, so moving it to 2 is a real move');

  const noop = planSortKeyMove(list, 'c', 3);
  assert.deepEqual(noop.writes, [], 'moving to the position it already holds writes NOTHING');
  assert.equal(noop.kind, 'move');
});

// ── RULING 1 · exhaustion is detected, not collided ───────────────────────

/**
 * A squeezed region: b, c and d sit one apart. Any insertion between b and c has
 * nowhere to go. The list is otherwise roomy, which is what makes the "only the
 * affected span is rewritten" claim testable.
 */
function squeezed() {
  return [
    keyed('c', 3001), keyed('e', 1000), keyed('a', 5000), keyed('d', 3000), keyed('b', 3002),
  ];
}

test('R1-j — gap exhaustion is DETECTED rather than rounded away', () => {
  assert.equal(midpointSortKey(3002, 3001), null, 'adjacent — no integer strictly between');
  assert.equal(midpointSortKey(3001, 3001), null, 'equal');
  assert.equal(midpointSortKey(3000, 3002), null, 'inverted — the caller has the pair backwards');
  assert.equal(midpointSortKey('x', 1), null, 'unusable input is exhaustion, not NaN');
  assert.equal(midpointSortKey(3002, 3000), 3001, 'and it is live when there IS room');
});

test('R1-k — CONTROL: the collision it prevents is real', () => {
  // The naive implementation. If this ever stops equalling a neighbour, the
  // detection above is guarding nothing.
  const naive = Math.floor((3002 + 3001) / 2);
  assert.equal(
    naive, 3001,
    'a rounded midpoint of adjacent keys IS one of the neighbours — two articles on ' +
    'one key, and the tie falls through to the date order, so the position the admin ' +
    'chose silently stops deciding anything',
  );
});

test('R1-l — an exhausted gap yields a REBALANCE plan with strictly descending, distinct keys', () => {
  const list = squeezed();
  const plan = planSortKeyMove(list, 'e', 3);

  assert.equal(plan.kind, 'rebalance', 'the plan says so — a caller logging "moved 1 row" would be lying');
  assert.ok(plan.writes.length > 1, 'a rebalance by definition touches more than the moved row');

  const keys = sortedBySortKey(applyPositionPlan(list, plan)).map(sortKeyOf);
  for (let i = 0; i < keys.length - 1; i += 1) {
    assert.ok(keys[i] > keys[i + 1], `keys must strictly descend: ${keys.join(', ')}`);
  }
  assert.equal(new Set(keys).size, keys.length, 'no duplicates');
  assert.ok(keys.every((k) => k > 0), 'and all still positive');
});

test('R1-o — a rebalance still lands the article where it was asked to go', () => {
  const list = squeezed();
  const plan = planSortKeyMove(list, 'e', 3);
  assert.deepEqual(
    order(applyPositionPlan(list, plan)), ['a', 'b', 'e', 'c', 'd'],
    'rebalancing is how the move is honoured, not an excuse to abandon it',
  );
  assert.equal(plan.target, 3);
});

test('R1-m — a rebalance touches ONLY the affected span', () => {
  const list = squeezed();
  const plan = planSortKeyMove(list, 'e', 3);
  const touched = new Set(plan.writes.map((w) => w._id));

  assert.deepEqual(
    [...touched].sort(), ['b', 'c', 'e'],
    'b and c are the squeezed pair, e is the article being inserted between them',
  );
  const after = applyPositionPlan(list, plan);
  for (const id of ['a', 'd']) {
    assert.equal(
      sortKeyOf(after.find((x) => x._id === id)),
      sortKeyOf(list.find((x) => x._id === id)),
      `${id} sits outside the span and must keep its key`,
    );
  }
  assert.deepEqual(plan.span, { from: 2, to: 4 }, 'the span is reported, not left to be inferred');
});

test('R1-n — CONTROL: the span is narrower than the whole list', () => {
  // "Rebalance" implemented as "renumber everything" would pass R1-l and R1-o.
  //
  // MEASURED ON THE SPAN, NOT ON writes.length, and that correction came from
  // running this control: seeding lo=0/hi=n-1 (i.e. always rebalance the whole
  // collection) reddened R1-m and left this test GREEN, because the minimal-write
  // filter dropped the one row whose key happened to come out unchanged — 4
  // writes over a 5-row list still satisfies `writes.length < list.length`. The
  // same weak-assertion shape as the `>= 2` demotion control in
  // articlePositioning's suite. The span is what the claim is actually about.
  const list = squeezed();
  const plan = planSortKeyMove(list, 'e', 3);
  const width = plan.span.to - plan.span.from + 1;

  assert.ok(
    width < list.length,
    `the rebalance span covers all ${list.length} rows — expanding to the whole ` +
    'collection on every collision is the 485-row write the gap exists to avoid',
  );
  assert.ok(width > 1, 'it also must not claim a one-row rebalance');
});

// ── RULING 1 · what the planners may write ────────────────────────────────

test('R1-p — every planner emits ONLY _id and sortKey', () => {
  // Ordering is not promoting, demoting or re-badging. A planner that quietly
  // did two of those at once is the shape of the bug articlePositioning.js was
  // built to close.
  const plans = [
    assignSortKeysFromOrder(spaced()),
    planSortKeyMove(spaced(), 'e', 2),
    planSortKeyMove(squeezed(), 'e', 3),
  ];
  for (const plan of plans) {
    assert.ok(plan.writes.length > 0, `${plan.kind} produced no writes — nothing is being checked`);
    for (const w of plan.writes) {
      assert.deepEqual(
        Object.keys(w).sort(), ['_id', 'sortKey'],
        `${plan.kind} wrote ${Object.keys(w).join('/')}`,
      );
    }
  }
});

test('R1-q — an UNUSABLE target is a NO-OP, never a move to the top', () => {
  // Number(null), Number(''), Number([]) and Number(false) are all 0 — finite,
  // therefore clamped to position 1 by a coercive guard. A select reads back ''
  // before a choice is made, so this is reachable, and the failure is an article
  // silently jumping to the head of the list. Inherited from planMoveToPosition,
  // where this exact bug was caught during implementation.
  const list = spaced();
  for (const junk of [NaN, undefined, null, '', '   ', [], false, {}, 'x', Infinity, -Infinity]) {
    const plan = planSortKeyMove(list, 'e', junk);
    assert.deepEqual(plan.writes, [], `target ${JSON.stringify(junk)} moved something`);
    assert.equal(plan.target, 5, `target ${JSON.stringify(junk)} must resolve to the CURRENT position`);
  }
  // the clamp is alive for real out-of-range positions, which is its actual job
  assert.equal(planSortKeyMove(list, 'e', 0).target, 1, 'below the list clamps to 1');
  assert.equal(planSortKeyMove(list, 'a', 99).target, 5, 'above it clamps to N');
});

test('R1-r — moving an article that is not in the list throws a named error', () => {
  assert.throws(
    () => planSortKeyMove(spaced(), 'ghost', 1),
    { name: 'NotInListError', message: /not in the supplied list/ },
    'an empty plan would look exactly like a successful no-op move',
  );
});

// ── RULING 2 · the backfill moves nothing a reader sees ───────────────────

test('R2-a — the assignment reproduces the shipped DATE ordering', () => {
  const list = [
    art({ _id: 'mid',    publishedAt: '2025-05-05T00:00:00.000Z' }),
    art({ _id: 'draft',  publishedAt: null, createdAt: '2026-12-01T00:00:00.000Z' }),
    art({ _id: 'newest', publishedAt: '2026-07-01T00:00:00.000Z' }),
    art({ _id: 'oldest', publishedAt: '2022-01-01T00:00:00.000Z' }),
  ];
  const expected = [...list].sort(compareArticlesByDate).map((a) => a._id);
  const after = applyPositionPlan(list, assignSortKeysFromOrder(list));

  assert.deepEqual(order(after), expected);
  assert.deepEqual(
    expected, ['newest', 'mid', 'oldest', 'draft'],
    'stated literally too, so a comparator that changed underneath would not just ' +
    'agree with itself: a null publishedAt sinks below every dated article',
  );
});

test('R2-b — pinned articles are ordered by DATE too, not floated to the top', () => {
  const list = [
    art({ _id: 'pinned-ancient', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2001-01-01T00:00:00.000Z' }),
    art({ _id: 'plain-new',      publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'plain-old',      publishedAt: '2010-01-01T00:00:00.000Z' }),
  ];
  const keys = keyMap(assignSortKeysFromOrder(list));

  assert.ok(
    keys.get('pinned-ancient') < keys.get('plain-old'),
    'sortKey means "where this sits in the NORMAL ordering". A pinned article given a ' +
    'top key would be stranded at the head of the list the day it is unpinned.',
  );
  assert.deepEqual(
    [...keys.keys()].sort(), ['pinned-ancient', 'plain-new', 'plain-old'],
    'and it is still assigned a key — pinned rows are in the ordering, not exempt from it',
  );
});

test('R2-c — CONTROL: the pin-aware comparator DOES float it, so the two orders differ', () => {
  // If the public cascade and the date ordering happened to agree on this
  // fixture, R2-b would pass against an assignment that used the wrong one.
  const list = [
    art({ _id: 'pinned-ancient', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2001-01-01T00:00:00.000Z' }),
    art({ _id: 'plain-new',      publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'plain-old',      publishedAt: '2010-01-01T00:00:00.000Z' }),
  ];
  const byCascade = [...list].sort(compareArticlesForPublicOrder).map((a) => a._id);
  const byDate = [...list].sort(compareArticlesByDate).map((a) => a._id);

  assert.equal(byCascade[0], 'pinned-ancient', 'the public cascade puts the pin first');
  assert.equal(byDate.at(-1), 'pinned-ancient', 'the date ordering puts it last');
  assert.notDeepEqual(byCascade, byDate);
});

/**
 * The tie shape production actually has: `publishedAt` values written by an
 * import burst, identical to the second, with identical `createdAt`. 24-char hex
 * ids, because the final tiebreak is a string compare over real ObjectIds.
 */
function tied() {
  const at = '2019-08-14T00:00:00.000Z';
  return [
    art({ _id: '65f1a2b3c4d5e6f701020304', publishedAt: at, createdAt: at }),
    art({ _id: '65f1a2b3c4d5e6f701020301', publishedAt: at, createdAt: at }),
    art({ _id: '65f1a2b3c4d5e6f701020303', publishedAt: at, createdAt: at }),
    art({ _id: '65f1a2b3c4d5e6f701020302', publishedAt: at, createdAt: at }),
  ];
}

test('R2-d — the comparator is TOTAL: no two distinct articles ever compare 0', () => {
  // Without this the assignment is not deterministic, and a re-run of the
  // backfill silently reorders the list.
  const list = tied();
  for (const a of list) {
    for (const b of list) {
      if (a._id === b._id) continue;
      assert.notEqual(
        compareArticlesByDate(a, b), 0,
        `${a._id} and ${b._id} compare equal — the assignment between them is then ` +
        'whatever the sort implementation felt like',
      );
    }
  }
  const keys = [...keyMap(assignSortKeysFromOrder(list)).values()];
  assert.equal(new Set(keys).size, keys.length, 'and every article still gets a distinct key');
});

test('R2-e — CONTROL: the tie fixture really ties — only _id can separate those rows', () => {
  const list = tied();
  assert.equal(new Set(list.map((a) => a.publishedAt)).size, 1, 'one publishedAt across all rows');
  assert.equal(new Set(list.map((a) => a.createdAt)).size, 1, 'one createdAt too');
  assert.equal(new Set(list.map((a) => a._id)).size, list.length, 'the ids are the only difference');
});

test('R2-f — a RE-RUN over the same data produces the IDENTICAL assignment', () => {
  const first = keyMap(assignSortKeysFromOrder(tied()));

  // Same documents, a different array order — which is all a second read from
  // Mongo guarantees.
  const shuffled = [...tied()].reverse();
  const second = keyMap(assignSortKeysFromOrder(shuffled));

  assert.deepEqual(
    [...second.entries()].sort(), [...first.entries()].sort(),
    'a re-run that assigns different keys silently renumbers the whole list',
  );
});

test('R2-g — CONTROL: the shuffle really reordered the array', () => {
  const original = tied().map((a) => a._id);
  const shuffled = [...tied()].reverse().map((a) => a._id);
  assert.notDeepEqual(
    shuffled, original,
    'if the two inputs were identical, R2-f would be comparing a run with itself',
  );
});

test('R2-h — every article gets a key, and none is left without one', () => {
  const list = [...spaced(), ...tied(), art({ _id: 'no-dates', publishedAt: null, createdAt: null })];
  const plan = assignSortKeysFromOrder(list);

  assert.equal(plan.writes.length, list.length, 'one write per row — this is a backfill');
  assert.deepEqual(
    plan.writes.map((w) => w._id).sort(),
    list.map((a) => String(a._id)).sort(),
    'same ids, none lost, none invented',
  );
  for (const w of plan.writes) {
    assert.ok(Number.isFinite(w.sortKey) && w.sortKey > 0, `${w._id} got ${w.sortKey}`);
  }
});

test('R2-i — the shipped cascade still ENDS IN the extracted date comparator', () => {
  // The extraction must be a refactor, not a fork. Where the first two tiers
  // tie, the two functions have to be the same function.
  const pairs = [
    [art({ _id: 'a', publishedAt: '2026-01-01T00:00:00.000Z' }), art({ _id: 'b', publishedAt: '2020-01-01T00:00:00.000Z' })],
    [art({ _id: 'a', publishedAt: null, createdAt: '2026-01-01T00:00:00.000Z' }), art({ _id: 'b', publishedAt: '2020-01-01T00:00:00.000Z' })],
    [tied()[0], tied()[1]],
  ];
  for (const [a, b] of pairs) {
    assert.equal(
      compareArticlesForPublicOrder(a, b), compareArticlesByDate(a, b),
      `the cascade and the date comparator disagree on ${a._id} vs ${b._id} despite ` +
      'identical pin state — one of them has been edited without the other',
    );
  }

  // and the extraction did NOT flatten the tiers above it
  const pinned = art({ _id: 'p', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2001-01-01T00:00:00.000Z' });
  const plain = art({ _id: 'q', publishedAt: '2026-01-01T00:00:00.000Z' });
  assert.ok(compareArticlesForPublicOrder(pinned, plain) < 0, 'the pin tier still decides');
  assert.ok(compareArticlesByDate(pinned, plain) > 0, 'and the date comparator still ignores it');
});

// ── the sortKey ordering itself ───────────────────────────────────────────

test('a missing sortKey SINKS rather than claiming the top', () => {
  // Between the deploy and the backfill some rows carry no key. Absent must not
  // read as 0-and-therefore-a-position, and must not read as "first".
  const list = [keyed('has-key', 2000), art({ _id: 'no-key', publishedAt: '2026-01-01T00:00:00.000Z' })];
  assert.deepEqual(order(list), ['has-key', 'no-key'], 'even though its publishedAt is newer');
  assert.equal(sortKeyOf(list[1]), null, 'absent is null, not 0');
  assert.ok(compareBySortKeyDesc(list[1], list[0]) > 0);
});

test('two articles on the SAME key fall through to the date ordering', () => {
  // Not reachable through the planners — every one of them keeps keys distinct —
  // but a restored backup or a hand edit in Compass can produce it, and leaving
  // the answer to the sort implementation would make the list shuffle between
  // renders.
  const at = (y) => `${y}-01-01T00:00:00.000Z`;
  const list = [
    art({ _id: 'older', sortKey: 3000, publishedAt: at(2020) }),
    art({ _id: 'newer', sortKey: 3000, publishedAt: at(2026) }),
  ];
  assert.deepEqual(order(list), ['newer', 'older']);
  assert.deepEqual(order([...list].reverse()), ['newer', 'older'], 'and it is stable either way round');
});
