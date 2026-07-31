import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RANK_REFUSALS,
  STEP_REFUSALS,
  describeAllOrderControls,
  describeOrderControls,
  describeRankTarget,
  orderedForDisplay,
  planMoveToBlockTop,
  planMoveToRank,
  planOrderStep,
} from '@/lib/articleOrdering';
import { applyPositionPlan, isPositioned } from '@/lib/articlePositioning';
import { assignArticleRanks } from '@/lib/articleRank';
import { SORT_KEY_GAP, planSortKeyMove } from '@/lib/articleSortKey';

// ONE STEP UP OR DOWN, on every row, with nothing to switch on first.
//
// The list is two tiers — a pinned block ordered by `pinOrder`, then everything
// else by `sortKey` — so WHICH FIELD moves a row depends on WHICH TWO ROWS are
// being swapped. An arrow that always wrote `sortKey` would change a number and
// move nothing on the five pinned rows, because the cascade never reaches their
// key. These tests are stated in terms of the RESULTING ORDER rather than the
// raw field values, because the order is what the admin is promised.

const at = (y) => `${y}-01-01T00:00:00.000Z`;

const art = (over) => ({
  _id: over._id,
  active: true,
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  publishedAt: at(2025),
  createdAt: at(2025),
  ...over,
});

const pinned = (id, order) => art({ _id: id, isPinnedOnArticlePage: true, pinOrder: order, sortKey: 1000 });
const plain = (id, sortKey) => art({ _id: id, sortKey });

/** Ids in the order the list renders them. */
const order = (list) => orderedForDisplay(list).map((a) => a._id);

/**
 * Two pinned rows above four unpinned ones — the production shape in miniature.
 * Deliberately supplied OUT of cascade order, so a planner that never sorted
 * would fail rather than coincidentally agree.
 */
function collection() {
  return [
    plain('u2', 3000), pinned('p1', 1), plain('u4', 1000),
    plain('u1', 4000), pinned('p2', 2), plain('u3', 2000),
  ];
}
const DISPLAY = ['p1', 'p2', 'u1', 'u2', 'u3', 'u4'];

test('CONTROL: the fixture arrives out of cascade order, and the cascade order is what it claims', () => {
  // Every assertion below compares against DISPLAY. If the array order already
  // matched it, a planner that skipped the sort would pass this whole file.
  assert.deepEqual(order(collection()), DISPLAY);
  assert.notDeepEqual(collection().map((a) => a._id), DISPLAY);
  assert.equal(collection().filter(isPositioned).length, 2, 'two pinned rows, and they sort first');
});

// ── S4-a · two unpinned rows → sortKey ────────────────────────────────────

test('S4-a — a step between two UNPINNED rows writes sortKey, exactly one row', () => {
  const list = collection();
  const plan = planOrderStep(list, 'u3', 'up');

  assert.equal(plan.tier, 'sortKey', 'the pair is decided by sortKey, so that is what moves');
  assert.equal(plan.writes.length, 1, 'one row written — the whole reason the keys are spaced');
  assert.deepEqual(Object.keys(plan.writes[0]).sort(), ['_id', 'sortKey']);
  assert.equal(plan.writes[0]._id, 'u3');

  assert.deepEqual(
    order(applyPositionPlan(list, plan)),
    ['p1', 'p2', 'u1', 'u3', 'u2', 'u4'],
    'u3 swapped with u2, its TRUE neighbour, and nothing else moved',
  );
});

test('S4-a2 — the same step downward', () => {
  const list = collection();
  const plan = planOrderStep(list, 'u2', 'down');
  assert.equal(plan.tier, 'sortKey');
  assert.equal(plan.writes.length, 1);
  assert.deepEqual(order(applyPositionPlan(list, plan)), ['p1', 'p2', 'u1', 'u3', 'u2', 'u4']);
});

// ── S4-b · two pinned rows → pinOrder ─────────────────────────────────────

test('S4-b — a step between two PINNED rows writes pinOrder, not sortKey', () => {
  // Both pinned rows carry the SAME sortKey in this fixture, so a planner that
  // reached for sortKey here would have nothing to work with and would either
  // no-op or collide. pinOrder is what decides them.
  const list = collection();
  const plan = planOrderStep(list, 'p2', 'up');

  assert.equal(plan.tier, 'pinOrder');
  for (const w of plan.writes) {
    assert.equal('sortKey' in w, false, `a pinned-pair step wrote a sortKey: ${JSON.stringify(w)}`);
  }
  assert.deepEqual(
    order(applyPositionPlan(list, plan)),
    ['p2', 'p1', 'u1', 'u2', 'u3', 'u4'],
    'the two pinned rows swapped and the unpinned mass is untouched',
  );
});

test('S4-b2 — the pinned block stays contiguous 1..M after a step', () => {
  // planMoveToPosition re-emits the block, which is what keeps b-005
  // unrepresentable. A step must not be an exception to that.
  const list = [pinned('p1', 1), pinned('p2', 2), pinned('p3', 3), plain('u1', 5000)];
  const after = applyPositionPlan(list, planOrderStep(list, 'p3', 'up'));
  const orders = after.filter(isPositioned)
    .sort((a, b) => a.pinOrder - b.pinOrder)
    .map((a) => a.pinOrder);
  assert.deepEqual(orders, [1, 2, 3], 'no duplicate, no gap');
  assert.deepEqual(order(after), ['p1', 'p3', 'p2', 'u1']);
});

// ── S4-c/d · the pin boundary ─────────────────────────────────────────────

test('S4-c — the step across the pin boundary is REFUSED, with a reason', () => {
  const list = collection();

  const down = planOrderStep(list, 'p2', 'down');   // last pinned → first unpinned
  assert.equal(down.kind, 'noop');
  assert.equal(down.reason, STEP_REFUSALS.PIN_BOUNDARY);
  assert.deepEqual(down.writes, [], 'and it writes NOTHING — a half-done crossing is worse than a refusal');

  const up = planOrderStep(list, 'u1', 'up');       // first unpinned → last pinned
  assert.equal(up.kind, 'noop');
  assert.equal(up.reason, STEP_REFUSALS.PIN_BOUNDARY);
  assert.deepEqual(up.writes, []);

  assert.deepEqual(order(applyPositionPlan(list, down)), DISPLAY, 'the list is unchanged');
});

test('S4-d — CONTROL: the boundary rows are live in the OTHER direction', () => {
  // "Refused" must mean the boundary specifically, not "these rows are frozen".
  // If both directions were dead the refusal above would be indistinguishable
  // from a planner that gives up on the edges of the block.
  const list = collection();
  assert.equal(planOrderStep(list, 'p2', 'up').writes.length > 0, true, 'p2 can still move up inside the block');
  assert.equal(planOrderStep(list, 'u1', 'down').writes.length > 0, true, 'u1 can still move down the normal order');
});

test('the ends of the LIST are refused separately from the pin boundary', () => {
  // Two different reasons, because they need two different sentences on screen:
  // one is "there is nothing above you", the other is "what is above you is a
  // different kind of thing".
  const list = collection();
  assert.equal(planOrderStep(list, 'p1', 'up').reason, STEP_REFUSALS.LIST_END);
  assert.equal(planOrderStep(list, 'u4', 'down').reason, STEP_REFUSALS.LIST_END);
  assert.notEqual(STEP_REFUSALS.LIST_END, STEP_REFUSALS.PIN_BOUNDARY);
});

test('b-006: a stray pinOrder on an unpinned row refuses rather than writing a key that cannot move it', () => {
  // `pinOrder` is the SECOND cascade key and applies to every document, so while
  // two unpinned rows disagree on it no sortKey could move one past the other.
  // Writing one anyway is the "the number changed and nothing moved" failure
  // this module exists to prevent.
  const list = [plain('a', 3000), art({ _id: 'stray', pinOrder: 2, sortKey: 9000 }), plain('c', 1000)];
  assert.deepEqual(order(list), ['a', 'c', 'stray'], 'the stray row is exiled to the end despite the highest key');

  const plan = planOrderStep(list, 'stray', 'up');
  assert.equal(plan.reason, STEP_REFUSALS.STRAY_PIN_ORDER);
  assert.deepEqual(plan.writes, []);
});

// ── S4-e · to the top of this row's own block ─────────────────────────────

test('S4-e — ย้ายขึ้นบนสุด on an UNPINNED row takes max + GAP', () => {
  const list = collection();
  const plan = planMoveToBlockTop(list, 'u4');

  assert.equal(plan.tier, 'sortKey');
  assert.deepEqual(plan.writes.map((w) => w._id), ['u4'], 'one row');
  assert.equal(plan.writes[0].sortKey, 4000 + SORT_KEY_GAP, 'above every existing key');

  assert.deepEqual(
    order(applyPositionPlan(list, plan)),
    ['p1', 'p2', 'u4', 'u1', 'u2', 'u3'],
    'top of the NORMAL ordering — position 3 of 6, NOT position 1. The pinned ' +
    'block is still above it, which is exactly what the button copy has to say.',
  );
});

test('S4-e2 — ย้ายขึ้นบนสุด on a PINNED row takes pinOrder 1', () => {
  const list = [pinned('p1', 1), pinned('p2', 2), pinned('p3', 3), plain('u1', 5000)];
  const plan = planMoveToBlockTop(list, 'p3');

  assert.equal(plan.tier, 'pinOrder');
  for (const w of plan.writes) assert.equal('sortKey' in w, false);
  assert.deepEqual(order(applyPositionPlan(list, plan)), ['p3', 'p1', 'p2', 'u1']);
});

test('S4-e3 — a row already at the top of its block writes NOTHING', () => {
  const list = collection();
  assert.deepEqual(planMoveToBlockTop(list, 'u1').writes, [], 'already top of the normal order');
  assert.equal(planMoveToBlockTop(list, 'u1').reason, STEP_REFUSALS.ALREADY_TOP);
  assert.deepEqual(planMoveToBlockTop(list, 'p1').writes, [], 'already top of the pinned block');
});

test('S4-f — an exhausted gap escalates to a rebalance and still lands the row', () => {
  // The keys here are one apart, so no midpoint exists. The planner must not
  // round into a collision — two rows on one key means the tie falls through to
  // the date order and the move silently stops deciding anything.
  const list = [plain('a', 9000), plain('b', 3002), plain('c', 3001), plain('d', 3000), plain('e', 1000)];
  assert.deepEqual(order(list), ['a', 'b', 'c', 'd', 'e']);

  const plan = planOrderStep(list, 'd', 'up');
  assert.equal(plan.kind, 'rebalance', 'reported, not hidden — a caller logging "1 row" would be lying');
  assert.ok(plan.writes.length > 1);

  const after = applyPositionPlan(list, plan);
  assert.deepEqual(order(after), ['a', 'b', 'd', 'c', 'e'], 'and the row still moved exactly one place');
  const keys = orderedForDisplay(after).map((x) => x.sortKey);
  assert.equal(new Set(keys).size, keys.length, 'no two rows share a key');
});

// ── the control descriptor the UI renders from ────────────────────────────

test('describeOrderControls is DERIVED from the planners, so button and action agree', () => {
  const list = collection();

  const p1 = describeOrderControls(list, 'p1');
  assert.equal(p1.position, 1);
  assert.equal(p1.pinned, true);
  assert.deepEqual(p1.up, { enabled: false, reason: STEP_REFUSALS.LIST_END });
  assert.equal(p1.down.enabled, true);
  assert.deepEqual(p1.top, { enabled: false, reason: STEP_REFUSALS.ALREADY_TOP });

  const p2 = describeOrderControls(list, 'p2');
  assert.equal(p2.up.enabled, true);
  assert.deepEqual(p2.down, { enabled: false, reason: STEP_REFUSALS.PIN_BOUNDARY });

  const u1 = describeOrderControls(list, 'u1');
  assert.deepEqual(u1.up, { enabled: false, reason: STEP_REFUSALS.PIN_BOUNDARY });
  assert.equal(u1.down.enabled, true);
  assert.deepEqual(u1.top, { enabled: false, reason: STEP_REFUSALS.ALREADY_TOP });

  const u4 = describeOrderControls(list, 'u4');
  assert.equal(u4.position, 6);
  assert.equal(u4.pinned, false);
  assert.equal(u4.up.enabled, true);
  assert.deepEqual(u4.down, { enabled: false, reason: STEP_REFUSALS.LIST_END });
  assert.equal(u4.top.enabled, true);
  assert.equal(u4.pinnedCount, 2, 'the copy needs this to say where "the top" actually is');
});

test('the BULK descriptor agrees with the single-row one, row for row', () => {
  // Two entry points exist for one answer, which is exactly the shape this
  // codebase keeps paying for — so they are pinned as identical rather than
  // trusted to stay so. The bulk form exists only because the single-row form
  // sorts the whole collection once per row per control: over the real 486
  // articles that measured 244 ms, inside a useMemo that reruns after every
  // click. Sorting once brought it to 17 ms.
  const list = collection();
  const bulk = describeAllOrderControls(list);

  assert.equal(bulk.size, list.length, 'every row is described, none invented');
  for (const a of list) {
    assert.deepEqual(
      bulk.get(String(a._id)),
      describeOrderControls(list, a._id),
      `${a._id}: the bulk form and the single-row form disagree`,
    );
  }
});

test('CONTROL: the agreement above is over rows that genuinely DIFFER', () => {
  // Comparing two functions that both return a constant would pass the test
  // above. The fixture must contain rows whose descriptors are not all equal.
  const bulk = [...describeAllOrderControls(collection()).values()];
  const shapes = new Set(bulk.map((c) => JSON.stringify([c.up.enabled, c.down.enabled, c.top.enabled, c.pinned])));
  assert.ok(shapes.size >= 4, `only ${shapes.size} distinct control shapes — the fixture is too uniform`);
});

test('U4-f — CONTROL: the descriptor VARIES; a middle row has everything live', () => {
  // Every assertion above is satisfied by a descriptor that disables everything,
  // and half of them by one that enables everything.
  const mid = describeOrderControls(collection(), 'u2');
  assert.equal(mid.up.enabled, true);
  assert.equal(mid.down.enabled, true);
  assert.equal(mid.top.enabled, true);
  assert.equal(mid.up.reason, null, 'an enabled control carries no reason');
});

test('EVERY row gets controls — there is nothing to switch on first', () => {
  // The point of the rework, stated as a property rather than as a screenshot:
  // no row is inert, and no row needs promoting before it can be ordered.
  const list = collection();
  for (const a of list) {
    const c = describeOrderControls(list, a._id);
    assert.ok(
      c.up.enabled || c.down.enabled,
      `${a._id} has no live arrow at all — a row that cannot be reordered is the ` +
      '"switch something on first" problem this rework removes',
    );
    assert.ok(Number.isInteger(c.position) && c.position >= 1);
  }
});

test('a row not in the list throws a named error rather than planning a no-op', () => {
  for (const call of [
    () => planOrderStep(collection(), 'ghost', 'up'),
    () => planMoveToBlockTop(collection(), 'ghost'),
    () => describeOrderControls(collection(), 'ghost'),
    () => planMoveToRank(collection(), 'ghost', 2),
    () => describeRankTarget(collection(), 'ghost', 2),
  ]) {
    assert.throws(call, { name: 'NotInListError', message: /not in the supplied list/ });
  }
});

test('an unknown direction throws — it is a programmer error, not user input', () => {
  assert.throws(() => planOrderStep(collection(), 'u1', 'sideways'), /unknown direction/);
  assert.throws(() => planOrderStep(collection(), 'u1', undefined), /unknown direction/);
});

// ── N3-c/d · true neighbours, not the ones on screen ──────────────────────

test('N3-c/d — the neighbour comes from the FULL collection, not from a filtered view', () => {
  // THE CASE THE ADMIN LIST MAKES REACHABLE: a client-side search box and a
  // 12-row pager mean the row visually above another is often not its neighbour.
  // Here `u3` looks like the top of a filtered view containing only u3 and u4.
  const full = collection();
  const filtered = full.filter((a) => ['u3', 'u4'].includes(a._id));

  const real = planOrderStep(full, 'u3', 'up');
  const wrong = planOrderStep(filtered, 'u3', 'up');

  assert.deepEqual(
    order(applyPositionPlan(full, real)), ['p1', 'p2', 'u1', 'u3', 'u2', 'u4'],
    'against the whole collection u3 swaps with u2 — the row it is really below',
  );
  assert.equal(
    wrong.reason, STEP_REFUSALS.LIST_END,
    'against the filtered view u3 IS the first row, so the same call plans nothing. ' +
    'The two answers differ, which is why the server must never be handed a row list.',
  );
  assert.notDeepEqual(real.writes, wrong.writes, 'the distinction is real, not decorative');
});

// ── MOVING TO A TYPED RANK ────────────────────────────────────────────────
//
// The number the admin types is the number the LIST SHOWS, i.e. the output of
// assignArticleRanks, which numbers ACTIVE articles only. So a rank is not an
// index, and every assertion below is stated in terms of the RANK THE ARTICLE
// ENDS UP WITH rather than in terms of positions or raw field values — because
// the rank is the only thing that was promised.

const inactive = (id, sortKey) => art({ _id: id, active: false, sortKey });
const pinnedRow = (id, order, over = {}) =>
  art({ _id: id, isPinnedOnArticlePage: true, pinOrder: order, sortKey: 1000, ...over });

/** The rank the shipped ranker gives `id` — the number in the admin's first column. */
const rankOf = (list, id) => assignArticleRanks(list).find((a) => a._id === id)?.rank ?? null;

/**
 * Four unpinned rows with an INACTIVE one wedged in at display position 2.
 *
 * display:  u1   x(inactive)   u2   u3   u4
 * rank:      1        —         2    3    4
 *
 * Which is the whole point: from rank 2 down, rank and index part company, so a
 * planner that converted one into the other by arithmetic lands the article in
 * the wrong slot — and nothing errors, because the wrong slot is still a real
 * slot.
 */
function withInactive() {
  return [plain('u1', 5000), inactive('x', 4000), plain('u2', 3000), plain('u3', 2000), plain('u4', 1000)];
}

test('CONTROL: the inactive fixture really does separate rank from index', () => {
  // If it did not — if every row were active — every assertion in this section
  // would pass for an arithmetic implementation, and the section would be
  // testing nothing it claims to test.
  const list = withInactive();
  assert.deepEqual(order(list), ['u1', 'x', 'u2', 'u3', 'u4'], 'the inactive row sits in the ordering…');
  assert.equal(rankOf(list, 'x'), null, '…and holds no rank');
  assert.equal(rankOf(list, 'u3'), 3, 'u3 is rank 3');
  assert.equal(
    order(list).indexOf('u3'), 3,
    'and index 3 — 0-based, so `index = rank - 1` would resolve rank 3 to u2. THAT is ' +
    'the arithmetic this module refuses to do.',
  );
});

test('R-a — the typed rank resolves to the ROW holding it, not to an index', () => {
  // Moving DOWN is the case that separates the two: inserting before an
  // invisible row versus after it changes nothing about the ranks when moving
  // up, and changes everything when moving down.
  const list = withInactive();
  const plan = planMoveToRank(list, 'u1', 3);
  const after = applyPositionPlan(list, plan);

  assert.equal(
    rankOf(after, 'u1'), 3,
    'the article must end up at the rank that was typed. Nothing else was promised.',
  );
  assert.deepEqual(order(after), ['x', 'u2', 'u3', 'u1', 'u4'], 'and the rest keep their relative order');
});

test('R-a2 — CONTROL: the arithmetic conversion lands it somewhere else, silently', () => {
  // The control that makes R-a mean something. Same list, same typed number,
  // but the target resolved as `rank` (the naive position) instead of as the
  // anchor's position — which is what `index = rank - 1` amounts to once the
  // sub-planner's 1-based positions are accounted for.
  const list = withInactive();
  const unpinned = list.filter((a) => !isPositioned(a));
  const naive = applyPositionPlan(list, planSortKeyMove(unpinned, 'u1', 3));

  assert.equal(
    rankOf(naive, 'u1'), 2,
    'the arithmetic version puts u1 at rank 2 while the admin typed 3 — one short, ' +
    'no error, no symptom. If this ever comes back equal to 3 the fixture has lost ' +
    'its inactive row and R-a is vacuous.',
  );
  assert.notEqual(rankOf(naive, 'u1'), rankOf(applyPositionPlan(list, planMoveToRank(list, 'u1', 3)), 'u1'));
});

test('R-b — an UNPINNED row typed into the pinned block is refused, not clamped', () => {
  // "Typed a number that collides with the pinned group". Ranks 1..P belong to
  // the pinned block; moving into it is PINNING, a different act with different
  // consequences, and it lives on the edit screen.
  const list = collection();               // p1, p2 pinned; u1..u4 not
  const seen = describeRankTarget(list, 'u3', 2);

  assert.equal(seen.refusal, RANK_REFUSALS.PIN_BOUNDARY);
  assert.equal(seen.pinnedRanks, 2, 'and it knows how many ranks the block owns');
  assert.match(seen.message, /ลำดับ 1 ถึง 2 เป็นของกลุ่มปักหมุด/, 'the copy names the range plainly');
  assert.match(seen.message, /หน้าแก้ไขบทความ/, 'and where the act actually lives');

  const plan = planMoveToRank(list, 'u3', 2);
  assert.equal(plan.kind, 'noop');
  assert.equal(plan.reason, RANK_REFUSALS.PIN_BOUNDARY);
  assert.equal(
    plan.message, seen.message,
    'the refusal carries the descriptor\'s OWN sentence, so the server returns the ' +
    'text that was produced by the evaluation that refused — not a second lookup ' +
    'that could answer differently',
  );
  assert.deepEqual(plan.writes, [], 'nothing is written — a half-done crossing is worse than a refusal');
  assert.deepEqual(order(applyPositionPlan(list, plan)), DISPLAY, 'the list is untouched');
});

test('R-c — a PINNED row typed below the block is refused the same way', () => {
  const list = collection();
  const seen = describeRankTarget(list, 'p1', 5);

  assert.equal(seen.refusal, RANK_REFUSALS.PIN_BOUNDARY);
  assert.match(
    seen.message, /เลิกปักหมุด/,
    'the sentence must point the OTHER way for a pinned row — "join the group" is ' +
    'not the advice when the article is already in it',
  );
  assert.deepEqual(planMoveToRank(list, 'p1', 5).writes, []);
});

test('R-b/c — CONTROL: the same two rows accept a rank on their OWN side', () => {
  // Without this, "refused" would be indistinguishable from "this row cannot be
  // moved by typing at all", and R-b/R-c would prove nothing about the boundary.
  const list = collection();

  const down = planMoveToRank(list, 'u3', 6);   // unpinned → the far end of the unpinned mass
  assert.equal(down.reason, undefined, 'an accepted plan carries no refusal');
  assert.equal(rankOf(applyPositionPlan(list, down), 'u3'), 6);

  const inside = planMoveToRank(list, 'p1', 2); // pinned → inside its own block
  assert.equal(rankOf(applyPositionPlan(list, inside), 'p1'), 2);
});

test('R-d — a reorder INSIDE the pinned block re-emits contiguous 1..M', () => {
  // Reused wholesale from planMoveToPosition, which is what makes b-005
  // unrepresentable. A typed rank must not be an exception to it.
  const list = [pinnedRow('p1', 1), pinnedRow('p2', 2), pinnedRow('p3', 3), plain('u1', 5000)];
  const after = applyPositionPlan(list, planMoveToRank(list, 'p3', 1));

  const orders = after.filter(isPositioned).map((a) => a.pinOrder).sort((a, b) => a - b);
  assert.deepEqual(orders, [1, 2, 3], 'no duplicate, no gap');
  assert.deepEqual(order(after), ['p3', 'p1', 'p2', 'u1']);
  assert.equal(rankOf(after, 'p3'), 1);
  for (const w of planMoveToRank(list, 'p3', 1).writes) {
    assert.equal('sortKey' in w, false, 'a pinned-tier move must not write a sortKey');
  }
});

test('R-d2 — the pinned tier counts ACTIVE ranks, not block members', () => {
  // An inactive pinned article sits in the block and holds NO rank, so the
  // block owns ranks 1..(active pinned) — 2 here, not 3. Getting this wrong
  // makes the boundary copy name a range that does not exist and refuses a
  // number that is perfectly legal.
  const list = [
    pinnedRow('p1', 1), pinnedRow('pOff', 2, { active: false }), pinnedRow('p2', 3),
    plain('u1', 5000), plain('u2', 4000),
  ];
  const seen = describeRankTarget(list, 'p2', 1);
  assert.equal(seen.pinnedRanks, 2, 'two pinned articles are visible on /articles');
  assert.equal(seen.max, 4, 'and four articles are ranked in total');
  assert.equal(seen.refusal, null, 'rank 1 is inside the block, so this is a legal move');

  const after = applyPositionPlan(list, planMoveToRank(list, 'p2', 1));
  assert.equal(rankOf(after, 'p2'), 1);
  assert.equal(
    describeRankTarget(list, 'u1', 3).refusal, null,
    'and rank 3 — the first rank OUTSIDE the block — is legal for an unpinned row',
  );
});

test('R-e — an unpinned move writes exactly ONE sortKey', () => {
  const list = collection();
  const plan = planMoveToRank(list, 'u4', 3);

  assert.equal(plan.tier, 'sortKey');
  assert.equal(plan.kind, 'move');
  assert.equal(plan.writes.length, 1, 'one row — the whole reason the keys are spaced');
  assert.deepEqual(Object.keys(plan.writes[0]).sort(), ['_id', 'sortKey']);
  assert.equal(rankOf(applyPositionPlan(list, plan), 'u4'), 3);
});

test('R-f — an exhausted midpoint escalates to a rebalance and still lands the rank', () => {
  // The keys are one apart, so no integer sits between them. Rounding into a
  // collision would put two rows on one key, the tie would fall through to the
  // date order, and the rank the admin typed would stop deciding anything.
  // Rank 3 specifically: it lands e BETWEEN b and c, whose keys are 3002 and
  // 3001. Rank 2 would have put it between a (9000) and b, where there is a
  // 6,000-wide gap and no escalation happens at all — a fixture that would have
  // made this test a duplicate of R-e without saying so.
  const list = [plain('a', 9000), plain('b', 3002), plain('c', 3001), plain('d', 3000), plain('e', 1000)];
  assert.equal(planMoveToRank(list, 'e', 2).kind, 'move', 'room above b: an ordinary one-row move');

  const plan = planMoveToRank(list, 'e', 3);
  assert.equal(plan.kind, 'rebalance', 'reported, not hidden — "moved 1 row" would be a lie');
  assert.ok(plan.writes.length > 1);

  const after = applyPositionPlan(list, plan);
  assert.equal(rankOf(after, 'e'), 3, 'and the row still lands on the typed rank');
  const keys = orderedForDisplay(after).map((x) => x.sortKey);
  assert.equal(new Set(keys).size, keys.length, 'no two rows share a key');
});

test('R-g — the four coercion traps resolve to the CURRENT rank, never to 1', () => {
  // `Number(null)`, `Number('')`, `Number([])` and `Number(false)` are ALL 0 —
  // finite — so a coercive guard reads an emptied input as "position 0", clamps
  // it to 1, and promotes the article to the top of the list because someone
  // selected the text and pressed Delete.
  const list = collection();
  for (const trap of [null, '', [], false, NaN, Infinity, -Infinity, undefined, '   ']) {
    const seen = describeRankTarget(list, 'u4', trap);
    assert.equal(
      seen.refusal, null,
      `${JSON.stringify(trap)} must not be reported as a bad rank — it is no input at all`,
    );
    assert.equal(seen.noop, true, `${JSON.stringify(trap)} must resolve to a no-op`);
    assert.equal(seen.target, 6, `${JSON.stringify(trap)} must resolve to u4's CURRENT rank`);
    assert.deepEqual(
      planMoveToRank(list, 'u4', trap).writes, [],
      `${JSON.stringify(trap)} wrote something — an unusable input must move nothing`,
    );
  }
});

test('R-g2 — CONTROL: a real number DOES move the same row', () => {
  // Otherwise R-g passes for a planner that never writes anything at all.
  const list = collection();
  const plan = planMoveToRank(list, 'u4', 3);
  assert.ok(plan.writes.length > 0, 'a usable target must produce writes');
  assert.equal(rankOf(applyPositionPlan(list, plan), 'u4'), 3);

  // …and the string form of the same number works, because an <input> hands
  // back a string. If this ever stops working, every typed rank is a no-op.
  assert.deepEqual(planMoveToRank(list, 'u4', '3').writes, plan.writes);
});

test('R-h — out of range REFUSES; it does not clamp', () => {
  // A clicked arrow is a gesture the UI bounded, so clamping is a kindness. A
  // typed number is a claim, and quietly moving the article somewhere other
  // than where the admin typed is the failure this module exists to prevent.
  const list = collection();                       // six ranked rows
  for (const bad of [0, -3, 7, 900]) {
    const seen = describeRankTarget(list, 'u4', bad);
    assert.equal(seen.refusal, RANK_REFUSALS.NO_SUCH_RANK, `rank ${bad} must be refused`);
    assert.match(seen.message, /ระบุได้ตั้งแต่ 1 ถึง 6/, 'and the message names the live bounds');
    assert.deepEqual(planMoveToRank(list, 'u4', bad).writes, [], `rank ${bad} must write nothing`);
    assert.equal(
      rankOf(applyPositionPlan(list, planMoveToRank(list, 'u4', bad)), 'u4'), 6,
      `rank ${bad} moved the article. Clamping 900 to 6 would look like success and ` +
      'would be the "the number changed and nothing moved" defect wearing a smile.',
    );
  }
});

test('R-h2 — the bounds are DERIVED from the live collection', () => {
  // Not a constant, and not the row count: `max` counts RANKED rows, so an
  // inactive article is outside it. An input bounded by the row count would
  // offer numbers no article can hold.
  const list = withInactive();                     // five rows, four ranked
  const seen = describeRankTarget(list, 'u2', 2);
  assert.equal(seen.min, 1);
  assert.equal(seen.max, 4, 'four ACTIVE rows, not five rows');
  assert.equal(describeRankTarget(list, 'u2', 5).refusal, RANK_REFUSALS.NO_SUCH_RANK, 'rank 5 does not exist');
  assert.equal(describeRankTarget(collection(), 'u2', 6).refusal, null, 'while six is fine in a six-row list');
});

test('R-i — an INACTIVE subject is refused: it has no position to change', () => {
  // Reported as its own reason rather than as a bad number, because the admin
  // needs to look at the Active toggle, not at what they typed.
  const list = withInactive();
  const seen = describeRankTarget(list, 'x', 2);

  assert.equal(seen.refusal, RANK_REFUSALS.NOT_RANKED);
  assert.equal(seen.rank, null, 'and it reports no current rank');
  assert.match(seen.message, /ยังไม่เผยแพร่/, 'the sentence names the real cause');
  assert.notEqual(seen.refusal, RANK_REFUSALS.NO_SUCH_RANK, 'this is NOT "that number does not exist"');
  assert.deepEqual(planMoveToRank(list, 'x', 2).writes, []);
});

test('R-j — typing the rank the row already has is a NO-OP, not a refusal', () => {
  // The distinction the caller acts on: an empty plan with a reason is a
  // rejection to show the admin; an empty plan with no reason is agreement.
  const list = collection();
  const seen = describeRankTarget(list, 'u1', 3);   // u1 is already rank 3

  assert.equal(seen.rank, 3);
  assert.equal(seen.noop, true);
  assert.equal(seen.refusal, null, 'a correct number is not an error');
  assert.equal(seen.message, null, 'so there is nothing to warn about');

  const plan = planMoveToRank(list, 'u1', 3);
  assert.deepEqual(plan.writes, [], 'and nothing is written — modifiedCount must stay honest');
  assert.equal(plan.kind, 'move', 'kind `move` with no reason: agreement, not rejection');
  assert.equal(plan.reason, undefined);
});

test('R-l — a typed rank is NOT a back door into the pinned block', () => {
  // THE PINNED BLOCK IS CAPPED (MAX_PINNED_ARTICLES in articlePositioning.js),
  // and that cap lives on planPromotion. This test exists so a future edit
  // cannot open a second way in that skips it.
  //
  // Nothing here changed when the cap landed and nothing needed to: an unpinned
  // article aimed at a rank inside the block is already refused as PIN_BOUNDARY,
  // because moving across that line is PINNING — a different act, on a different
  // screen, with different consequences. The cap therefore adds no new path
  // through this planner. What would be a back door is this refusal weakening
  // into "just move it in", which would put an article into the block without
  // ever consulting the capacity check.
  const list = collection();               // p1, p2 pinned; u1..u4 not
  const before = list.filter(isPositioned).length;

  for (const rank of [1, 2]) {             // every rank the pinned block owns
    const plan = planMoveToRank(list, 'u3', rank);
    assert.equal(
      plan.reason, STEP_REFUSALS.PIN_BOUNDARY,
      `rank ${rank} is inside the pinned block and must be refused for an unpinned row`,
    );
    assert.deepEqual(plan.writes, [], `rank ${rank}: and nothing is written`);
    const after = applyPositionPlan(list, plan);
    assert.equal(
      after.filter(isPositioned).length, before,
      `rank ${rank}: the block did not grow — this planner cannot pin anything`,
    );
    assert.equal(
      isPositioned(after.find((a) => a._id === 'u3')), false,
      `rank ${rank}: and the subject is still unpinned`,
    );
  }

  // NO PLAN THIS MODULE PRODUCES MAY TOUCH `isPinnedOnArticlePage` AT ALL —
  // stated over every reachable target rather than only the refused ones,
  // because "refused at the boundary" would still leave a hole if some other
  // rank quietly emitted the field.
  for (const id of ['p1', 'p2', 'u1', 'u2', 'u3', 'u4']) {
    for (let rank = 1; rank <= 6; rank += 1) {
      for (const w of planMoveToRank(list, id, rank).writes) {
        assert.equal(
          'isPinnedOnArticlePage' in w, false,
          `${id} → rank ${rank} emitted a pin field: ${JSON.stringify(w)}. Membership is ` +
          'planPromotion/planDemotion\'s business, and only planPromotion is capped.',
        );
      }
    }
  }

  // …and the sweep really did produce writes, or the loop above is vacuous.
  assert.ok(
    planMoveToRank(list, 'u4', 3).writes.length > 0,
    'the sweep must include plans that actually write something',
  );
});

test('R-k — the planner refuses exactly what the descriptor warns about', () => {
  // ONE source for the client warning and the server refusal. If these two ever
  // disagree, the input offers something the action rejects — which is the
  // whole class of defect this module exists to close, arriving through a new
  // door.
  const list = [
    pinnedRow('p1', 1), pinnedRow('p2', 2),
    plain('u1', 5000), inactive('x', 4000), plain('u2', 3000), plain('u3', 2000),
  ];
  const ids = ['p1', 'p2', 'u1', 'x', 'u2', 'u3'];
  let refusals = 0;
  let moves = 0;

  for (const id of ids) {
    for (const t of [0, 1, 2, 3, 4, 5, 6, '2', null]) {
      const seen = describeRankTarget(list, id, t);
      const plan = planMoveToRank(list, id, t);
      if (seen.refusal) {
        refusals += 1;
        assert.equal(plan.reason, seen.refusal, `${id} → ${t}: descriptor and planner disagree`);
        assert.deepEqual(plan.writes, [], `${id} → ${t}: a refused plan must write nothing`);
      } else {
        assert.equal(plan.reason, undefined, `${id} → ${t}: the planner refused what the descriptor allowed`);
        if (plan.writes.length > 0) {
          moves += 1;
          assert.equal(
            rankOf(applyPositionPlan(list, plan), id), seen.target,
            `${id} → ${t}: the article did not land on the rank the descriptor promised`,
          );
        }
      }
    }
  }

  // The sweep must actually exercise both outcomes, or agreement is vacuous.
  assert.ok(refusals > 5, `only ${refusals} refusals across the sweep`);
  assert.ok(moves > 5, `only ${moves} real moves across the sweep`);
});
