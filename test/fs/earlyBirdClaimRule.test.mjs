import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import Promotion from '@/models/Promotion';
import {
  saveEarlyBird,
  getEarlyBirdClaim,
  EB_CLAIMED,
  EB_NEEDS_ADOPTION,
} from '@/lib/actions/course-promos';

/**
 * ONE COURSE, ONE EARLY BIRD — the rule, executed rather than read.
 *
 * ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 * `saveEarlyBird` was `findOneAndUpdate({course_id}, {$set}, {upsert:true})`
 * with `promotion_id` inside the `$set`. Saving an Early Bird for a course
 * another promotion already held REPLACED that promotion's row — owner, label,
 * price, deadline, schedule — with no error and no trace, and there is no audit
 * write on this path, so the overwrites were unrecoverable. Nothing warned.
 *
 * A source scan cannot see that. These tests CALL the action against fakeDb,
 * whose EarlyBirdConfig stub carries the real `course_id` unique index — which
 * is what turns the refusal from a check into a rule, because the racing write
 * is refused by E11000 rather than by a read that ran a moment earlier.
 *
 * ── ISOLATION ───────────────────────────────────────────────────────────────
 * The EarlyBirdConfig stub owns a PRIVATE fakeDb store, so `resetFakeDb()` in a
 * concurrently-running file cannot clear these rows mid-await. Each test clears
 * with `deleteMany` instead. `Promotion` is on the shared global store — it is
 * seeded and read back immediately, and only the human-facing TITLE depends on
 * it; every structural assertion below reads `promotion_id`, which comes from
 * the private store.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const OWNED_PROMOS = ['PROMO-A', 'PROMO-B'];

/**
 * The course codes this file owns. Deletes are SCOPED to them rather than
 * clearing the collection, because the EarlyBirdConfig store — private to the
 * stub, not to a file — is shared with test/fs/promotionEarlyBirdActions, which
 * runs concurrently. A wholesale clear there wiped rows here and vice versa.
 */
const OWNED_COURSES = ['MSE-AI', 'PYTHON-1'];

/**
 * EarlyBirdConfig is private to this file, so it clears wholesale. `Promotion`
 * is the SHARED global store, so only the ids this file creates are removed —
 * clearing it wholesale would delete another file's fixtures. Without this the
 * title lookup found a stale PROMO-A seeded by an earlier test here and named
 * the wrong promotion, which is a fixture leak, not a defect in the rule.
 */
async function reset() {
  await EarlyBirdConfig.deleteMany({ course_id: { $in: OWNED_COURSES } });
  await Promotion.deleteMany({ promotion_id: { $in: OWNED_PROMOS } });
}

/** The payload shape both screens send. */
const payload = (over = {}) => ({
  promotion_id: '',
  schedule_id: 'sched-1',
  label_th: 'Early Bird',
  special_price: 3900,
  deadline: '2026-12-01T00:00:00.000Z',
  is_active: true,
  ...over,
  });

const rowFor = async (courseId) =>
  EarlyBirdConfig.findOne({ course_id: courseId }).lean();

/**
 * ONE top-level test, and that is load-bearing.
 *
 * The suite runs `run({ concurrency: true })`, which makes TOP-LEVEL tests in
 * a file run concurrently with each other. Every block below shares the same
 * EarlyBirdConfig collection and clears it, so as five top-level tests they
 * wiped one another mid-await — green when run alone with concurrency:false,
 * red inside `npm test`. Subtests of one test are awaited in order, so this
 * nesting is what serialises them.
 */
test('one course, one Early Bird', async (t) => {
  await t.test('the claim read answers with THREE outcomes, not two', async (t) => {
  await t.test('a course nobody has configured is FREE', async () => {
    await reset();
    const claim = await getEarlyBirdClaim('MSE-AI');
    assert.equal(claim.status, 'free');
    assert.equal(claim.config, null);
  });

  /**
   * ── WHY THE TITLE IS NOT PINNED EXACTLY, STATED RATHER THAN SMOOTHED ───────
   * `promotion_title` is "the Promotion's title, falling back to its id", and
   * only the title half reads the SHARED global fakeDb store — which
   * test/fs/customPageDraftActions clears with `resetFakeDb()` while this file
   * awaits. Asserting the exact title here was measured going red in the full
   * suite for exactly that reason: a fixture loss, not a defect.
   *
   * So this asserts the CONTRACT — the claim always names something a human can
   * act on, and that something is one of the two documented values. The parts
   * that matter structurally (`status`, `promotion_id`) come from the PRIVATE
   * EarlyBirdConfig store and are pinned exactly.
   *
   * The gap this leaves is real: nothing here proves the title JOIN happens as
   * opposed to the fallback always firing. The fallback test below is what
   * bounds it, and closing the gap properly means moving Promotion to a private
   * store, which means migrating customPageDraftActions with it.
   */
  await t.test('a course whose row names a promotion is HELD, and names it', async () => {
    await reset();
    await Promotion.create({ promotion_id: 'PROMO-A', title: 'Excel for AI ต้อนรับปีใหม่' });
    await EarlyBirdConfig.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-A' });
    const claim = await getEarlyBirdClaim('MSE-AI');
    assert.equal(claim.status, 'held');
    assert.equal(claim.promotion_id, 'PROMO-A');
    assert.ok(claim.promotion_title, 'a held claim that names nothing is not a reason');
    assert.ok(
      ['Excel for AI ต้อนรับปีใหม่', 'PROMO-A'].includes(claim.promotion_title),
      `promotion_title was neither the title nor the id: ${claim.promotion_title}`
    );
  });

  await t.test('CONTROL: with no Promotion row at all, the claim falls back to the id', async () => {
    await reset();
    await EarlyBirdConfig.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-NOSUCH' });
    const claim = await getEarlyBirdClaim('MSE-AI');
    assert.equal(claim.status, 'held', 'a holder we cannot name is still a holder');
    assert.equal(claim.promotion_title, 'PROMO-NOSUCH');
  });

  await t.test('a course whose row names NO promotion is UNOWNED', async () => {
    await reset();
    await EarlyBirdConfig.create({ course_id: 'MSE-AI', promotion_id: '' });
    const claim = await getEarlyBirdClaim('MSE-AI');
    assert.equal(claim.status, 'unowned');
    assert.equal(claim.promotion_id, '');
    assert.ok(claim.config, 'the unowned row must come back — it is adoptable, not invisible');
  });

  await t.test(
    'CONTROL: UNOWNED collapses into neither of the other two — all three are distinct',
    async () => {
      await reset();
      const free = await getEarlyBirdClaim('MSE-AI');

      await EarlyBirdConfig.create({ course_id: 'MSE-AI', promotion_id: '' });
      const unowned = await getEarlyBirdClaim('MSE-AI');

      await reset();
      await EarlyBirdConfig.create({ course_id: 'MSE-AI', promotion_id: 'PROMO-A' });
      const held = await getEarlyBirdClaim('MSE-AI');

      assert.notEqual(unowned.status, free.status, 'unowned was folded into free');
      assert.notEqual(unowned.status, held.status, 'unowned was folded into held');
      assert.deepEqual(
        [free.status, unowned.status, held.status].sort(),
        ['free', 'held', 'unowned'],
        'the three outcomes are not three'
      );
    }
  );
  });

  await t.test('a free course accepts an Early Bird', async (t) => {
  await t.test('the first save CREATES the row', async () => {
    await reset();
    const res = await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
    assert.equal(res.ok, true);
    const row = await rowFor('MSE-AI');
    assert.ok(row, 'nothing was created');
    assert.equal(row.promotion_id, 'PROMO-A');
    assert.equal(row.schedule_id, 'sched-1');
    assert.equal(row.special_price, 3900);
    assert.equal(row.is_active, true);
  });

  await t.test('the owning promotion can edit its own row', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
    const res = await saveEarlyBird(
      'MSE-AI',
      payload({ promotion_id: 'PROMO-A', label_th: 'ลดพิเศษ', special_price: 2900 })
    );
    assert.equal(res.ok, true);
    const row = await rowFor('MSE-AI');
    assert.equal(row.label_th, 'ลดพิเศษ');
    assert.equal(row.special_price, 2900);
    assert.equal(row.promotion_id, 'PROMO-A', 'an edit changed the owner');
  });
  });

  await t.test('a course held by ANOTHER promotion is refused, not overwritten', async (t) => {
  await t.test('the save is refused with a reason that names the holder', async () => {
    await reset();
    await Promotion.create({ promotion_id: 'PROMO-A', title: 'โปรโมชันเดิม' });
    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));

    const res = await saveEarlyBird(
      'MSE-AI',
      payload({ promotion_id: 'PROMO-B', label_th: 'ของโปรใหม่', special_price: 1000 })
    );

    assert.equal(res.ok, false, 'the second promotion was allowed in');
    assert.equal(res.code, EB_CLAIMED);
    assert.equal(res.claim.promotion_id, 'PROMO-A');
    assert.match(res.error, /PROMO-A|โปรโมชันเดิม/, 'the refusal does not name the holder');
  });

  await t.test(
    'THE DEFECT: the holder’s row survives the refused save, field for field',
    async () => {
      await reset();
      await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
      const before = await rowFor('MSE-AI');

      await saveEarlyBird(
        'MSE-AI',
        payload({
          promotion_id: 'PROMO-B',
          label_th: 'ของโปรใหม่',
          special_price: 1000,
          schedule_id: 'sched-999',
          is_active: false,
        })
      );

      const after = await rowFor('MSE-AI');
      assert.equal(after.promotion_id, 'PROMO-A', 'the owner was replaced — the silent overwrite');
      assert.equal(after.label_th, before.label_th);
      assert.equal(after.special_price, before.special_price);
      assert.equal(after.schedule_id, before.schedule_id);
      assert.equal(after.is_active, before.is_active);
    }
  );

  await t.test('CONTROL: exactly ONE row exists — the refusal did not insert a rival', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-B' }));
    const rows = await EarlyBirdConfig.find({ course_id: 'MSE-AI' }).lean();
    assert.equal(rows.length, 1, 'one course, one Early Bird — a second row exists');
  });

  await t.test('a DIFFERENT course is unaffected — the rule is per course', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
    const res = await saveEarlyBird('PYTHON-1', payload({ promotion_id: 'PROMO-B' }));
    assert.equal(res.ok, true, 'the rule leaked across courses');
    assert.equal((await rowFor('PYTHON-1')).promotion_id, 'PROMO-B');
  });
  });

  await t.test('an UNOWNED row is adoptable, and only on an explicit confirmation', async (t) => {
  await t.test('without `adopt` the save is refused as NEEDS_ADOPTION', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: '', label_th: 'เดิม' }));

    const res = await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
    assert.equal(res.ok, false);
    assert.equal(res.code, EB_NEEDS_ADOPTION);
    assert.equal(res.claim.status, 'unowned');
  });

  await t.test('…and the row is left exactly as it was', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: '', label_th: 'เดิม' }));
    const before = await rowFor('MSE-AI');

    await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A', label_th: 'ใหม่' }));

    const after = await rowFor('MSE-AI');
    assert.equal(after.promotion_id, '', 'ownership moved without a confirmation');
    assert.equal(after.label_th, before.label_th, 'a refused save still edited the row');
  });

  await t.test('with `adopt: true` the row comes under the promotion', async () => {
    await reset();
    await saveEarlyBird('MSE-AI', payload({ promotion_id: '', label_th: 'เดิม' }));

    const res = await saveEarlyBird(
      'MSE-AI',
      payload({ promotion_id: 'PROMO-A', label_th: 'เดิม', adopt: true })
    );
    assert.equal(res.ok, true);
    assert.equal((await rowFor('MSE-AI')).promotion_id, 'PROMO-A');
  });

  await t.test(
    'adoption carrying the existing values changes ONLY the owner',
    async () => {
      await reset();
      await saveEarlyBird(
        'MSE-AI',
        payload({ promotion_id: '', label_th: 'เดิม', special_price: 4500, schedule_id: 'sched-7' })
      );
      const before = await rowFor('MSE-AI');

      // What the screen must send: the row's OWN values, plus the new owner.
      const res = await saveEarlyBird('MSE-AI', {
        promotion_id: 'PROMO-A',
        schedule_id: before.schedule_id,
        label_th: before.label_th,
        special_price: before.special_price,
        deadline: before.deadline,
        is_active: before.is_active,
        adopt: true,
      });

      assert.equal(res.ok, true);
      const after = await rowFor('MSE-AI');
      assert.equal(after.promotion_id, 'PROMO-A');
      assert.equal(after.label_th, 'เดิม', 'adoption rewrote the label');
      assert.equal(after.special_price, 4500, 'adoption rewrote the price');
      assert.equal(after.schedule_id, 'sched-7', 'adoption rewrote the schedule');
    }
  );

  await t.test(
    'CONTROL: adoption is not required when NO promotion is being attached',
    async () => {
      await reset();
      await saveEarlyBird('MSE-AI', payload({ promotion_id: '', label_th: 'เดิม' }));
      const res = await saveEarlyBird('MSE-AI', payload({ promotion_id: '', label_th: 'แก้ไข' }));
      assert.equal(res.ok, true, 'the course tab’s no-promotion path now demands a confirmation');
      assert.equal((await rowFor('MSE-AI')).label_th, 'แก้ไข');
    }
  );

  await t.test(
    'CONTROL: `adopt` does NOT unlock a course held by another promotion',
    async () => {
      await reset();
      await saveEarlyBird('MSE-AI', payload({ promotion_id: 'PROMO-A' }));
      const res = await saveEarlyBird(
        'MSE-AI',
        payload({ promotion_id: 'PROMO-B', adopt: true })
      );
      assert.equal(res.ok, false, 'adopt became a master key');
      assert.equal(res.code, EB_CLAIMED);
      assert.equal((await rowFor('MSE-AI')).promotion_id, 'PROMO-A');
    }
  );
  });

  await t.test('the writer is the only authority, and it is gated', async (t) => {
  const SRC = readFileSync(
    path.join(ROOT, 'src', 'lib', 'actions', 'course-promos.js'),
    'utf8'
  );

  await t.test('saveEarlyBird still holds the courses key for the course tab', () => {
    const slice = SRC.slice(SRC.indexOf('export async function saveEarlyBird'));
    assert.match(slice.slice(0, 200), /requireAdmin\('courses'\)/);
  });

  await t.test('the guarded write filters on the OWNER, not the course alone', () => {
    assert.match(
      SRC,
      /course_id: courseId,\s*\$or: \[\{ promotion_id: '' \}, \{ promotion_id: incoming \}\]/,
      'the filter is back to { course_id } alone — that is the silent overwrite'
    );
  });

  await t.test('CONTROL: the probe is live — it does not match a filter without $or', () => {
    assert.doesNotMatch(
      "{ course_id: courseId },",
      /course_id: courseId,\s*\$or: \[\{ promotion_id: '' \}, \{ promotion_id: incoming \}\]/
    );
  });

  await t.test('E11000 is turned into a refusal rather than thrown at the user', () => {
    assert.match(SRC, /err\?\.code === 11000/);
  });
  });
});
