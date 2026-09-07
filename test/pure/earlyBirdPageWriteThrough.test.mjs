import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hasEarlyBirdBinding,
  earlyBirdDeadline,
  earlyBirdIsActive,
  deriveEarlyBirdRow,
} from '@/lib/earlyBird/pageWriteThrough';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The field-level permission predicate.
import { bindingChanged } from '@/lib/earlyBird/pageWriteThrough';

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

// ── whose permission is it: the field's, not the document's ─────────────────


/**
 * `updatePageIdentity` requires the `promotions` key only when the SAVE CHANGES
 * the binding. Gating the whole page save would make a promotion page
 * unsaveable by the person who edits it; gating nothing would let page-edit
 * rights set a commercial price and reserve a course against every other page.
 *
 * The comparison is over STORED FORM, not object identity: `existing` comes
 * from Mongo (Date, absent keys) and `incoming` from a zod parse (ISO string,
 * every key defaulted). A deep-equal would call every save a change and demand
 * `promotions` for renaming a page — which is the failure these two assertions
 * exist to catch.
 */

const stored = (over = {}) => ({
  promotionKind: 'early_bird',
  earlyBird: {
    courseRef: '69cf396d91bb52363c6bde1d',
    courseCode: 'MSE-AI',
    scheduleId: 'sched-1',
    specialPrice: 10965,
    deadline: new Date('2026-12-01T00:00:00.000Z'),
    labelTh: 'Early Bird',
    ...(over.earlyBird ?? {}),
  },
  ...over,
});

/** What zod hands back for the SAME binding: ISO string, not Date. */
const parsed = (over = {}) => ({
  promotionKind: 'early_bird',
  earlyBird: {
    courseRef: '69cf396d91bb52363c6bde1d',
    courseCode: 'MSE-AI',
    scheduleId: 'sched-1',
    specialPrice: 10965,
    deadline: '2026-12-01T00:00:00.000Z',
    labelTh: 'Early Bird',
    ...(over.earlyBird ?? {}),
  },
  ...over,
});

test('an UNCHANGED binding is not a change — the save needs only `pages`', () => {
  assert.equal(bindingChanged(stored(), parsed()), false,
    'renaming a page would now demand the promotions key');
});

test('CHANGING any binding field is a change — the save needs `promotions`', () => {
  const cases = {
    courseRef:    { courseRef: '6a4b281e1e7c93cfea505bdc' },
    courseCode:   { courseCode: 'COPILOT-STU-ADV' },
    scheduleId:   { scheduleId: 'sched-2' },
    specialPrice: { specialPrice: 9999 },
    deadline:     { deadline: '2026-12-31T00:00:00.000Z' },
    labelTh:      { labelTh: 'ลดพิเศษ' },
  };
  for (const [field, over] of Object.entries(cases)) {
    assert.equal(bindingChanged(stored(), parsed({ earlyBird: over })), true,
      `changing ${field} slipped past the gate`);
  }
});

test('changing promotionKind is a change — switching away DELETES the owned row', () => {
  // As commercial an act as setting the price was. A gate watching only the six
  // fields would let page-edit rights release an Early Bird via a dropdown.
  assert.equal(bindingChanged(stored(), parsed({ promotionKind: 'none' })), true);
  assert.equal(bindingChanged(stored(), parsed({ promotionKind: 'bundle' })), true);
});

test('absent promotionKind reads as `none` on both sides', () => {
  // A page stored before the field existed must not look like a change the
  // first time it is saved.
  assert.equal(bindingChanged({}, { promotionKind: 'none' }), false);
  assert.equal(bindingChanged({}, {}), false);
});

test('null, "" and absent are one value — an empty binding is not a change', () => {
  assert.equal(
    bindingChanged(
      { promotionKind: 'none', earlyBird: { courseRef: '', deadline: null } },
      { promotionKind: 'none', earlyBird: {
        courseRef: '', courseCode: '', scheduleId: '',
        specialPrice: null, deadline: null, labelTh: '',
      } }
    ),
    false,
    'an untouched empty binding demanded the promotions key'
  );
});

test('0 and null are DIFFERENT prices — free is not unset', () => {
  // Collapsing them would let a price be set to free without the permission.
  assert.equal(
    bindingChanged(stored({ earlyBird: { specialPrice: null } }),
                   parsed({ earlyBird: { specialPrice: 0 } })),
    true
  );
});

// ── the boundary the author actually named ─────────────────────────────────

// ADDED beside the statements at the top rather than folded into them — the
// standing rule in this repo. The shared end-of-day conversion the panel now
// writes through, so the assertions below are about the value that is STORED
// rather than about a string this file made up.
import { windowEndFromInput, toDateInput } from '@/lib/pageBuilder/publishWindow';

/** An instant, read on the Bangkok wall clock. */
const inBangkok = (v) =>
  new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' });

test('a picked day ends at the END of that day in Bangkok, not in UTC', () => {
  /**
   * ── THE DEFECT, MEASURED ─────────────────────────────────────────────────
   * The panel wrote `${picked}T23:59:59.000Z` — end of day in UTC, which is
   * 06:59 the NEXT morning in Bangkok. So a promotion the author ended on
   * 21 Sep kept its special price until 07:00 on 22 Sep: seven hours past the
   * day they named.
   *
   * Not the mirror defect either: a UTC-MIDNIGHT store would have killed it at
   * 07:00 ON the final day, which is what publishWindow.js's own header
   * describes for the preview-expiry field. Both are wrong; only one instant
   * is right, and it is the one the shared conversion produces.
   */
  const picked = '2026-09-21';
  const stored = windowEndFromInput(picked);

  assert.equal(stored, '2026-09-21T16:59:59.999Z');
  assert.match(inBangkok(stored), /^21\/09\/2026, 23:59:59$/,
    'the deadline no longer lands at the end of the day the author named');

  // The old value, pinned as the thing that must not come back.
  assert.match(inBangkok(`${picked}T23:59:59.000Z`), /^22\/09\/2026/,
    'CONTROL: the previous convention really did spill into the next day');
});

test('the stored instant round-trips back to the same date box', () => {
  // A day that differs between UTC and Bangkok is the only interesting case:
  // 16:59:59.999Z is still the 21st in both, which is what makes it safe.
  const stored = windowEndFromInput('2026-09-21');
  assert.equal(toDateInput(stored), '2026-09-21', 'the box would show a different day than it wrote');
});

test('a date that does not exist is refused rather than rolled forward', () => {
  // `new Date('2026-02-31T…')` is not Invalid Date — V8 rolls it into 3 March.
  // Null is "no bound", the same as a cleared box.
  assert.equal(windowEndFromInput('2026-02-31'), null);
  assert.equal(windowEndFromInput(''), null);
  assert.equal(windowEndFromInput('2026-13-01'), null);
});

test('the resolved deadline uses that instant across all four combinations', () => {
  const own = windowEndFromInput('2026-09-21');
  const win = windowEndFromInput('2026-09-25');

  // binding only
  assert.equal(earlyBirdDeadline({ deadline: own }, {}).toISOString(), own);
  // publishEndDate only
  assert.equal(earlyBirdDeadline({}, { publishEndDate: win }).toISOString(), win);
  // both — the EARLIER wins, whichever side it is on
  assert.equal(
    earlyBirdDeadline({ deadline: own }, { publishEndDate: win }).toISOString(), own);
  assert.equal(
    earlyBirdDeadline({ deadline: win }, { publishEndDate: own }).toISOString(), own);
  // neither
  assert.equal(earlyBirdDeadline({}, {}), null);
});
