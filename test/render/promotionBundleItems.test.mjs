import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';

/**
 * `promotion_bundle`'s ITEM CARDS — one course, one round of it.
 *
 * The two claims that carry the most weight here, because both are departures
 * that a later reader could mistake for oversights:
 *
 *   1. AN UNRESOLVED COURSE IS MARKED, NOT DROPPED — the opposite of what
 *      bundle_courses does, because a package price computed over N courses is
 *      wrong in an undetectable way when N−1 are drawn.
 *   2. THE BUNDLE'S OPEN/CLOSED SWITCH DOES NOT REACH THESE BUTTONS — they
 *      point at ordinary rounds, and a promotion ending does not close a
 *      course's rounds.
 */

const doc = (content, data) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, { content, data }),
    )}</body>`,
  ).window.document;

const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

const COURSE = {
  course_id: 'MSE-L1',
  course_name: 'Microsoft Excel Level 1',
  course_cover_url: 'https://res.cloudinary.com/demo/image/upload/x.webp',
};

// A round far enough out that `showYear: 'auto'` behaviour is stable whatever
// the day this suite runs — the assertions below read the day and month only.
const LIVE_ROUND = { _id: '6500000000000000000000a1', dates: ['2030-08-20', '2030-08-21'], status: 'open', type: 'classroom' };

const item = (over = {}) => ({ id: 'i1', courseId: 'MSE-L1', roundId: LIVE_ROUND._id, ...over });
const entry = (over = {}) => ({ id: 'i1', courseId: 'MSE-L1', course: COURSE, rounds: [LIVE_ROUND], ...over });

const bundle = (items, data) => doc({ name: 'Bundle 1', items }, data);

// ── the ordinary card ─────────────────────────────────────────────────────

test('a resolved item draws its cover, title, round dates and both links', () => {
  const d = bundle([item()], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(card, null);

  assert.equal(card.getAttribute('data-resolved'), 'yes');
  assert.equal(card.getAttribute('data-round-state'), 'live');

  // The cover reaches next/image, which rewrites the src through /_next/image.
  const img = card.querySelector('img');
  assert.notEqual(img, null, 'no cover image rendered');
  assert.match(img.getAttribute('src') ?? '', /res\.cloudinary\.com|_next\/image/);
  assert.equal(img.getAttribute('alt'), COURSE.course_name);

  assert.equal(text(card.querySelector('h4')), COURSE.course_name);

  // The date range comes from the ONE formatter. 20 and 21 are consecutive, so
  // they collapse to a range with the month on the last token.
  assert.match(text(card.querySelector('[data-testid="bundle-item-dates"]')), /20\s*-\s*21 ส\.ค\./);

  const register = card.querySelector('[data-testid="bundle-item-register"]');
  const detail = card.querySelector('[data-testid="bundle-item-detail"]');
  assert.match(register.getAttribute('href'), /^\/registration\/public\?course=mse-l1&class=6500000000000000000000a1$/);
  assert.match(detail.getAttribute('href'), /^\/mse-l1-training-course$/);
});

test('CONTROL: the same probes come back empty on an item with nothing resolved', () => {
  // Discrimination for every selector above — same markup path, no data.
  const d = bundle([item()], []);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(card, null, 'the card itself must still exist');
  assert.equal(card.querySelector('h4'), null);
  assert.equal(card.querySelector('img'), null);
  assert.equal(card.querySelector('[data-testid="bundle-item-dates"]'), null);
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null);
});

// ── 1. an unresolved course is MARKED, never dropped ──────────────────────

test('an item whose course no longer resolves still draws a row, carrying its code', () => {
  const d = bundle(
    [item({ id: 'i1', courseId: 'GONE' }), item({ id: 'i2' })],
    [entry({ id: 'i1', courseId: 'GONE', course: null, rounds: [] }), entry({ id: 'i2' })],
  );
  const cards = [...d.querySelectorAll('[data-testid="bundle-item"]')];
  assert.equal(cards.length, 2, 'the bundle got SHORTER — the package price now covers courses that are not shown');

  const dead = cards[0];
  assert.equal(dead.getAttribute('data-resolved'), 'no');
  const mark = dead.querySelector('[data-testid="bundle-item-unresolved"]');
  assert.notEqual(mark, null);
  assert.match(text(mark), /GONE/, 'the stored code must survive so the author can see what to fix');
  assert.match(text(mark), /ไม่พบคอร์สนี้แล้ว/);

  // No registration link into a course the site cannot resolve.
  assert.equal(dead.querySelector('[data-testid="bundle-item-register"]'), null);
});

test('CONTROL: the count really would notice a drop', () => {
  // If the renderer filtered, the assertion above would read 1 and this proves
  // the comparison can tell 1 from 2.
  const d = bundle([item()], [entry()]);
  assert.equal(d.querySelectorAll('[data-testid="bundle-item"]').length, 1);
  assert.throws(() => assert.equal(d.querySelectorAll('[data-testid="bundle-item"]').length, 2));
});

// ── the three round states ────────────────────────────────────────────────

test('a round that ROLLED OFF draws its dates from the snapshot, with no registration link', () => {
  /**
   * The ordinary end of a chosen round's life: `excludeStartedRounds` removes a
   * round from every public feed the moment its first day arrives, so it stops
   * coming back from the fetch. The snapshot is the only thing that can still
   * draw it — and it may say only what it honestly supports.
   */
  const rolled = item({ roundId: 'r-old', roundSnapshot: { id: 'r-old', dates: ['2020-03-10', '2020-03-11'], type: 'classroom' } });
  const d = bundle([rolled], [entry({ rounds: [] })]);
  const card = d.querySelector('[data-testid="bundle-item"]');

  assert.equal(card.getAttribute('data-round-state'), 'elapsed');
  assert.match(text(card.querySelector('[data-testid="bundle-item-dates"]')), /10\s*-\s*11 มี\.ค\./);

  // NOT a link: /registration/public?class=<id> for an id upstream does not
  // have renders a blank step 1.
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null);
  // …and the course link is untouched — the COURSE still exists.
  assert.notEqual(card.querySelector('[data-testid="bundle-item-detail"]'), null);
  // A state chip, which is not a status: a status is the seats-left signal and
  // cannot be true about a round nobody can fetch.
  assert.notEqual(card.querySelector('[data-testid="bundle-item-round-state"]'), null);
});

test('a round withdrawn while still FUTURE reads as missing, not as elapsed', () => {
  // The two greys are different claims: `elapsed` is computed from dates the
  // site still holds; `missing` asserts nothing at all.
  const gone = item({ roundId: 'r-x', roundSnapshot: { id: 'r-x', dates: ['2099-01-05'], type: 'online' } });
  const d = bundle([gone], [entry({ rounds: [] })]);
  assert.equal(
    d.querySelector('[data-testid="bundle-item"]').getAttribute('data-round-state'),
    'missing',
  );
});

test('CONTROL: elapsed and missing really are told apart, and a live round is neither', () => {
  const at = (snap) =>
    bundle([item({ roundId: 'r', roundSnapshot: { id: 'r', dates: snap, type: '' } })], [entry({ rounds: [] })])
      .querySelector('[data-testid="bundle-item"]')
      .getAttribute('data-round-state');
  assert.notEqual(at(['2020-03-10']), at(['2099-01-05']));
  assert.equal(bundle([item()], [entry()]).querySelector('[data-testid="bundle-item"]').getAttribute('data-round-state'), 'live');
});

test('an item with NO round chosen draws the course and no date line', () => {
  // Distinct from `missing`: the author has not finished, rather than upstream
  // having withdrawn something.
  const d = bundle([item({ roundId: '' })], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.equal(card.getAttribute('data-round-state'), 'none');
  assert.equal(card.querySelector('[data-testid="bundle-item-dates"]'), null);
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null);
  // The course is resolved, so its title and detail link are still there.
  assert.equal(text(card.querySelector('h4')), COURSE.course_name);
  assert.notEqual(card.querySelector('[data-testid="bundle-item-detail"]'), null);
});

test('a FULL round is shown but not clickable — the builder’s refusal is honoured', () => {
  /**
   * `scheduleRegistrationHref` returns null for a full round, which is what
   * round 81 deleted the last local copy of the template to guarantee. Asserted
   * here so this surface cannot regrow one.
   */
  const full = { ...LIVE_ROUND, status: 'full' };
  const d = bundle([item()], [entry({ rounds: [full] })]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.equal(card.getAttribute('data-round-state'), 'live', 'a full round is still a LIVE round');
  assert.notEqual(card.querySelector('[data-testid="bundle-item-dates"]'), null, 'it must still be shown');
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null, 'a sold-out round was linkable');
});

test('CONTROL: the same fixture with an OPEN status IS linkable', () => {
  // Without this, "no register link" could be a card that never links.
  const d = bundle([item()], [entry()]);
  assert.notEqual(
    d.querySelector('[data-testid="bundle-item"]').querySelector('[data-testid="bundle-item-register"]'),
    null,
  );
});

// ── 2. the switch does NOT reach the per-course buttons ───────────────────

test('closing the bundle leaves every per-course ลงทะเบียน button exactly as it was', () => {
  /**
   * The decided rule, asserted rather than only commented. `registrationOpen`
   * closes THIS BUNDLE's registration; the item buttons point at ordinary
   * rounds of ordinary courses, and a promotion ending does not close a
   * course's rounds.
   *
   * Compared as a SET of hrefs rather than as a boolean, so a change that kept
   * a button but pointed it somewhere else would be caught too.
   */
  const items = [item(), item({ id: 'i2', courseId: 'MSE-L1' })];
  const data = [entry(), entry({ id: 'i2' })];
  const hrefs = (registrationOpen) =>
    [...doc({ name: 'B', discountCode: 'EXP1', items, registrationOpen }, data)
      .querySelectorAll('[data-testid="bundle-item-register"]')]
      .map((a) => a.getAttribute('href'));

  const whenOpen = hrefs(true);
  const whenClosed = hrefs(false);
  assert.equal(whenOpen.length, 2, 'the fixture drew no per-course buttons — the comparison would be vacuous');
  assert.deepEqual(whenClosed, whenOpen, 'closing the bundle changed the per-course registration links');
});

test('CONTROL: the same switch DOES remove the bundle-level button, so it is wired at all', () => {
  /**
   * The other half. Without it, "closing changed nothing" would be satisfied by
   * a switch that does nothing whatsoever — which would pass the assertion
   * above while the feature was entirely absent.
   */
  const items = [item()];
  const data = [entry()];
  const at = (registrationOpen) =>
    doc({ name: 'B', discountCode: 'EXP1', items, registrationOpen }, data);

  assert.notEqual(at(true).querySelector('[data-testid="bundle-copy-code"]'), null);
  assert.equal(at(false).querySelector('[data-testid="bundle-copy-code"]'), null);
  assert.notEqual(at(false).querySelector('[data-testid="bundle-closed"]'), null);
});

// ── chooseItemRound delegates rather than re-deciding ─────────────────────

test('chooseItemRound answers the three states, and null for no choice', () => {
  const TODAY = '2026-09-05';
  const rows = [LIVE_ROUND];

  assert.equal(chooseItemRound(rows, { roundId: LIVE_ROUND._id }, TODAY).state, 'live');
  assert.equal(
    chooseItemRound([], { roundId: 'r', roundSnapshot: { id: 'r', dates: ['2020-01-01'], type: '' } }, TODAY).state,
    'elapsed',
  );
  assert.equal(
    chooseItemRound([], { roundId: 'r', roundSnapshot: { id: 'r', dates: ['2099-01-01'], type: '' } }, TODAY).state,
    'missing',
  );
  // No round chosen is NOT a state — it is the absence of one.
  assert.equal(chooseItemRound(rows, { roundId: '' }, TODAY), null);
  assert.equal(chooseItemRound(rows, {}, TODAY), null);
  // A chosen round with no snapshot at all is `missing`, never dropped.
  assert.equal(chooseItemRound([], { roundId: 'r' }, TODAY).state, 'missing');
});

test('CONTROL: chooseItemRound is not simply returning a constant', () => {
  const TODAY = '2026-09-05';
  const live = chooseItemRound([LIVE_ROUND], { roundId: LIVE_ROUND._id }, TODAY);
  const gone = chooseItemRound([], { roundId: 'other' }, TODAY);
  assert.notEqual(live.state, gone.state);
  assert.notEqual(live.live, null);
  assert.equal(gone.live, null);
  // …and it picks the RIGHT row when several are fetched.
  const second = { _id: 'r2', dates: ['2031-01-01'], status: 'open' };
  assert.equal(chooseItemRound([LIVE_ROUND, second], { roundId: 'r2' }, TODAY).id, 'r2');
});
