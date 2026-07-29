import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planPromotion,
  planDemotion,
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
