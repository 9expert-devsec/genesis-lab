import { test } from 'node:test';
import assert from 'node:assert/strict';
import { masterclassPriceView, bangkokDayMonth } from '@/lib/chat/masterclassCardPrice';

/**
 * The masterclass chat card's price row — the stale-snapshot rule and the
 * Bangkok calendar day. `now` is always injected, so nothing here reads the
 * clock; the date assertions hold whatever zone the runner is in (the
 * Sydney/UTC cases below are exactly the ones a machine-zone rendering would
 * get wrong).
 */

const LIVE = { amount: 9030, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-09-16T16:59:00Z' };
const BEFORE = new Date('2026-09-16T06:00:00Z');   // 13:00 Bangkok, the early bird still on
const AT = new Date('2026-09-16T16:59:00Z');       // the deadline instant itself
const AFTER = new Date('2026-09-16T17:00:00Z');    // one minute later

test('a live early bird: the early-bird amount, the normal price to strike through, and the Bangkok day + Thai month', () => {
  assert.deepEqual(masterclassPriceView(LIVE, BEFORE), { amount: 9030, normalAmount: 12900, earlyBird: true, endsLabel: '16 ก.ย.' });
});

test('the deadline reads as the BANGKOK calendar day: 16:59Z on the 16th is 16 ก.ย., not the 17th, whatever the machine zone', () => {
  assert.equal(bangkokDayMonth('2026-09-16T16:59:00Z'), '16 ก.ย.');
  assert.equal(bangkokDayMonth('2026-10-02T16:59:00.000Z'), '2 ต.ค.', 'no leading zero, no year');
  // 17:00Z IS the next Bangkok day (00:00 +07:00) — the boundary is Bangkok midnight, not UTC midnight.
  assert.equal(bangkokDayMonth('2026-09-16T17:00:00Z'), '17 ก.ย.');
  assert.equal(bangkokDayMonth('2026-12-31T18:30:00Z'), '1 ม.ค.', 'the year rolls in Bangkok at 17:00Z');
  for (const bad of [null, undefined, '', 'not a date']) assert.equal(bangkokDayMonth(bad), null);
});

test('stale snapshot: a deadline AT or BEFORE now renders as no early bird, at the normal price, no label', () => {
  const expired = { amount: 12900, normalAmount: null, earlyBird: false, endsLabel: null };
  assert.deepEqual(masterclassPriceView(LIVE, AT), expired, 'at the instant');
  assert.deepEqual(masterclassPriceView(LIVE, AFTER), expired, 'after it');
  assert.deepEqual(masterclassPriceView(LIVE, AFTER.getTime()), expired, 'a millisecond now works too');
  // CONTROL: the same object one minute earlier is live — it is the clock that flipped it.
  assert.equal(masterclassPriceView(LIVE, BEFORE).earlyBird, true);
});

test('stale snapshot: amount is shown only when it already equals the normal price; otherwise normal_amount is the price', () => {
  const same = { amount: 12900, normal_amount: 12900, early_bird: true, early_bird_ends_at: '2026-09-16T16:59:00Z' };
  assert.equal(masterclassPriceView(same, AFTER).amount, 12900);
  const noNormal = { amount: 9030, normal_amount: null, early_bird: true, early_bird_ends_at: '2026-09-16T16:59:00Z' };
  assert.equal(masterclassPriceView(noNormal, AFTER).amount, 9030, 'with no normal price on the snapshot, amount is all there is');
});

test('early_bird false: the amount only — nothing struck, no label', () => {
  const normal = { amount: 12900, normal_amount: null, early_bird: false, early_bird_ends_at: null };
  assert.deepEqual(masterclassPriceView(normal, BEFORE), { amount: 12900, normalAmount: null, earlyBird: false, endsLabel: null });
  // a stray normal_amount equal to amount is not struck through
  assert.equal(masterclassPriceView({ ...LIVE, normal_amount: 9030 }, BEFORE).normalAmount, null);
});

test('an early bird with no deadline stays live (nothing to expire) and carries no label', () => {
  const open = { amount: 9030, normal_amount: 12900, early_bird: true, early_bird_ends_at: null };
  assert.deepEqual(masterclassPriceView(open, AFTER), { amount: 9030, normalAmount: 12900, earlyBird: true, endsLabel: null });
});

test('null price, a non-object, or a missing amount → null: no price row at all', () => {
  for (const p of [null, undefined, 'free', 42, {}, { amount: null }, { amount: 'x' }]) {
    assert.equal(masterclassPriceView(p, BEFORE), null, JSON.stringify(p));
  }
});
