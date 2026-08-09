import { test } from 'node:test';
import assert from 'node:assert/strict';

import Article, { ARTICLE_ORDER_INDEX } from '@/models/Article';
import { ARTICLE_SORT } from '@/lib/articleRank';
import { SORT_KEY_GAP } from '@/lib/articleSortKey';

// The stored shape of `sortKey`, asserted against the REAL Mongoose schema
// rather than the text of the model file — the same approach
// test/pure/articleListFields.test.mjs already takes, because a projection or a
// declaration that is merely spelled right in source is not the thing that runs.
//
// ROUND 1 OF 2. Two of the three assertions here are about what is deliberately
// NOT declared, and both of those absences are load-bearing.

test('R4-a — ArticleSchema declares sortKey as a Number with NO default', () => {
  const path = Article.schema.path('sortKey');
  assert.ok(path, 'sortKey is not on the schema — every planner below it has nowhere to write');
  assert.equal(path.instance, 'Number', `sortKey is declared as ${path.instance}`);

  assert.equal(
    path.defaultValue, undefined,
    'sortKey must have NO default. `getArticles` reads with .lean(), which does not ' +
    'apply Mongoose defaults, and serialize() then drops undefined keys — so a default ' +
    'would reach NEW documents only, while every pre-existing article still read back ' +
    'with the key absent. It would look like coverage and be none. Leaving it undeclared ' +
    'on old rows is what makes "has this been backfilled?" an answerable question.',
  );
  assert.equal(path.isRequired, undefined, 'and it is not required — a document may predate the backfill');
});

// ── ROUND 2 · the ordering index ──────────────────────────────────────────
//
// ROUND 1'S R4-b IS GONE FROM HERE, DELETED ON PURPOSE. It asserted that NO
// index declared `sortKey`, which was correct while nothing sorted by it and is
// exactly wrong now. It is replaced, in the same commit that adds the index, by
// the assertions below — an index is not merely present, it is present IN THE
// RIGHT DIRECTION, which is the part that is easy to get wrong and impossible
// to notice.

/**
 * An index serves a sort in its own direction or its exact reverse, and in no
 * other. Expressed as a predicate rather than as a string comparison so the
 * rule itself is the thing under test.
 */
function servesSort(indexKey, sortKey) {
  const ik = Object.entries(indexKey);
  const sk = Object.entries(sortKey);
  if (ik.length < sk.length) return false;
  const head = ik.slice(0, sk.length);
  if (head.some(([f], i) => f !== sk[i][0])) return false;      // same fields, same order
  const same = head.every(([, d], i) => d === sk[i][1]);
  const flipped = head.every(([, d], i) => d === -sk[i][1]);
  return same || flipped;
}

test('I1-a/b — an index serves the ordering cascade, in its own direction and key order', () => {
  const indexes = Article.schema.indexes().map(([fields]) => fields);
  const serving = indexes.filter((k) => servesSort(k, ARTICLE_SORT));

  assert.ok(
    serving.length > 0,
    'NO declared index can serve\n\n' +
    `    ${JSON.stringify(ARTICLE_SORT)}\n\n` +
    'so Mongo plans a COLLSCAN plus a blocking in-memory SORT. Nothing errors — ' +
    'the page simply degrades as the collection grows, until the 32 MB sort limit ' +
    'turns it into an outage. Declared indexes:\n' +
    indexes.map((k) => `    ${JSON.stringify(k)}`).join('\n'),
  );
  assert.deepEqual(
    ARTICLE_ORDER_INDEX, ARTICLE_SORT,
    'the exported index constant must BE the cascade — measured plan: ' +
    'LIMIT <- PROJECTION_SIMPLE <- FETCH <- IXSCAN, no SORT stage',
  );
  assert.deepEqual(
    Object.keys(ARTICLE_ORDER_INDEX), Object.keys(ARTICLE_SORT),
    'key ORDER matters as much as direction — a compound index is a prefix tree, ' +
    'not a set',
  );
});

test('I1-c — CONTROL: the round-1 proposal is rejected by the same predicate', () => {
  // The report for round 1 proposed {isPinnedOnArticlePage:1, pinOrder:1, sortKey:-1}.
  // It reverses to {-1,-1,1}, which matches neither the cascade nor its reverse,
  // and it was verified against a copy of the real data to plan a blocking SORT.
  // Without this control, I1-a passes for any index that merely names the three
  // fields.
  assert.equal(
    servesSort({ isPinnedOnArticlePage: 1, pinOrder: 1, sortKey: -1 }, ARTICLE_SORT), false,
    'the round-1 proposal must be rejected — it plans a COLLSCAN + blocking SORT',
  );
  assert.equal(
    servesSort({ isPinnedOnArticlePage: -1, pinOrder: 1, sortKey: -1 }, ARTICLE_SORT), true,
    'the cascade\'s own direction serves it',
  );
  assert.equal(
    servesSort({ isPinnedOnArticlePage: 1, pinOrder: -1, sortKey: 1 }, ARTICLE_SORT), true,
    'and so does its EXACT reverse — both were measured as IXSCAN with no SORT',
  );
  assert.equal(
    servesSort({ pinOrder: 1, isPinnedOnArticlePage: -1, sortKey: -1 }, ARTICLE_SORT), false,
    'right directions, wrong key order — a compound index is ordered',
  );
  assert.equal(
    servesSort({ isPinnedOnArticlePage: -1, pinOrder: 1 }, ARTICLE_SORT), false,
    'a PREFIX of the cascade is not enough: the sort still has to order sortKey ' +
    'within each (pin, pinOrder) group, which is the blocking part',
  );
});

test('I1-d — the pre-existing pinned-block index is still declared', () => {
  // It has the SAME defect against the old cascade — verified: sorting
  // {isPinnedOnArticlePage:-1, pinOrder:1} plans a blocking SORT against it,
  // while {1,1} and {-1,-1} both plan an IXSCAN. It is kept anyway, because it
  // still serves the equality-filtered block read that every pinned-block
  // planner wants: find({isPinnedOnArticlePage: true}).sort({pinOrder: 1})
  // measured as IXSCAN, 5 keys examined, 5 documents examined.
  //
  // Dropping an index is a production write and a separate decision. This test
  // exists so that "the new index supersedes it" is not assumed quietly.
  const indexes = Article.schema.indexes().map(([fields]) => fields);
  assert.ok(
    indexes.some((k) => JSON.stringify(k) === JSON.stringify({ isPinnedOnArticlePage: 1, pinOrder: 1 })),
    'the {isPinnedOnArticlePage:1, pinOrder:1} index was removed. If that is ' +
    'deliberate, it needs its own decision and a production drop — not a side ' +
    'effect of adding another index.',
  );
  assert.equal(
    servesSort({ isPinnedOnArticlePage: 1, pinOrder: 1 }, { isPinnedOnArticlePage: true, pinOrder: 1 }), false,
    'sanity: this is the SORT predicate, not a filter predicate — the block read ' +
    'it serves is an equality FILTER on the first key plus a sort on the second, ' +
    'which is a different shape and is why the index survives',
  );
});

test('R4-c — CONTROL: the schema and index scanners see what DOES exist', () => {
  // Both assertions above are satisfied by a scanner that reads nothing.
  const indexes = Article.schema.indexes();
  assert.ok(indexes.length >= 4, `only found ${indexes.length} indexes — the scanner is not scanning`);
  assert.ok(
    indexes.some(([f]) => 'pinOrder' in f),
    'the pinOrder indexes are declared and must be visible to the same filter the ' +
    'direction assertions above use',
  );

  const pinOrder = Article.schema.path('pinOrder');
  assert.ok(pinOrder, 'the path lookup works at all');
  assert.equal(pinOrder.instance, 'Number');
  assert.equal(
    pinOrder.defaultValue, 0,
    'and defaultValue really does report a declared default — otherwise R4-a would pass ' +
    'for every field on the schema',
  );

  assert.equal(SORT_KEY_GAP, 1000, 'the planner constant the create path spaces by');
});
