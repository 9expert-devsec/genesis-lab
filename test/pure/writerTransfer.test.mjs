import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSFER_PATH_LIMIT,
  planWriterTransfer,
  transferArticlePaths,
  transferBulkOps,
} from '@/lib/writers/writerTransfer';

const GONE = 'a'.repeat(24);
const ACADEMY = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);

const academy = { _id: ACADEMY, displayName: '9Expert Academy' };
const other = { _id: OTHER, displayName: 'อ.เวท' };

const plan = (articles) => planWriterTransfer({ writerId: GONE, academy, articles, coWriters: [other] });

test('a sole writer becomes Academy', () => {
  const { writes, sole, coWritten } = plan([{ _id: 1, slug: 's', writerIds: [GONE] }]);
  assert.deepEqual(writes, [{ _id: 1, slug: 's', kind: 'sole', writerIds: [ACADEMY], author: '9Expert Academy' }]);
  assert.equal(sole, 1);
  assert.equal(coWritten, 0);
});

test('a co-written article loses the writer and does not gain Academy', () => {
  const { writes, sole, coWritten } = plan([{ _id: 1, slug: 's', writerIds: [GONE, OTHER] }]);
  assert.deepEqual(writes[0].writerIds, [OTHER]);
  assert.equal(writes[0].author, 'อ.เวท');
  assert.equal(sole, 0);
  assert.equal(coWritten, 1);
});

test('Academy is never duplicated when it is already a co-writer', () => {
  const { writes } = plan([{ _id: 1, slug: 's', writerIds: [GONE, ACADEMY] }]);
  assert.deepEqual(writes[0].writerIds, [ACADEMY]);
  assert.equal(writes[0].kind, 'coWritten');
  assert.equal(writes[0].author, '9Expert Academy');
});

test('no article ends up with no writers, across every shape', () => {
  const { writes } = plan([
    { _id: 1, slug: 'a', writerIds: [GONE] },
    { _id: 2, slug: 'b', writerIds: [GONE, GONE] },
    { _id: 3, slug: 'c', writerIds: [GONE, OTHER] },
    { _id: 4, slug: 'd', writerIds: [OTHER, GONE, ACADEMY] },
  ]);
  assert.equal(writes.length, 4);
  for (const write of writes) {
    assert.ok(write.writerIds.length > 0, String(write._id));
    assert.equal(new Set(write.writerIds).size, write.writerIds.length, String(write._id));
    assert.equal(write.writerIds.includes(GONE), false, String(write._id));
  }
});

test('the remaining writers keep their order, and the author string follows it', () => {
  const { writes } = plan([{ _id: 1, slug: 's', writerIds: [OTHER, GONE, ACADEMY] }]);
  assert.deepEqual(writes[0].writerIds, [OTHER, ACADEMY]);
  assert.equal(writes[0].author, 'อ.เวท & 9Expert Academy');
});

test('an article the writer is not on is left alone', () => {
  assert.deepEqual(plan([{ _id: 1, slug: 's', writerIds: [OTHER] }, { _id: 2, slug: 't' }]).writes, []);
});

test('ObjectId-like values compare by their string form', () => {
  const id = (value) => ({ toString: () => value });
  const { writes } = planWriterTransfer({
    writerId: id(GONE),
    academy: { _id: id(ACADEMY), displayName: 'A' },
    articles: [{ _id: 1, slug: 's', writerIds: [id(GONE)] }],
  });
  assert.deepEqual(writes[0].writerIds, [ACADEMY]);
});

test('sole op: sets the new writers, and only matches a writer who is still alone', () => {
  const [op] = transferBulkOps(plan([{ _id: 1, slug: 's', writerIds: [GONE] }]), GONE);
  assert.deepEqual(op.updateOne.filter, { _id: 1, writerIds: GONE, 'writerIds.1': { $exists: false } });
  assert.deepEqual(op.updateOne.update, { $set: { writerIds: [ACADEMY], author: '9Expert Academy' } });
});

test('co-written op: pulls the writer, and the filter needs a second writer to match', () => {
  const [op] = transferBulkOps(plan([{ _id: 1, slug: 's', writerIds: [GONE, OTHER] }]), GONE);
  assert.deepEqual(op.updateOne.filter, { _id: 1, writerIds: GONE, 'writerIds.1': { $exists: true } });
  assert.deepEqual(op.updateOne.update, { $pull: { writerIds: GONE }, $set: { author: 'อ.เวท' } });
});

test('every op keeps timestamps off and never names contentUpdatedAt', () => {
  const ops = transferBulkOps(plan([
    { _id: 1, slug: 's', writerIds: [GONE] },
    { _id: 2, slug: 't', writerIds: [GONE, OTHER] },
  ]), GONE);
  assert.equal(ops.length, 2);
  for (const op of ops) {
    assert.equal(op.updateOne.timestamps, false);
    assert.equal(JSON.stringify(op).includes('contentUpdatedAt'), false);
  }
});

test('touched pages are listed one by one, with Thai slugs encoded', () => {
  const { paths, wholeRoute } = transferArticlePaths(plan([{ _id: 1, slug: 'บทความ', writerIds: [GONE] }]));
  assert.deepEqual(paths, [`/articles/${encodeURIComponent('บทความ')}`]);
  assert.equal(wholeRoute, false);
});

test('past the limit, the whole article route is revalidated instead', () => {
  const articles = (n) => Array.from({ length: n }, (_, i) => ({ _id: i, slug: `s${i}`, writerIds: [GONE] }));
  assert.equal(transferArticlePaths(plan(articles(TRANSFER_PATH_LIMIT))).paths.length, TRANSFER_PATH_LIMIT);
  assert.deepEqual(transferArticlePaths(plan(articles(TRANSFER_PATH_LIMIT + 1))), { paths: [], wholeRoute: true });
});
