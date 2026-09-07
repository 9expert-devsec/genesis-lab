import { test } from 'node:test';
import assert from 'node:assert/strict';

import EarlyBirdConfig from '@/models/EarlyBirdConfig';
import { saveEarlyBird, savePromotionEarlyBird } from '@/lib/actions/course-promos';
import { EB_PAGE_CLAIMED } from '@/lib/earlyBird/codes';
import { refusesOwnerlessWrite } from '@/lib/earlyBird/ownership';

/**
 * A CALLER THAT NAMES NO OWNER MAY NOT TOUCH A ROW A PAGE OWNS.
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT IS *NOT* ────────────────────────────
 * It is NOT a fix landing beside its regression test. MEASURED before anything
 * was changed: a no-owner caller against a page-owned row was ALREADY refused
 * with EB_PAGE_CLAIMED and the row already survived field for field. A previous
 * round reported the opposite — it read `canWrite`'s shape and reasoned from it,
 * while `writeEarlyBird` reached the same answer through its own `!==`. The
 * claim was wrong; the behaviour was right.
 *
 * What was actually missing is what this file supplies. The rule was EMERGENT:
 * an inequality inside an action, agreeing by coincidence with a predicate in
 * ownership.js that nothing called, and no test executing either. An edit
 * narrowing that comparison to page callers only — which reads like a tidy-up,
 * because `incomingPage` is empty for two of the three callers — would have
 * reopened it in complete silence. Now the writer calls the named rule and this
 * executes it.
 *
 * ── THE CASE THAT MATTERS MOST IS THE THIRD ONE ──────────────────────────
 * The course tab FAILS OPEN when the owning page cannot be resolved: a deleted
 * or unreadable page leaves `ownerPage` null and the form fully enabled. That
 * is deliberate — locking a row to a page that is gone strands it with no
 * screen able to free it. It is only safe because the SERVER refuses anyway,
 * and the row keeps its `owner_page_id` whether or not the page behind it
 * resolves. That pairing is the whole design and nothing else asserts it.
 */

/** Course codes this file owns. Scoped deletes — the store is shared. */
const OWNED = ['EBH-1', 'EBH-2', 'EBH-3'];
const PAGE = '6a0c0a241133379189702ed3';

const reset = () => EarlyBirdConfig.deleteMany({ course_id: { $in: OWNED } });

/** What the COURSE TAB sends with its promotion select left empty. */
const ownerless = (over = {}) => ({
  promotion_id: '',
  schedule_id: 'sched-new',
  label_th: 'ทับของเดิม',
  special_price: 111,
  deadline: null,
  is_active: true,
  ...over,
});

const rowFor = (code) => EarlyBirdConfig.findOne({ course_id: code }).lean();

/**
 * ── ONE TOP-LEVEL TEST, AND IT IS LOAD-BEARING ────────────────────────────
 * The suite runs `run({ concurrency: true })`, so TOP-LEVEL tests in one file
 * run concurrently with each other. Both groups below share these course codes
 * and clear them, so as two top-level tests they wiped one another mid-await —
 * measured here as `rowFor(...)` returning null for a row created three lines
 * earlier. Subtests of one test are awaited in order, so this nesting is what
 * serialises them. test/fs/earlyBirdClaimRule carries the same note for the
 * same reason.
 */
test('ownership refuses a caller that names no owner', async (t) => {
await t.test('a caller naming no owner cannot write a page-owned row', async (t) => {
  await t.test('the pure rule answers before any database is involved', () => {
    const owned = { owner_page_id: PAGE };
    assert.equal(refusesOwnerlessWrite(owned, {}), true, 'a nameless caller was let in');
    assert.equal(refusesOwnerlessWrite(owned, { pageId: PAGE }), false, 'the owner was refused');
    assert.equal(
      refusesOwnerlessWrite(owned, { promotionId: 'PROMO-A' }), false,
      'a promotion caller is refused by canWrite, not by this rule — two answers for one case'
    );
    // The rule is about OWNED rows only; the other three states are not its business.
    assert.equal(refusesOwnerlessWrite({}, {}), false, 'an unowned row was locked');
    assert.equal(refusesOwnerlessWrite(null, {}), false, 'a missing row was locked');
    assert.equal(
      refusesOwnerlessWrite({ promotion_id: 'PROMO-A' }, {}), false,
      'a LEGACY row was refused here — that is EB_CLAIMED’s job, with its own way out'
    );
  });

  await t.test('THE RULE: the save is refused and the row survives field for field', async () => {
    await reset();
    await EarlyBirdConfig.create({
      course_id: 'EBH-1',
      owner_page_id: PAGE,
      schedule_id: 'sched-orig',
      label_th: 'ของหน้าเพจ',
      special_price: 999,
      is_active: true,
    });
    const before = await rowFor('EBH-1');

    const res = await saveEarlyBird('EBH-1', ownerless());

    assert.equal(res.ok, false, 'the course tab overwrote a page-owned row');
    assert.equal(res.code, EB_PAGE_CLAIMED);
    assert.equal(res.claim.owner_page_id, PAGE, 'the refusal does not name the owning page');

    const after = await rowFor('EBH-1');
    assert.equal(after.label_th, before.label_th);
    assert.equal(after.schedule_id, before.schedule_id);
    assert.equal(after.special_price, before.special_price);
    assert.equal(after.owner_page_id, PAGE, 'the owner was cleared by a refused save');
  });

  await t.test(
    '…and the refusal names a way out THIS caller can take, not "move it here"',
    async () => {
      await reset();
      await EarlyBirdConfig.create({ course_id: 'EBH-1', owner_page_id: PAGE });
      const res = await saveEarlyBird('EBH-1', ownerless());
      // The course tab is not a page. Telling its author the row can be "moved
      // to this page" names a destination they are not standing on.
      assert.doesNotMatch(res.error, /ย้ายมาที่หน้านี้/,
        'a non-page caller is told to move the row to a page it is not on');
      assert.match(res.error, /ยกเลิกการผูกในหน้านั้นก่อน/,
        'the refusal no longer says where the row is held');
    }
  );

  await t.test(
    'THE FAIL-OPEN CASE: a page that no longer exists still protects its row',
    async () => {
      /**
       * The course tab unlocks here — `getEarlyBirdAdminByCourse` resolves no
       * page and returns `ownerPage: null`, deliberately, so a row whose page is
       * gone is not stranded behind a lock nobody can lift. The server is what
       * makes that safe, and this is the assertion that says so: the row keeps
       * its `owner_page_id` whether or not anything resolves it.
       */
      await reset();
      await EarlyBirdConfig.create({
        course_id: 'EBH-2',
        owner_page_id: 'ffffffffffffffffffffffff', // a page id nothing resolves
        label_th: 'กำพร้า',
      });
      const res = await saveEarlyBird('EBH-2', ownerless());
      assert.equal(res.ok, false, 'an unresolvable owner unlocked the row on the server too');
      assert.equal(res.code, EB_PAGE_CLAIMED);
      assert.equal((await rowFor('EBH-2')).label_th, 'กำพร้า');
    }
  );
});

await t.test('CONTROL: the rule refuses only page-owned rows — the tab still works', async (t) => {
  await t.test('a FREE course still accepts a save with no owner named', async () => {
    await reset();
    const res = await saveEarlyBird('EBH-3', ownerless());
    assert.equal(res.ok, true, 'the course tab can no longer create an Early Bird');
    assert.equal((await rowFor('EBH-3')).label_th, 'ทับของเดิม');
  });

  await t.test('an UNOWNED row is still fully editable — all four live rows’ shape', async () => {
    await reset();
    await EarlyBirdConfig.create({ course_id: 'EBH-3', promotion_id: '', label_th: 'เดิม' });
    const res = await saveEarlyBird('EBH-3', ownerless());
    assert.equal(res.ok, true, 'the course tab lost its own rows');
    assert.equal((await rowFor('EBH-3')).label_th, 'ทับของเดิม');
  });

  await t.test('a PROMOTION caller editing its own row is untouched', async () => {
    /**
     * The clause must not fire for the promotion actions: they always supply a
     * `promotion_id` from the route, so they never look ownerless. Asserted
     * rather than argued, because "it cannot fire for them" is exactly the kind
     * of claim the previous round got wrong by reading instead of running.
     */
    await reset();
    await savePromotionEarlyBird('PROMO-OWN', 'EBH-3', ownerless({ label_th: 'ของโปร' }));
    const res = await savePromotionEarlyBird(
      'PROMO-OWN', 'EBH-3', ownerless({ label_th: 'แก้ไขแล้ว' })
    );
    assert.equal(res.ok, true, 'the promotion screen was caught by the ownerless rule');
    assert.equal((await rowFor('EBH-3')).label_th, 'แก้ไขแล้ว');
    await reset();
  });
});
});
