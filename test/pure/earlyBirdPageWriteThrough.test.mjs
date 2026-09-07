import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasEarlyBirdBinding,
  earlyBirdDeadline,
  earlyBirdIsActive,
  deriveEarlyBirdRow,
} from '@/lib/earlyBird/pageWriteThrough';

/**
 * WHAT A PAGE'S BINDING BECOMES AS AN `EarlyBirdConfig` ROW.
 *
 * Two derived values decide whether a promotion appears on a public course
 * page, and both are easy to get wrong in a direction nobody notices:
 *
 *   `is_active`  must follow `isPubliclyVisible` — status AND both ends of the
 *                publish window — not `status === 'published'`. The second
 *                would advertise an expired page's Early Bird and hide a
 *                scheduled-and-now-live one.
 *   `deadline`   folds the page's `publishEndDate` in as the EARLIER of the
 *                two, which is what makes the end of a publish window close the
 *                promotion with no read-path change at all.
 *
 * All pure, so every case is a function call rather than a page save with a
 * database behind it.
 */

const NOW = Date.parse('2026-09-08T00:00:00.000Z');
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString();

/** A page with a real binding, publicly visible, no dates. Override per test. */
const page = (over = {}) => ({
  _id: 'page-1',
  pageType: 'promotion',
  promotionKind: 'early_bird',
  status: 'published',
  publishStartDate: null,
  publishEndDate: null,
  ...over,
  earlyBird: {
    courseRef: '69cf396d91bb52363c6bde1d',
    courseCode: 'MSE-AI',
    scheduleId: 'sched-1',
    specialPrice: 10965,
    deadline: null,
    labelTh: 'Early Bird',
    ...(over.earlyBird ?? {}),
  },
});

// ── is there a binding at all ───────────────────────────────────────────────

test('a promotion page of kind early_bird with a courseRef IS bound', () => {
  assert.equal(hasEarlyBirdBinding(page()), true);
});

test('each of the three conditions can withhold the binding on its own', () => {
  assert.equal(hasEarlyBirdBinding(page({ pageType: 'landing' })), false, 'pageType ignored');
  assert.equal(hasEarlyBirdBinding(page({ promotionKind: 'none' })), false, 'kind ignored');
  assert.equal(hasEarlyBirdBinding(page({ promotionKind: 'bundle' })), false, 'bundle bound one');
  assert.equal(
    hasEarlyBirdBinding(page({ earlyBird: { courseRef: '' } })), false, 'no course, still bound'
  );
});

test('an EMPTY courseCode does not withhold the binding — the ref is the binding', () => {
  assert.equal(hasEarlyBirdBinding(page({ earlyBird: { courseCode: '' } })), true);
});

test('CONTROL: a missing page is not bound rather than a crash', () => {
  assert.equal(hasEarlyBirdBinding(null), false);
  assert.equal(hasEarlyBirdBinding({}), false);
});

// ── is_active ───────────────────────────────────────────────────────────────

test('a published page with no window is ACTIVE', () => {
  assert.equal(earlyBirdIsActive(page(), NOW), true);
});

test('a DRAFT page is not active — the claim is reserved, not advertised', () => {
  for (const status of ['draft', 'closed', 'archived']) {
    assert.equal(earlyBirdIsActive(page({ status }), NOW), false, `${status} advertised`);
  }
});

test('a page PAST its publishEndDate is not active, whatever its status says', () => {
  assert.equal(
    earlyBirdIsActive(page({ publishEndDate: iso(NOW - DAY) }), NOW),
    false,
    'an expired page kept advertising'
  );
});

test('a page not yet at its publishStartDate is not active — the ACCEPTED GAP', () => {
  /**
   * A `scheduled` page's Early Bird does not appear until the page is actually
   * published: nothing runs at publishStartDate to flip it. Pinned as a test
   * rather than left as a comment, so the day someone builds the scheduler this
   * assertion is what tells them the behaviour was deliberate.
   */
  const scheduled = page({ status: 'scheduled', publishStartDate: iso(NOW + DAY) });
  assert.equal(earlyBirdIsActive(scheduled, NOW), false);
  // …and the same page, once its start has arrived, IS active without anything
  // else changing — which is what makes the gap a timing gap, not a dead path.
  assert.equal(earlyBirdIsActive(scheduled, NOW + 2 * DAY), true);
});

test('a passed BINDING deadline deactivates even a live page', () => {
  const p = page({ earlyBird: { deadline: iso(NOW - DAY) } });
  assert.equal(earlyBirdIsActive(p, NOW), false);
});

test('CONTROL: is_active is not a constant — it varies with exactly these inputs', () => {
  assert.notEqual(earlyBirdIsActive(page(), NOW), earlyBirdIsActive(page({ status: 'draft' }), NOW));
  assert.notEqual(
    earlyBirdIsActive(page(), NOW),
    earlyBirdIsActive(page({ publishEndDate: iso(NOW - DAY) }), NOW)
  );
});

// ── deadline: the earlier of the two ────────────────────────────────────────

test('with only a binding deadline, that is the deadline', () => {
  const d = earlyBirdDeadline({ deadline: iso(NOW + DAY) }, { publishEndDate: null });
  assert.equal(d.getTime(), NOW + DAY);
});

test('with only a publishEndDate, the window’s end becomes the deadline', () => {
  /**
   * The whole trick: every read path already re-checks `deadline`, so folding
   * the window's end into it closes the promotion when the page stops being
   * public — with no read-path change anywhere.
   */
  const d = earlyBirdDeadline({ deadline: null }, { publishEndDate: iso(NOW + DAY) });
  assert.equal(d.getTime(), NOW + DAY);
});

test('with BOTH, the EARLIER wins — in both orders', () => {
  const early = iso(NOW + DAY);
  const late = iso(NOW + 5 * DAY);
  assert.equal(
    earlyBirdDeadline({ deadline: early }, { publishEndDate: late }).getTime(),
    NOW + DAY,
    'the window outlived the binding and won anyway'
  );
  assert.equal(
    earlyBirdDeadline({ deadline: late }, { publishEndDate: early }).getTime(),
    NOW + DAY,
    'the binding outlived the window and won anyway'
  );
});

test('with NEITHER, the deadline is null — runs until somebody stops it', () => {
  assert.equal(earlyBirdDeadline({ deadline: null }, { publishEndDate: null }), null);
  assert.equal(earlyBirdDeadline({}, {}), null);
  assert.equal(earlyBirdDeadline(undefined, undefined), null);
});

test("'' is treated as absent, not as epoch zero", () => {
  // The page schema's nullableDate preprocesses '' to null, but a directly
  // seeded document can carry it. Epoch zero would be a deadline in 1970 —
  // every Early Bird instantly expired, silently.
  assert.equal(earlyBirdDeadline({ deadline: '' }, { publishEndDate: '' }), null);
  const d = earlyBirdDeadline({ deadline: '' }, { publishEndDate: iso(NOW + DAY) });
  assert.equal(d.getTime(), NOW + DAY);
});

test('an unparseable date is treated as absent rather than as NaN', () => {
  assert.equal(earlyBirdDeadline({ deadline: 'not-a-date' }, {}), null);
});

// ── the whole row ───────────────────────────────────────────────────────────

test('an unbound page derives NO row — the caller turns that into a delete', () => {
  assert.equal(deriveEarlyBirdRow(page({ promotionKind: 'none' }), 'MSE-AI', NOW), null);
  assert.equal(deriveEarlyBirdRow(page({ pageType: 'general' }), 'MSE-AI', NOW), null);
});

test('a bound page with no resolvable CODE derives no row either', () => {
  // Refused by the caller rather than written under an empty course_id.
  assert.equal(deriveEarlyBirdRow(page(), '', NOW), null);
});

test('the derived row carries the code, the owner and the derived pair', () => {
  const row = deriveEarlyBirdRow(page(), 'MSE-AI', NOW);
  assert.equal(row.course_id, 'MSE-AI');
  assert.equal(row.owner_page_id, 'page-1');
  assert.equal(row.schedule_id, 'sched-1');
  assert.equal(row.label_th, 'Early Bird');
  assert.equal(row.special_price, 10965);
  assert.equal(row.deadline, null);
  assert.equal(row.is_active, true);
});

test('the row NEVER carries promotion_id — legacy, and read-only', () => {
  /**
   * `earlyBirdUpdate` in ownership.js writes an owner field only when the
   * caller supplies the KEY, so omitting it here is what keeps a page save from
   * stamping '' over a legacy holder's id and silently converting that row into
   * an unowned one.
   */
  const row = deriveEarlyBirdRow(page(), 'MSE-AI', NOW);
  assert.equal('promotion_id' in row, false, 'a page-side write carried promotion_id');
});

test('an empty label falls back rather than storing a blank', () => {
  const row = deriveEarlyBirdRow(page({ earlyBird: { labelTh: '   ' } }), 'MSE-AI', NOW);
  assert.equal(row.label_th, 'Early Bird');
});

test('a zero price survives — 0 is a free course, not "unset"', () => {
  const row = deriveEarlyBirdRow(page({ earlyBird: { specialPrice: 0 } }), 'MSE-AI', NOW);
  assert.equal(row.special_price, 0);
});

test('an unset price is null rather than 0', () => {
  const row = deriveEarlyBirdRow(page({ earlyBird: { specialPrice: null } }), 'MSE-AI', NOW);
  assert.equal(row.special_price, null);
});

test('a draft page still derives a row — reserved, but not advertised', () => {
  /**
   * The claim is written on SAVE so no other page or promotion can take the
   * course; `is_active: false` is what keeps it off the course page until the
   * page is live. Reserved and advertised are different questions.
   */
  const row = deriveEarlyBirdRow(page({ status: 'draft' }), 'MSE-AI', NOW);
  assert.ok(row, 'a draft page reserved nothing — the course is claimable by others');
  assert.equal(row.is_active, false);
});

test('the folded deadline reaches the row, not just the predicate', () => {
  const row = deriveEarlyBirdRow(
    page({ publishEndDate: iso(NOW + DAY), earlyBird: { deadline: iso(NOW + 5 * DAY) } }),
    'MSE-AI',
    NOW
  );
  assert.equal(row.deadline.getTime(), NOW + DAY, 'the window’s end did not reach the row');
  assert.equal(row.is_active, true, 'a deadline still in the future deactivated the row');
});
