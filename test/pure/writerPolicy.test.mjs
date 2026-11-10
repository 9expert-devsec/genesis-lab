import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WRITER_REFUSALS,
  checkDeleteWriter,
  checkSetWriterActive,
  checkWriterUpdate,
  writerArticleCountPipeline,
} from '@/lib/writers/writerPolicy';

/**
 * Every refusal the writer actions make, with the reads injected.
 * test/fs/writerActionGuards proves each action runs these before it writes.
 */

const ID = '68da60bb87a228e4c5f4c2c7';
const writer = { _id: ID, slug: 'chalaivate', displayName: 'อ.เวท', isActive: true, isDefault: false };
const academy = { ...writer, slug: '9expert-academy', isDefault: true };

const deps = (doc, articles = 0) => ({
  findWriter: async () => doc,
  countArticles: async () => articles,
});

test('CONTROL: a plain edit of an ordinary writer passes', async () => {
  const res = await checkWriterUpdate(ID, { slug: 'chalaivate', displayName: 'ใหม่' }, deps(writer));
  assert.equal(res.ok, true);
  assert.equal(res.current, writer);
});

test('a slug change is refused, with the message on the slug field', async () => {
  const res = await checkWriterUpdate(ID, { slug: 'other' }, deps(writer));
  assert.equal(res.ok, false);
  assert.equal(res.error, WRITER_REFUSALS.slugLocked);
  assert.equal(res.errors.slug, WRITER_REFUSALS.slugLocked);
});

test('CONTROL: sending the unchanged slug is not a change', async () => {
  assert.equal((await checkWriterUpdate(ID, { slug: 'chalaivate' }, deps(writer))).ok, true);
});

test('unsetting isDefault on the default writer is refused', async () => {
  const res = await checkWriterUpdate(ID, { isDefault: false }, deps(academy));
  assert.deepEqual(res, { ok: false, error: WRITER_REFUSALS.defaultFlag });
});

test('setting isDefault on an ordinary writer is refused', async () => {
  const res = await checkWriterUpdate(ID, { isDefault: true }, deps(writer));
  assert.deepEqual(res, { ok: false, error: WRITER_REFUSALS.defaultFlag });
});

test('deactivating the default writer through a save is refused', async () => {
  const res = await checkWriterUpdate(ID, { isActive: false }, deps(academy));
  assert.deepEqual(res, { ok: false, error: WRITER_REFUSALS.defaultDeactivate });
});

test('a save cannot deactivate: only the toggle moves the articles', async () => {
  for (const articles of [0, 3]) {
    const res = await checkWriterUpdate(ID, { isActive: false }, deps(writer, articles));
    assert.deepEqual(res, { ok: false, error: WRITER_REFUSALS.deactivateThroughSave });
  }
});

test('CONTROL: a save that leaves an inactive writer inactive is no deactivation', async () => {
  const off = { ...writer, isActive: false };
  assert.equal((await checkWriterUpdate(ID, { isActive: false }, deps(off))).ok, true);
});

test('the toggle refuses the default writer', async () => {
  const res = await checkSetWriterActive(ID, false, deps(academy));
  assert.deepEqual(res, { ok: false, error: WRITER_REFUSALS.defaultDeactivate });
});

test('the toggle passes a writer with articles: the action transfers them', async () => {
  assert.equal((await checkSetWriterActive(ID, false, deps(writer, 2))).ok, true);
});

test('the interim refusal is gone', () => {
  assert.equal('deactivateWithArticles' in WRITER_REFUSALS, false);
});

test('CONTROL: the toggle passes a writer with no articles', async () => {
  assert.equal((await checkSetWriterActive(ID, false, deps(writer, 0))).ok, true);
});

test('CONTROL: activating asks nothing about articles', async () => {
  const noCount = { findWriter: async () => writer, countArticles: async () => { throw new Error('counted'); } };
  assert.equal((await checkSetWriterActive(ID, true, noCount)).ok, true);
});

test('the article count is asked by the id of the writer in question', async () => {
  let asked;
  await checkDeleteWriter(ID, {
    findWriter: async () => writer,
    countArticles: async (id) => { asked = id; return 0; },
  });
  assert.equal(asked, ID);
});

test('delete refuses the default writer, before counting anything', async () => {
  const noCount = { findWriter: async () => academy, countArticles: async () => { throw new Error('counted'); } };
  assert.deepEqual(await checkDeleteWriter(ID, noCount), { ok: false, error: WRITER_REFUSALS.defaultDelete });
});

test('delete refuses a writer with articles', async () => {
  assert.deepEqual(
    await checkDeleteWriter(ID, deps(writer, 1)),
    { ok: false, error: WRITER_REFUSALS.deleteWithArticles(1) },
  );
});

test('CONTROL: delete passes an ordinary writer with no articles', async () => {
  assert.equal((await checkDeleteWriter(ID, deps(writer, 0))).ok, true);
});

for (const [name, check] of [
  ['update', (id, d) => checkWriterUpdate(id, {}, d)],
  ['toggle', (id, d) => checkSetWriterActive(id, false, d)],
  ['delete', checkDeleteWriter],
]) {
  test(`${name}: a writer that does not exist is refused`, async () => {
    assert.deepEqual(await check(ID, deps(null)), { ok: false, error: WRITER_REFUSALS.notFound });
  });

  test(`${name}: a malformed id is refused without reading`, async () => {
    const noRead = { findWriter: async () => { throw new Error('read'); }, countArticles: async () => 0 };
    assert.deepEqual(await check('not-an-id', noRead), { ok: false, error: WRITER_REFUSALS.notFound });
  });
}

test('the count pipeline only ever groups the writers it was asked about', () => {
  const ids = ['a', 'b'];
  const pipeline = writerArticleCountPipeline(ids);
  assert.deepEqual(pipeline[0], { $match: { writerIds: { $in: ids } } });
  // The second $match is the point: an article by a and c unwinds to two rows,
  // and without it c would come back as a group nobody asked for.
  assert.deepEqual(pipeline.map((stage) => Object.keys(stage)[0]), ['$match', '$unwind', '$match', '$group']);
  assert.deepEqual(pipeline[2], pipeline[0]);
});
