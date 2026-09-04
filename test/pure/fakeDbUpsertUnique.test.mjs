import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeModel, makeStore, seed, all, count } from '../fakeDb.mjs';

/**
 * The two capabilities test/fakeDb.mjs gained so that the one-course-one-Early-Bird
 * RULE can be executed rather than merely read: `findOneAndUpdate` honours
 * `upsert`, and a declared unique field can collide with E11000.
 *
 * ── WHY THE FAKE ITSELF GETS TESTS ──────────────────────────────────────────
 * Because both gaps were silent in the direction that produces a false GREEN.
 * The old `findOneAndUpdate` returned `null` and inserted nothing whenever the
 * filter missed, `upsert` or not — so a test asserting "the first save creates
 * the row" would have passed against a fake that created nothing, and a test
 * asserting "a second promotion is refused" would have passed against a fake
 * where the refusing collision never occurred. A fake is only worth what its
 * disagreements with Mongo cost, so the disagreements are pinned here.
 *
 * ── WHY EVERY TEST TAKES ITS OWN STORE ──────────────────────────────────────
 * `npm test` is ONE process with `concurrency: true`, and `resetFakeDb()` wipes
 * the module-global store for everyone. These tests passed alone and failed in
 * the suite until each took a private store: another file's reset was landing
 * while this one awaited an async model method. Nothing here calls
 * `resetFakeDb`, on purpose — a private store needs no reset and cannot be
 * cleared by a neighbour.
 *
 * Every claim below ships a CONTROL, and each control is the collapse that
 * would make the claim vacuous — not merely a happy path repeated.
 */

const UNIQUE = ['course_id'];

/** A model and its own isolated store, for one test. */
function fresh({ unique = [] } = {}) {
  const store = makeStore();
  return { M: makeModel('Eb', { unique, store }), store };
}

test('findOneAndUpdate honours upsert', async (t) => {
  await t.test('a filter that misses INSERTS when upsert is set', async () => {
    const { M, store } = fresh();
    const doc = await M.findOneAndUpdate(
      { course_id: 'MSE-AI' },
      { $set: { label_th: 'Early Bird' } },
      { upsert: true, new: true }
    );
    assert.equal(count('Eb', store), 1, 'upsert inserted nothing');
    assert.equal(doc?.course_id, 'MSE-AI');
    assert.equal(doc?.label_th, 'Early Bird');
  });

  await t.test(
    'CONTROL: the SAME call without upsert returns null and inserts nothing',
    async () => {
      const { M, store } = fresh();
      const doc = await M.findOneAndUpdate(
        { course_id: 'MSE-AI' },
        { $set: { label_th: 'Early Bird' } },
        { new: true }
      );
      assert.equal(doc, null, 'a missing row must not be conjured without upsert');
      assert.equal(count('Eb', store), 0);
    }
  );

  await t.test('a filter that MATCHES updates in place and creates no second row', async () => {
    const { M, store } = fresh();
    seed('Eb', { course_id: 'MSE-AI', label_th: 'old', special_price: 3900 }, store);
    const doc = await M.findOneAndUpdate(
      { course_id: 'MSE-AI' },
      { $set: { label_th: 'new' } },
      { upsert: true, new: true }
    );
    assert.equal(count('Eb', store), 1, 'upsert duplicated a row it should have updated');
    assert.equal(doc?.label_th, 'new');
    assert.equal(doc?.special_price, 3900, 'the untouched field was dropped');
  });

  await t.test('$setOnInsert lands on the INSERT path', async () => {
    const { M, store } = fresh();
    await M.findOneAndUpdate(
      { course_id: 'MSE-AI' },
      { $set: { label_th: 'Early Bird' }, $setOnInsert: { created_by: 'seed' } },
      { upsert: true, new: true }
    );
    assert.equal(all('Eb', store)[0].created_by, 'seed');
  });

  await t.test('CONTROL: $setOnInsert does NOT apply when the row already exists', async () => {
    const { M, store } = fresh();
    seed('Eb', { course_id: 'MSE-AI', created_by: 'original' }, store);
    await M.findOneAndUpdate(
      { course_id: 'MSE-AI' },
      { $set: { label_th: 'Early Bird' }, $setOnInsert: { created_by: 'seed' } },
      { upsert: true, new: true }
    );
    assert.equal(
      all('Eb', store)[0].created_by,
      'original',
      '$setOnInsert overwrote an existing row — that is a $set, not a $setOnInsert'
    );
  });

  await t.test('the insert is seeded from the filter EQUALITY fields', async () => {
    const { M, store } = fresh();
    await M.findOneAndUpdate(
      { course_id: 'MSE-AI', tenant: 'public' },
      { $set: { label_th: 'Early Bird' } },
      { upsert: true, new: true }
    );
    const row = all('Eb', store)[0];
    assert.equal(row.course_id, 'MSE-AI');
    assert.equal(row.tenant, 'public');
  });

  await t.test(
    'CONTROL: $or and operator objects are NOT folded into the inserted document',
    async () => {
      const { M, store } = fresh();
      await M.findOneAndUpdate(
        {
          course_id: 'MSE-AI',
          $or: [{ promotion_id: '' }, { promotion_id: 'PROMO-A' }],
          version: { $ne: 9 },
        },
        { $set: { label_th: 'Early Bird' } },
        { upsert: true, new: true }
      );
      const row = all('Eb', store)[0];
      assert.ok(!('$or' in row), 'the fake invented a document Mongo would not create');
      assert.ok(!('version' in row), 'an operator constraint leaked in as a value');
      assert.equal(
        row.promotion_id,
        undefined,
        '$or must not decide the new row’s owner — only $set/$setOnInsert may'
      );
    }
  );

  await t.test('an upsert-insert with new:false returns null, as Mongo does', async () => {
    const { M, store } = fresh();
    const doc = await M.findOneAndUpdate(
      { course_id: 'MSE-AI' },
      { $set: { label_th: 'Early Bird' } },
      { upsert: true, new: false }
    );
    assert.equal(doc, null, 'there is no pre-image of a row that did not exist');
    assert.equal(count('Eb', store), 1, 'new:false must still have inserted');
  });

  await t.test('an unsupported update operator throws rather than being ignored', async () => {
    const { M } = fresh();
    await assert.rejects(
      () => M.findOneAndUpdate({ course_id: 'X' }, { $push: { tags: 'a' } }, { upsert: true }),
      /unsupported update operator/
    );
  });
});

test('a declared unique field collides with E11000', async (t) => {
  await t.test('create() on a taken value throws code 11000', async () => {
    const { M, store } = fresh({ unique: UNIQUE });
    await M.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-A' });
    await assert.rejects(
      () => M.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-B' }),
      (err) => {
        assert.equal(err.code, 11000, 'the code callers branch on is missing');
        assert.match(err.message, /E11000/);
        assert.deepEqual(err.keyValue, { course_id: 'MSE-AI' });
        return true;
      }
    );
    assert.equal(count('Eb', store), 1, 'the losing insert landed anyway');
  });

  await t.test(
    'CONTROL: a collection that declares NO unique field accepts the same duplicate',
    async () => {
      const { M, store } = fresh();
      await M.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-A' });
      await M.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-B' });
      assert.equal(
        count('Eb', store),
        2,
        'uniqueness must be opt-in — inferring it would change every existing collection'
      );
    }
  );

  await t.test('the upsert INSERT path collides too — this is the refusal', async () => {
    const { M, store } = fresh({ unique: UNIQUE });
    seed('Eb', { course_id: 'MSE-AI', promotion_id: 'PROMO-A' }, store);
    // PROMO-B's guarded write: the filter names only the owners it may edit, so
    // it MISSES the PROMO-A row, tries to insert, and hits the unique index.
    await assert.rejects(
      () =>
        M.findOneAndUpdate(
          { course_id: 'MSE-AI', $or: [{ promotion_id: '' }, { promotion_id: 'PROMO-B' }] },
          { $set: { promotion_id: 'PROMO-B' } },
          { upsert: true, new: true }
        ),
      (err) => err.code === 11000
    );
    assert.equal(count('Eb', store), 1);
    assert.equal(all('Eb', store)[0].promotion_id, 'PROMO-A', 'the holder was overwritten');
  });

  await t.test(
    'CONTROL: the same guarded write MATCHES and edits when the row is already its own',
    async () => {
      const { M, store } = fresh({ unique: UNIQUE });
      seed('Eb', { course_id: 'MSE-AI', promotion_id: 'PROMO-B', label_th: 'old' }, store);
      const doc = await M.findOneAndUpdate(
        { course_id: 'MSE-AI', $or: [{ promotion_id: '' }, { promotion_id: 'PROMO-B' }] },
        { $set: { promotion_id: 'PROMO-B', label_th: 'new' } },
        { upsert: true, new: true }
      );
      assert.equal(doc?.label_th, 'new', 'an owner cannot edit its own row');
      assert.equal(count('Eb', store), 1);
    }
  );

  await t.test('an UPDATE that moves a unique field onto a taken value collides', async () => {
    const { M, store } = fresh({ unique: UNIQUE });
    seed('Eb', { _id: 'r1', course_id: 'MSE-AI' }, store);
    seed('Eb', { _id: 'r2', course_id: 'PYTHON-1' }, store);
    await assert.rejects(
      () => M.findOneAndUpdate({ _id: 'r2' }, { $set: { course_id: 'MSE-AI' } }),
      (err) => err.code === 11000
    );
  });

  await t.test('CONTROL: moving it onto a FREE value succeeds', async () => {
    const { M, store } = fresh({ unique: UNIQUE });
    seed('Eb', { _id: 'r1', course_id: 'MSE-AI' }, store);
    seed('Eb', { _id: 'r2', course_id: 'PYTHON-1' }, store);
    const doc = await M.findOneAndUpdate({ _id: 'r2' }, { $set: { course_id: 'PYTHON-2' } });
    assert.equal(doc?.course_id, 'PYTHON-2');
  });

  await t.test('a row does not collide with ITSELF on a no-op rewrite', async () => {
    const { M, store } = fresh({ unique: UNIQUE });
    seed('Eb', { _id: 'r1', course_id: 'MSE-AI', label_th: 'old' }, store);
    const doc = await M.findOneAndUpdate(
      { _id: 'r1' },
      { $set: { course_id: 'MSE-AI', label_th: 'new' } }
    );
    assert.equal(doc?.label_th, 'new', 'a row was refused for holding its own value');
  });
});
