import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import {
  getEarlyBirdsForPromotion,
  getEarlyBirdClaimForPromotion,
  savePromotionEarlyBird,
  releaseEarlyBirdFromPromotion,
  deletePromotionEarlyBird,
  EB_CLAIMED,
  EB_NEEDS_ADOPTION,
} from '@/lib/actions/course-promos';

/**
 * The promotion side of the same rows — /admin/promotions/<id>/early-bird.
 *
 * A second VIEW, not a second authority: the claim rule these exercise is the
 * one test/fs/earlyBirdClaimRule pins on the course-tab entry point. What is
 * new here is scope — that holding the `promotions` key does not become a
 * licence to edit an arbitrary course's Early Bird, and that the promotion a
 * write lands on comes from the ROUTE rather than from the payload.
 *
 * ── ISOLATION ───────────────────────────────────────────────────────────────
 * The EarlyBirdConfig store is private to the STUB, which means it is shared by
 * every file that imports the model — including earlyBirdClaimRule, which runs
 * concurrently. So deletes here are scoped to the codes this file owns, and one
 * top-level test keeps its own blocks sequential.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const OWNED_COURSES = ['EBP-1', 'EBP-2', 'EBP-3'];
const P_A = 'PSET-A';
const P_B = 'PSET-B';

async function reset() {
  await EarlyBirdConfig.deleteMany({ course_id: { $in: OWNED_COURSES } });
}

const payload = (over = {}) => ({
  schedule_id: 'sched-1',
  label_th: 'Early Bird',
  special_price: 3900,
  deadline: '2026-12-01T00:00:00.000Z',
  is_active: true,
  ...over,
});

const rowFor = async (courseId) =>
  EarlyBirdConfig.findOne({ course_id: courseId }).lean();

test('a promotion manages its own Early Bird set', async (t) => {
  await t.test('the set lists only THIS promotion’s rows', async (t) => {
    await t.test('rows of another promotion are not in it', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      await savePromotionEarlyBird(P_B, 'EBP-2', payload());

      const mine = await getEarlyBirdsForPromotion(P_A);
      const codes = mine.map((r) => r.course_id);
      assert.ok(codes.includes('EBP-1'), 'the promotion cannot see its own row');
      assert.ok(!codes.includes('EBP-2'), 'another promotion’s row leaked into the set');
    });

    await t.test('CONTROL: the other promotion sees the other row', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      await savePromotionEarlyBird(P_B, 'EBP-2', payload());
      const theirs = await getEarlyBirdsForPromotion(P_B);
      assert.deepEqual(theirs.map((r) => r.course_id), ['EBP-2']);
    });

    await t.test('an unowned row belongs to no set', async () => {
      await reset();
      await EarlyBirdConfig.create({ course_id: 'EBP-3', promotion_id: '' });
      assert.equal((await getEarlyBirdsForPromotion(P_A)).length, 0);
      assert.equal((await getEarlyBirdsForPromotion(P_B)).length, 0);
      assert.ok(await rowFor('EBP-3'), 'the row must still exist — unowned is not deleted');
    });
  });

  await t.test('the advisory check answers relative to THIS promotion', async (t) => {
    await t.test('a row this promotion owns reads as `mine`, not `held`', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      const claim = await getEarlyBirdClaimForPromotion(P_A, 'EBP-1');
      assert.equal(claim.status, 'mine', 'a promotion was warned off its own row');
    });

    await t.test('CONTROL: the SAME row reads as `held` for a different promotion', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      const claim = await getEarlyBirdClaimForPromotion(P_B, 'EBP-1');
      assert.equal(claim.status, 'held');
      assert.equal(claim.promotion_id, P_A);
    });

    await t.test('a free course is free from either side', async () => {
      await reset();
      assert.equal((await getEarlyBirdClaimForPromotion(P_A, 'EBP-1')).status, 'free');
      assert.equal((await getEarlyBirdClaimForPromotion(P_B, 'EBP-1')).status, 'free');
    });
  });

  await t.test('the promotion-side write obeys the same rule', async (t) => {
    await t.test('a course held by another promotion is refused', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      const res = await savePromotionEarlyBird(P_B, 'EBP-1', payload({ special_price: 1 }));
      assert.equal(res.ok, false);
      assert.equal(res.code, EB_CLAIMED);
      assert.equal((await rowFor('EBP-1')).promotion_id, P_A, 'the holder was overwritten');
      assert.equal((await rowFor('EBP-1')).special_price, 3900);
    });

    await t.test('an unowned row still needs an explicit adoption', async () => {
      await reset();
      await EarlyBirdConfig.create({
        course_id: 'EBP-3', promotion_id: '', label_th: 'เดิม', special_price: 4500,
      });
      const res = await savePromotionEarlyBird(P_A, 'EBP-3', payload());
      assert.equal(res.code, EB_NEEDS_ADOPTION);
      assert.equal((await rowFor('EBP-3')).promotion_id, '', 'adopted without consent');
      assert.equal(
        res.claim.config.label_th,
        'เดิม',
        'the refusal must hand back the existing row — the screen fills the form from it'
      );
      assert.equal(res.claim.config.special_price, 4500);
    });

    await t.test('…and adoption with `adopt` moves it under this promotion', async () => {
      await reset();
      await EarlyBirdConfig.create({
        course_id: 'EBP-3', promotion_id: '', label_th: 'เดิม', special_price: 4500,
      });
      const res = await savePromotionEarlyBird(
        P_A, 'EBP-3', payload({ label_th: 'เดิม', special_price: 4500, adopt: true })
      );
      assert.equal(res.ok, true);
      const row = await rowFor('EBP-3');
      assert.equal(row.promotion_id, P_A);
      assert.equal(row.label_th, 'เดิม', 'adoption rewrote the label');
      assert.equal(row.special_price, 4500, 'adoption rewrote the price');
    });
  });

  await t.test('the promotion comes from the ROUTE, never from the payload', async (t) => {
    await t.test('a promotion_id in the data cannot redirect the write', async () => {
      await reset();
      const res = await savePromotionEarlyBird(
        P_A,
        'EBP-1',
        payload({ promotion_id: P_B })
      );
      assert.equal(res.ok, true);
      assert.equal(
        (await rowFor('EBP-1')).promotion_id,
        P_A,
        'a crafted payload pointed the write at another promotion’s set'
      );
    });

    await t.test('CONTROL: routing it through P_B really would land on P_B', async () => {
      await reset();
      await savePromotionEarlyBird(P_B, 'EBP-1', payload());
      assert.equal((await rowFor('EBP-1')).promotion_id, P_B);
    });

    await t.test('a missing course or promotion is refused, not written', async () => {
      await reset();
      assert.equal((await savePromotionEarlyBird(P_A, '', payload())).ok, false);
      assert.equal((await savePromotionEarlyBird('', 'EBP-1', payload())).ok, false);
      assert.equal(await rowFor('EBP-1'), null);
    });
  });

  await t.test('release and delete are different acts, both scoped', async (t) => {
    await t.test('release leaves the row configured and unowned', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload({ label_th: 'คงไว้' }));
      const res = await releaseEarlyBirdFromPromotion(P_A, 'EBP-1');
      assert.equal(res.ok, true);
      const row = await rowFor('EBP-1');
      assert.ok(row, 'release DELETED the row — that is the other button');
      assert.equal(row.promotion_id, '');
      assert.equal(row.label_th, 'คงไว้', 'release discarded the settings');
    });

    await t.test('delete removes the row outright', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      const res = await deletePromotionEarlyBird(P_A, 'EBP-1');
      assert.equal(res.ok, true);
      assert.equal(await rowFor('EBP-1'), null, 'delete left the row behind');
    });

    await t.test('CONTROL: neither touches a row owned by another promotion', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());

      const released = await releaseEarlyBirdFromPromotion(P_B, 'EBP-1');
      assert.equal(released.ok, false, 'a promotion released a row it does not own');
      assert.equal((await rowFor('EBP-1')).promotion_id, P_A);

      const deleted = await deletePromotionEarlyBird(P_B, 'EBP-1');
      assert.equal(deleted.ok, false, 'a promotion deleted a row it does not own');
      assert.ok(await rowFor('EBP-1'), 'the row was deleted by a promotion that does not own it');
    });

    await t.test('a released row can then be adopted by another promotion', async () => {
      await reset();
      await savePromotionEarlyBird(P_A, 'EBP-1', payload());
      await releaseEarlyBirdFromPromotion(P_A, 'EBP-1');
      const res = await savePromotionEarlyBird(P_B, 'EBP-1', payload({ adopt: true }));
      assert.equal(res.ok, true, 'releasing did not actually free the course');
      assert.equal((await rowFor('EBP-1')).promotion_id, P_B);
    });
  });

  await t.test('the screen mirrors the rule rather than re-implementing it', async (t) => {
    const CLIENT = readFileSync(
      path.join(
        ROOT, 'src', 'app', 'admin', 'promotions', '[id]', 'early-bird',
        '_components', 'PromotionEarlyBirdClient.jsx'
      ),
      'utf8'
    );

    await t.test('adoption fills the form from the EXISTING row before confirming', () => {
      assert.match(
        CLIENT,
        /res\.claim\?\.config/,
        'the adoption branch does not read the existing row — the confirmation ' +
          'would carry this form’s defaults in with the ownership change'
      );
      assert.match(CLIENT, /setPendingAdoption/);
    });

    await t.test('CONTROL: the probe is live — it does not match a file without it', () => {
      assert.doesNotMatch('const x = 1;', /res\.claim\?\.config/);
    });

    await t.test('the round picker keeps a saved round that has since rolled off', () => {
      assert.match(
        CLIENT,
        /!rounds\.some\(\(r\) => r\._id === form\.schedule_id\)/,
        'opening the form to change a price would silently drop the round'
      );
    });

    await t.test('every promotion-side action holds the promotions key', () => {
      const SRC = readFileSync(
        path.join(ROOT, 'src', 'lib', 'actions', 'course-promos.js'),
        'utf8'
      );
      for (const fn of [
        'getEarlyBirdsForPromotion',
        'getEarlyBirdClaimForPromotion',
        'getCourseRoundsForPromotion',
        'savePromotionEarlyBird',
        'releaseEarlyBirdFromPromotion',
        'deletePromotionEarlyBird',
      ]) {
        const at = SRC.indexOf(`export async function ${fn}`);
        assert.ok(at > 0, `${fn} is gone`);
        assert.match(
          SRC.slice(at, at + 220),
          /requireAdmin\('promotions'\)/,
          `${fn} does not hold the promotions key`
        );
      }
    });
  });
});
