import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OWNER_STATES,
  resolveOwner,
  ownerPageIdOf,
  ownerPromotionIdOf,
  canWrite,
  ownerFilter,
  earlyBirdUpdate,
} from '@/lib/earlyBird/ownership';

/**
 * THE FOUR OWNERSHIP STATES, on a CONSTRUCTED FIXTURE.
 *
 * ── WHY NOT THE LIVE CORPUS ────────────────────────────────────────────────
 * Measured against the deployed collection: 4 rows, ALL of them `legacy_owned`
 * (every one carries a non-empty `promotion_id`), 0 `unowned`, 0 carrying
 * `owner_page_id` at all. So three of the four states — and the whole adopt
 * path — have no real data behind them, and a test that sampled production
 * would prove one branch and silently skip the rest.
 *
 * That absence is also the reason these are the states worth pinning HERE
 * rather than only through the action: `page_owned` is unreachable end-to-end
 * until the page writer lands, and a rule nothing can currently exercise is
 * exactly the kind that ships wrong. This module is pure, so the states can be
 * constructed directly and every one of them proved today.
 *
 * ── THE ABSENT-KEY CASE IS THE POINT, NOT AN EDGE ──────────────────────────
 * `owner_page_id` is a NEW field. `.lean()` applies no Mongoose defaults and
 * JSON serialisation drops undefined keys, so every row stored before it
 * existed reads the key back MISSING rather than `''`. A discriminator that
 * only handled `''` would read every legacy row's missing field as a value and
 * call it page-owned. Several assertions below pass no key at all, deliberately.
 */

const PAGE = '6a0c0a241133379189702ed3';
const OTHER_PAGE = '69f84930b40c24150ba7505f';
const PROMO = 'PROMO-A';

// ── the four states ─────────────────────────────────────────────────────────

test('no row at all is FREE', () => {
  assert.equal(resolveOwner(null), 'free');
  assert.equal(resolveOwner(undefined), 'free');
});

test('a row with neither owner is UNOWNED — and an ABSENT key counts as neither', () => {
  assert.equal(resolveOwner({ course_id: 'MSE-AI' }), 'unowned', 'absent keys');
  assert.equal(resolveOwner({ promotion_id: '', owner_page_id: '' }), 'unowned', 'empty keys');
  assert.equal(resolveOwner({ promotion_id: null, owner_page_id: null }), 'unowned', 'null keys');
  assert.equal(resolveOwner({ promotion_id: '   ' }), 'unowned', 'whitespace is not an owner');
});

test('a row with only a promotion is LEGACY_OWNED — the shape of all four live rows', () => {
  assert.equal(resolveOwner({ promotion_id: PROMO }), 'legacy_owned');
  // The real shape: the field simply does not exist on a row stored before it did.
  assert.equal(
    resolveOwner({ course_id: 'MSE-AI', promotion_id: PROMO, schedule_id: 'x' }),
    'legacy_owned',
    'a missing owner_page_id was read as a value'
  );
});

test('a row with a page is PAGE_OWNED', () => {
  assert.equal(resolveOwner({ owner_page_id: PAGE }), 'page_owned');
});

test('BOTH set is PAGE_OWNED — the page is checked first and wins outright', () => {
  /**
   * Not a hypothetical: this is exactly what adopting a RELEASED legacy row
   * produces, because adoption sets the page and leaves promotion_id as it was.
   * Reading promotion_id first would make an adopted row answer "legacy" and
   * refuse the page its own row.
   */
  assert.equal(resolveOwner({ owner_page_id: PAGE, promotion_id: PROMO }), 'page_owned');
});

test('CONTROL: the four states are four — none collapses into another', () => {
  const seen = [
    resolveOwner(null),
    resolveOwner({}),
    resolveOwner({ promotion_id: PROMO }),
    resolveOwner({ owner_page_id: PAGE }),
  ];
  assert.deepEqual([...seen].sort(), [...OWNER_STATES].sort(), 'the four outcomes are not four');
  assert.equal(new Set(seen).size, 4, 'two states answered the same');
});

test('CONTROL: a non-object is free rather than a crash', () => {
  assert.equal(resolveOwner('MSE-AI'), 'free');
  assert.equal(resolveOwner(7), 'free');
});

// ── the accessors ───────────────────────────────────────────────────────────

test('the accessors normalise absent, null and whitespace to the empty string', () => {
  assert.equal(ownerPageIdOf({}), '');
  assert.equal(ownerPageIdOf({ owner_page_id: null }), '');
  assert.equal(ownerPageIdOf({ owner_page_id: `  ${PAGE}  ` }), PAGE);
  assert.equal(ownerPromotionIdOf(undefined), '');
  assert.equal(ownerPromotionIdOf({ promotion_id: PROMO }), PROMO);
});

// ── who may write ───────────────────────────────────────────────────────────

test('free and unowned rows are writable by either kind of caller', () => {
  for (const doc of [null, {}, { promotion_id: '', owner_page_id: '' }]) {
    assert.equal(canWrite(doc, { pageId: PAGE }), true);
    assert.equal(canWrite(doc, { promotionId: PROMO }), true);
  }
});

test('a page-owned row is writable by ITS page and by nobody else', () => {
  const doc = { owner_page_id: PAGE };
  assert.equal(canWrite(doc, { pageId: PAGE }), true);
  assert.equal(canWrite(doc, { pageId: OTHER_PAGE }), false, 'another page took it');
  assert.equal(canWrite(doc, { promotionId: PROMO }), false, 'a promotion took a page’s row');
});

test('a legacy row is writable by ITS promotion and by no page', () => {
  const doc = { promotion_id: PROMO };
  assert.equal(canWrite(doc, { promotionId: PROMO }), true);
  assert.equal(canWrite(doc, { promotionId: 'PROMO-B' }), false);
  assert.equal(canWrite(doc, { pageId: PAGE }), false, 'a page walked into an MSDB-held row');
});

test('an ADOPTED row — both fields set — answers to its page, not its old promotion', () => {
  const doc = { owner_page_id: PAGE, promotion_id: PROMO };
  assert.equal(canWrite(doc, { pageId: PAGE }), true);
  assert.equal(canWrite(doc, { promotionId: PROMO }), false, 'the old holder kept write access');
});

test('CONTROL: canWrite agrees with resolveOwner rather than deciding separately', () => {
  // A page-owned row refuses a promotion caller BECAUSE it resolves page_owned.
  const doc = { owner_page_id: PAGE, promotion_id: PROMO };
  assert.equal(resolveOwner(doc), 'page_owned');
  assert.equal(canWrite(doc, { promotionId: PROMO }), false);
});

// ── the guarded filter ──────────────────────────────────────────────────────

test('a promotion caller gets the unowned-or-mine pair, unchanged', () => {
  assert.deepEqual(ownerFilter({ promotionId: PROMO }), [
    { promotion_id: '' },
    { promotion_id: PROMO },
  ]);
});

test('a promotion caller with no id still gets the pair — the course tab’s path', () => {
  // The no-promotion save: `[{promotion_id:''},{promotion_id:''}]` is redundant
  // and harmless, and it is what the filter has always produced for this case.
  assert.deepEqual(ownerFilter({}), [{ promotion_id: '' }, { promotion_id: '' }]);
});

test('a page caller gets its own row OR a row nobody owns', () => {
  assert.deepEqual(ownerFilter({ pageId: PAGE }), [
    { owner_page_id: PAGE },
    { owner_page_id: { $in: ['', null] }, promotion_id: { $in: ['', null] } },
  ]);
});

test('the page branch wins when both ids are supplied — one caller, one kind', () => {
  const filter = ownerFilter({ pageId: PAGE, promotionId: PROMO });
  assert.deepEqual(filter[0], { owner_page_id: PAGE });
  assert.equal(filter.length, 2);
});

test('the unowned branch matches an ABSENT key, which is what $in:[null] is for', () => {
  /**
   * Every row stored before `owner_page_id` existed carries no such key. Real
   * MongoDB matches a missing field with a query for `null`, so `$in: ['', null]`
   * is the form that reaches those rows; a bare `{ owner_page_id: '' }` would
   * match none of them and a page could never adopt a released legacy row.
   */
  const [, unowned] = ownerFilter({ pageId: PAGE });
  assert.ok(unowned.owner_page_id.$in.includes(null), 'a missing key is unreachable');
  assert.ok(unowned.promotion_id.$in.includes(null), 'a missing key is unreachable');
});

// ── the writable field set, and the adopt path ──────────────────────────────

test('the content fields are always written', () => {
  const update = earlyBirdUpdate({
    schedule_id: ' sched-1 ',
    label_th: ' ลดพิเศษ ',
    special_price: '3900',
    deadline: '2026-12-01T00:00:00.000Z',
    is_active: true,
  });
  assert.equal(update.schedule_id, 'sched-1');
  assert.equal(update.label_th, 'ลดพิเศษ');
  assert.equal(update.special_price, 3900);
  assert.equal(update.deadline.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(update.is_active, true);
});

test('an empty label falls back rather than storing a blank', () => {
  assert.equal(earlyBirdUpdate({ label_th: '   ' }).label_th, 'Early Bird');
  assert.equal(earlyBirdUpdate({}).label_th, 'Early Bird');
});

test('NEITHER owner field is written when the caller does not supply it', () => {
  /**
   * The whole of D2. `promotion_id` used to be in this object ALWAYS, so a
   * page-side save would have stamped `''` over a legacy holder's id — a new
   * value written into a field that is legacy and read-only — and would have
   * converted a legacy row into an unowned one as a side effect of an unrelated
   * save.
   */
  const update = earlyBirdUpdate({ schedule_id: 'x' });
  assert.equal('promotion_id' in update, false, 'promotion_id was written unasked');
  assert.equal('owner_page_id' in update, false, 'owner_page_id was written unasked');
});

test('an owner field IS written when supplied — including as the empty string', () => {
  /**
   * `in`, not truthiness: `''` is how the course tab's no-promotion path spells
   * "leave this unowned", and dropping it on falsiness would stop that path
   * clearing a field it has always cleared.
   */
  assert.equal(earlyBirdUpdate({ promotion_id: '' }).promotion_id, '');
  assert.equal(earlyBirdUpdate({ promotion_id: ` ${PROMO} ` }).promotion_id, PROMO);
  assert.equal(earlyBirdUpdate({ owner_page_id: '' }).owner_page_id, '');
  assert.equal(earlyBirdUpdate({ owner_page_id: ` ${PAGE} ` }).owner_page_id, PAGE);
});

test('THE ADOPT PATH: adopting sets the new owner and touches no other owner field', () => {
  /**
   * What the page writer sends when an author confirms adoption of an unowned
   * row: the row's OWN values, plus its own id, and NO promotion_id key. The
   * result must carry the page and leave promotion_id absent from the `$set`,
   * so a row that had one keeps it byte for byte.
   */
  const existing = {
    schedule_id: 'sched-7',
    label_th: 'เดิม',
    special_price: 4500,
    deadline: '2026-12-01T00:00:00.000Z',
    is_active: true,
  };
  const update = earlyBirdUpdate({ ...existing, owner_page_id: PAGE });

  assert.equal(update.owner_page_id, PAGE, 'adoption did not set the owner');
  assert.equal('promotion_id' in update, false, 'adoption rewrote promotion_id');
  assert.equal(update.label_th, 'เดิม', 'adoption rewrote the label');
  assert.equal(update.special_price, 4500, 'adoption rewrote the price');
  assert.equal(update.schedule_id, 'sched-7', 'adoption rewrote the schedule');
});

test('CONTROL: the adopt assertions are live — supplying promotion_id DOES write it', () => {
  const update = earlyBirdUpdate({ owner_page_id: PAGE, promotion_id: PROMO });
  assert.equal('promotion_id' in update, true);
  assert.equal(update.promotion_id, PROMO);
});

test('a falsy price is null rather than 0 — an unset price is not a free course', () => {
  assert.equal(earlyBirdUpdate({ special_price: '' }).special_price, null);
  assert.equal(earlyBirdUpdate({}).special_price, null);
  assert.equal(earlyBirdUpdate({ deadline: '' }).deadline, null);
});
