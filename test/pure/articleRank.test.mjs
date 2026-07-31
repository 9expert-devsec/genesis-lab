import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARTICLE_SORT,
  assignArticleRanks,
  compareArticlesForPublicOrder,
  isPubliclyOrdered,
  sortKeyOf,
} from '@/lib/articleRank';

// The admin list shows `pinOrder`, which is meaningful only for pinned rows —
// every unpinned article holds the default 0 — so there was no way to see where
// an article actually lands on /articles. The rank this helper assigns IS that
// position, and it duplicates the Mongo cascade in
// src/lib/actions/articles.js (getArticles):
//
//     { isPinnedOnArticlePage: -1, pinOrder: 1, publishedAt: -1, createdAt: -1 }
//
// These tests pin the BEHAVIOUR of that cascade, not the literal, so they will
// NOT notice if articles.js changes its sort and this helper does not. That
// coupling is called out in the helper's doc block; it is a known cost of being
// able to compute the rank without a database.
//
// Every fixture below is supplied in an order that is DELIBERATELY WRONG, so a
// helper that returned its input untouched fails rather than coincidentally
// agreeing (verified: stubbing it to `articles => articles` reddens these).

const ids = (list) => list.map((a) => a._id);

/** Ranked ids, best-first. */
function orderOf(articles) {
  return assignArticleRanks(articles)
    .filter((a) => a.rank != null)
    .sort((a, b) => a.rank - b.rank)
    .map((a) => a._id);
}

const art = (over) => ({
  _id: over._id,
  active: true,
  isPinnedOnArticlePage: false,
  pinOrder: 0,
  publishedAt: null,
  createdAt: '2020-01-01T00:00:00.000Z',
  ...over,
});

// ── 1. pinned outranks unpinned, whatever the dates say ───────────────────

test('a pinned article ranks above an unpinned one even when the unpinned one is far newer', () => {
  const input = [
    art({ _id: 'unpinned-brand-new', publishedAt: '2026-12-31T00:00:00.000Z' }),
    art({ _id: 'pinned-ancient', isPinnedOnArticlePage: true, pinOrder: 0, publishedAt: '2001-01-01T00:00:00.000Z' }),
    art({ _id: 'unpinned-old', publishedAt: '2024-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(orderOf(input), ['pinned-ancient', 'unpinned-brand-new', 'unpinned-old']);
});

// ── 2. among pinned, pinOrder ascending ───────────────────────────────────
// Dates are set to CONTRADICT pinOrder, so this fails if pinOrder is dropped
// from the comparator rather than passing on a lucky agreement between the two.

test('among pinned articles a lower pinOrder ranks first, overriding the dates', () => {
  const input = [
    art({ _id: 'pin-5-newest', isPinnedOnArticlePage: true, pinOrder: 5, publishedAt: '2026-06-01T00:00:00.000Z' }),
    art({ _id: 'pin-1-oldest', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2021-06-01T00:00:00.000Z' }),
    art({ _id: 'pin-3-middle', isPinnedOnArticlePage: true, pinOrder: 3, publishedAt: '2023-06-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    orderOf(input),
    ['pin-1-oldest', 'pin-3-middle', 'pin-5-newest'],
    'pinOrder must decide this; date order would give exactly the reverse',
  );
});

// ── 3. among unpinned, publishedAt descending ─────────────────────────────

test('among unpinned articles the newer publishedAt ranks first', () => {
  const input = [
    art({ _id: 'mid',    publishedAt: '2025-05-05T00:00:00.000Z' }),
    art({ _id: 'oldest', publishedAt: '2022-01-01T00:00:00.000Z' }),
    art({ _id: 'newest', publishedAt: '2026-07-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(orderOf(input), ['newest', 'mid', 'oldest']);
});

// ── 4. duplicate pinOrder — no longer reachable through the UI ────────────
// Nothing in the SCHEMA prevents two pinned articles from holding the same
// pinOrder, so this comparator still has to answer for the case. What has
// changed is how it can arise: the free number input and the single-row write
// behind it (`updateArticlePinOrder`) are gone, and every position now goes
// through planMoveToPosition, which re-emits the block as contiguous 1..M — so
// no sequence of admin actions can produce a duplicate. A tie now means
// something wrote pinOrder outside the planner: a restored backup, a hand edit,
// a script. When it happens the pin silently stops deciding the order and
// publishedAt takes over — which is why the UI flags this case in amber rather
// than showing the same confident pill it shows for a pin that IS honoured, and
// why that branch was kept as a corruption tripwire instead of deleted.

test('two pinned articles sharing a pinOrder fall through to publishedAt', () => {
  const input = [
    art({ _id: 'tie-older', isPinnedOnArticlePage: true, pinOrder: 2, publishedAt: '2024-01-01T00:00:00.000Z' }),
    art({ _id: 'tie-newer', isPinnedOnArticlePage: true, pinOrder: 2, publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'pin-ahead', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2010-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(orderOf(input), ['pin-ahead', 'tie-newer', 'tie-older']);
});

test('a shared pinOrder is reported as pinTie so the UI can say the pin is not deciding', () => {
  const input = [
    art({ _id: 'tie-a',  isPinnedOnArticlePage: true, pinOrder: 2, publishedAt: '2024-01-01T00:00:00.000Z' }),
    art({ _id: 'tie-b',  isPinnedOnArticlePage: true, pinOrder: 2, publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'alone',  isPinnedOnArticlePage: true, pinOrder: 7, publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'plain',  publishedAt: '2026-01-01T00:00:00.000Z' }),
  ];
  const by = new Map(assignArticleRanks(input).map((a) => [a._id, a]));

  assert.equal(by.get('tie-a').pinTie, true);
  assert.equal(by.get('tie-b').pinTie, true);
  assert.equal(by.get('alone').pinTie, false, 'a pinOrder held by one article is being honoured');
  assert.equal(by.get('plain').pinTie, false, 'unpinned articles all share pinOrder 0 — that is not a tie');

  assert.equal(by.get('alone').rankBasis, 'pinned');
  assert.equal(by.get('plain').rankBasis, 'date');
});

// ── 5. missing publishedAt ────────────────────────────────────────────────
// Null sorts BELOW Date in BSON order, so under `publishedAt: -1` the drafts do
// not jump to the top — they sink to the bottom, and `createdAt: -1` then
// orders them among themselves. Asserting BOTH halves: a null-publishedAt
// article with a very recent createdAt must NOT outrank a dated one.

test('an article with no publishedAt sinks below every dated article, then falls through to createdAt', () => {
  const input = [
    art({ _id: 'null-pub-created-recent', publishedAt: null, createdAt: '2026-12-01T00:00:00.000Z' }),
    art({ _id: 'dated-old',               publishedAt: '2022-01-01T00:00:00.000Z', createdAt: '2022-01-01T00:00:00.000Z' }),
    art({ _id: 'null-pub-created-older',  publishedAt: null, createdAt: '2021-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    orderOf(input),
    ['dated-old', 'null-pub-created-recent', 'null-pub-created-older'],
    'a draft created yesterday must not outrank a published article from 2022',
  );
});

test('publishedAt absent entirely behaves the same as publishedAt null', () => {
  const withNull = art({ _id: 'x', publishedAt: null, createdAt: '2025-01-01T00:00:00.000Z' });
  const absent = art({ _id: 'x', createdAt: '2025-01-01T00:00:00.000Z' });
  delete absent.publishedAt;
  const dated = art({ _id: 'd', publishedAt: '2020-01-01T00:00:00.000Z' });

  assert.equal(Math.sign(compareArticlesForPublicOrder(withNull, dated)), 1);
  assert.equal(Math.sign(compareArticlesForPublicOrder(absent, dated)), 1);
});

// ── 6. structural guarantees ──────────────────────────────────────────────

test('ranks are contiguous 1..N with no gaps or duplicates, over a permutation of the input', () => {
  const input = [
    art({ _id: 'a', publishedAt: '2025-01-01T00:00:00.000Z' }),
    art({ _id: 'b', isPinnedOnArticlePage: true, pinOrder: 3, publishedAt: '2019-01-01T00:00:00.000Z' }),
    art({ _id: 'c', publishedAt: null, createdAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'd', isPinnedOnArticlePage: true, pinOrder: 3, publishedAt: '2026-01-01T00:00:00.000Z' }),
    art({ _id: 'e', publishedAt: '2026-05-05T00:00:00.000Z' }),
    art({ _id: 'f', isPinnedOnArticlePage: true, pinOrder: 0, publishedAt: '2000-01-01T00:00:00.000Z' }),
  ];
  const out = assignArticleRanks(input);

  // permutation: same ids, none lost, none invented
  assert.equal(out.length, input.length);
  assert.deepEqual([...ids(out)].sort(), [...ids(input)].sort());

  const ranks = out.map((a) => a.rank).sort((x, y) => x - y);
  assert.deepEqual(
    ranks,
    Array.from({ length: input.length }, (_, i) => i + 1),
    'ranks must be exactly 1..N — a gap or a duplicate means two rows claim one slot',
  );
  assert.equal(new Set(ranks).size, ranks.length, 'no duplicate ranks');
});

test('the input array and its objects are not mutated', () => {
  const input = [
    art({ _id: 'a', publishedAt: '2025-01-01T00:00:00.000Z' }),
    art({ _id: 'b', isPinnedOnArticlePage: true, pinOrder: 1 }),
  ];
  const snapshot = JSON.parse(JSON.stringify(input));
  assignArticleRanks(input);
  assert.deepEqual(input, snapshot, 'assignArticleRanks must not touch what it is given');
  assert.ok(!('rank' in input[0]), 'rank must not be spliced onto the caller’s objects');
});

// ── inactive articles have no position, rather than a misleading one ──────
// /articles queries with `active: true`; the admin list does not filter, so it
// holds rows that are absent from the public page entirely.

test('inactive articles get rank null and do not consume a rank number', () => {
  const input = [
    art({ _id: 'live-2',  publishedAt: '2024-01-01T00:00:00.000Z' }),
    art({ _id: 'draft',   active: false, publishedAt: '2026-12-31T00:00:00.000Z' }),
    art({ _id: 'live-1',  publishedAt: '2026-01-01T00:00:00.000Z' }),
  ];
  const by = new Map(assignArticleRanks(input).map((a) => [a._id, a]));

  assert.equal(by.get('draft').rank, null, 'an inactive article has no position on /articles');
  assert.equal(by.get('draft').rankBasis, null);
  assert.equal(by.get('live-1').rank, 1);
  assert.equal(by.get('live-2').rank, 2, 'the inactive row must not push the live ones down');
  assert.equal(isPubliclyOrdered(input[1]), false);
});

// ── CONTROLS ─────────────────────────────────────────────────────────────

test('CONTROL: the fixtures are supplied out of order, so returning the input unchanged cannot pass', () => {
  // If any fixture happened to arrive already sorted, the corresponding test
  // would stay green against a do-nothing helper and prove nothing.
  const cases = [
    [art({ _id: '1', publishedAt: '2026-12-31T00:00:00.000Z' }),
     art({ _id: '2', isPinnedOnArticlePage: true, publishedAt: '2001-01-01T00:00:00.000Z' })],
    [art({ _id: '1', isPinnedOnArticlePage: true, pinOrder: 5, publishedAt: '2026-06-01T00:00:00.000Z' }),
     art({ _id: '2', isPinnedOnArticlePage: true, pinOrder: 1, publishedAt: '2021-06-01T00:00:00.000Z' })],
    [art({ _id: '1', publishedAt: '2025-05-05T00:00:00.000Z' }),
     art({ _id: '2', publishedAt: '2026-07-01T00:00:00.000Z' })],
  ];
  for (const [i, input] of cases.entries()) {
    assert.notDeepEqual(
      orderOf(input), ids(input),
      `fixture ${i} arrives already in rank order — it cannot detect a no-op helper`,
    );
  }
});

test('CONTROL: the comparator is live — it can return all three answers', () => {
  const a = art({ _id: 'a', publishedAt: '2026-01-01T00:00:00.000Z' });
  const b = art({ _id: 'b', publishedAt: '2020-01-01T00:00:00.000Z' });
  assert.ok(compareArticlesForPublicOrder(a, b) < 0, 'newer first');
  assert.ok(compareArticlesForPublicOrder(b, a) > 0, 'and the reverse');
  assert.equal(compareArticlesForPublicOrder(a, { ...a }), 0, 'identical inputs tie');
});

// ── ROUND 2 · sortKey is the third tier ───────────────────────────────────
//
// Every fixture ABOVE this line carries no `sortKey` at all, which is why none
// of them changed when the cascade did: with both keys absent the comparator
// falls through to the date tiers it always used. That is not luck, it is the
// missing-key rule — and it is also why those tests can no longer tell you
// anything about the tier that now decides the real list. These can.

test('C2-b — among UNPINNED articles sortKey decides, overriding publishedAt', () => {
  // Dates are set to CONTRADICT the keys, so a comparator that ignored sortKey
  // would produce exactly the reverse rather than passing on a lucky agreement.
  const input = [
    art({ _id: 'key-low',  sortKey: 1000, publishedAt: '2026-12-31T00:00:00.000Z' }),
    art({ _id: 'key-high', sortKey: 3000, publishedAt: '2020-01-01T00:00:00.000Z' }),
    art({ _id: 'key-mid',  sortKey: 2000, publishedAt: '2023-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    orderOf(input), ['key-high', 'key-mid', 'key-low'],
    'higher sortKey sits higher on the page; publishedAt order would be the reverse',
  );
});

test('C2-c — among PINNED articles pinOrder still decides, overriding sortKey', () => {
  // Ruling: pinOrder stays the SECOND cascade key. Pin ordering is controlled
  // separately from normal ordering, so a pinned block must not inherit sortKey.
  const input = [
    art({ _id: 'pin-2', isPinnedOnArticlePage: true, pinOrder: 2, sortKey: 9000 }),
    art({ _id: 'pin-1', isPinnedOnArticlePage: true, pinOrder: 1, sortKey: 1000 }),
    art({ _id: 'plain', sortKey: 500000 }),
  ];
  assert.deepEqual(
    orderOf(input), ['pin-1', 'pin-2', 'plain'],
    'pinOrder must win inside the block — sortKey order would give pin-2 first, and ' +
    'the unpinned row holds the highest key of all and still sorts last',
  );
});

test('C2-d — CONTROL: the sortKey order and the date order genuinely disagree', () => {
  // If they agreed on these fixtures, C2-b would pass against a comparator that
  // never looked at sortKey.
  const byKey = [
    art({ _id: 'key-low',  sortKey: 1000, publishedAt: '2026-12-31T00:00:00.000Z' }),
    art({ _id: 'key-high', sortKey: 3000, publishedAt: '2020-01-01T00:00:00.000Z' }),
  ];
  const stripped = byKey.map(({ sortKey, ...rest }) => rest);
  assert.deepEqual(orderOf(byKey), ['key-high', 'key-low'], 'with keys');
  assert.deepEqual(
    orderOf(stripped), ['key-low', 'key-high'],
    'without keys the SAME two rows come out the other way round — so the tier is ' +
    'doing the deciding, not the dates agreeing by accident',
  );
});

test('C2-e — a missing sortKey SINKS, matching Mongo { sortKey: -1 }', () => {
  // Under a descending sort an absent field sorts below every number. Reachable
  // between a deploy and a backfill; the failure to avoid is "absent" reading as
  // "first", which would put every un-backfilled row at the top of the list.
  const input = [
    art({ _id: 'no-key',  publishedAt: '2026-12-31T00:00:00.000Z' }),
    art({ _id: 'has-key', sortKey: 1, publishedAt: '2001-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(
    orderOf(input), ['has-key', 'no-key'],
    'even the LOWEST possible key outranks no key at all, and even against a far ' +
    'newer publishedAt',
  );
  assert.equal(sortKeyOf(input[0]), null, 'absent reads as null, never 0');
  assert.equal(sortKeyOf({ sortKey: 0 }), 0, 'and 0 is a real key, not absence');
});

test('C2-f — the JS comparator REFINES the Mongo cascade where Mongo is silent', () => {
  // Mongo stops at sortKey. Two rows with the SAME key leave its order
  // unspecified, so this helper continues into publishedAt/createdAt/_id to keep
  // a rank from shuffling between two renders of the same data.
  const input = [
    art({ _id: 'tie-older', sortKey: 4000, publishedAt: '2020-01-01T00:00:00.000Z' }),
    art({ _id: 'tie-newer', sortKey: 4000, publishedAt: '2026-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(orderOf(input), ['tie-newer', 'tie-older']);
  assert.deepEqual(orderOf([...input].reverse()), ['tie-newer', 'tie-older'], 'stable either way round');

  assert.deepEqual(
    Object.keys(ARTICLE_SORT), ['isPinnedOnArticlePage', 'pinOrder', 'sortKey'],
    'the Mongo cascade stops at sortKey — the extra tiers are this helper\'s alone, ' +
    'and are a refinement of that order rather than a contradiction of it',
  );
});

test('C2-g — CONTROL: the pin tiers still fire (the cascade was not flattened to sortKey)', () => {
  // A comparator rewritten as "just sortKey" would pass C2-b and C2-e.
  const pinnedLowKey = art({ _id: 'p', isPinnedOnArticlePage: true, pinOrder: 1, sortKey: 1 });
  const plainHighKey = art({ _id: 'q', sortKey: 999999 });
  assert.ok(
    compareArticlesForPublicOrder(pinnedLowKey, plainHighKey) < 0,
    'a pinned article with the lowest key in the collection still outranks an ' +
    'unpinned one with the highest',
  );

  // and the stray-pinOrder hazard (b-006) is still reachable, which is why
  // planBlockNormalization and the pinTie tripwire both stay
  const stray = art({ _id: 'stray', pinOrder: 7, sortKey: 999999 });
  const clean = art({ _id: 'clean', pinOrder: 0, sortKey: 1 });
  assert.ok(
    compareArticlesForPublicOrder(stray, clean) > 0,
    'an UNPINNED row carrying a non-zero pinOrder still sinks below every ' +
    'pinOrder:0 row, whatever its sortKey — pinOrder is still the second key',
  );
});
