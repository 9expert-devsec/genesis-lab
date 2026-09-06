import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';
import { chooseItemRound } from '@/lib/pageBuilder/chosenRounds';
// ADDED beside the statement above rather than folded into it — the standing
// rule here. The round-box test compares the rendered date against the SAME
// formatter call the component makes, so "no second date formatter" is checked
// against the real one rather than against a literal that could drift.
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { siteCurrentYear } from '@/lib/articlePublishTime';

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

/**
 * The (pageId, sectionId) pair is supplied because the BUNDLE-LEVEL affordance
 * is a register link keyed on it. Nothing in this file is about that link
 * except the control asserting the switch still governs it — the subject here
 * is the per-COURSE buttons, which the pair does not touch.
 */
const doc = (content, data) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, { content, data, pageId: 'p1', sectionId: 'sec-1' }),
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

test('a resolved item draws its cover, title, round dates and its ONE link', () => {
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

  /**
   * ── ONE LINK, AND IT IS THE DETAIL PAGE ────────────────────────────────
   * The per-course ลงทะเบียน button was removed: this panel sells a package,
   * and a button offering one course of it at its own price competed with the
   * bundle's own register button. The card describes what is in the package.
   */
  const detail = card.querySelector('[data-testid="bundle-item-detail"]');
  assert.match(detail.getAttribute('href'), /^\/mse-l1-training-course$/);
  assert.equal(
    card.querySelector('[data-testid="bundle-item-register"]'),
    null,
    'the per-course register button is back',
  );

  /**
   * IT TAKES THE FULL WIDTH THE PAIR SHARED. Both buttons were `flex-1`; the
   * survivor is `w-full`, because one `flex-1` child in a row leaves a visibly
   * empty half that reads as a button which failed to render.
   *
   * Pinned as a CLASS because width is geometry jsdom does not compute — the
   * browser tier measures the pixels (311px at 375, 204.7px at 1440); this
   * catches the class being changed back.
   */
  const cls = detail.getAttribute('class');
  assert.ok(cls.includes('w-full'), `the detail button is not full width: ${cls}`);
  assert.equal(cls.includes('flex-1'), false, 'the detail button is back to sharing a row');
});

test('CONTROL: the width probe reads the button and can answer false', () => {
  // Without this, both checks above would pass on any class string that
  // happened to contain `w-full`, or on an element that was never found.
  const d = bundle([item()], [entry()]);
  const detail = d.querySelector('[data-testid="bundle-item-detail"]');
  assert.notEqual(detail, null, 'the probe found no button at all');
  assert.equal('inline-flex flex-1 items-center'.includes('w-full'), false);
  assert.equal('inline-flex flex-1 items-center'.includes('flex-1'), true);
});

test('the card takes the site card surface, and the round box keeps its own', () => {
  /**
   * `bg-[var(--surface)]` is what `components/ui/card.jsx` paints the `Card`
   * primitive with, and `Card` is what the shared course card is built on — so
   * a bundle card and a course card elsewhere on the site are the same colour,
   * in both themes, from one definition.
   *
   * The card had NO background and showed the panel's grey through. That was
   * fine while the panel was transparent and stopped being fine when it became
   * grey. The border was already the other half of the `Card` pair.
   *
   * A CLASS assertion, unusually — the colour is a CSS variable, so jsdom
   * resolves it to nothing and a computed-style check would read empty for both
   * the correct and the broken case. The browser tier measures the actual
   * pixel; this pins which token was chosen.
   */
  const d = bundle([item()], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  const cls = card.getAttribute('class');
  assert.ok(cls.includes('bg-[var(--surface)]'), `the card surface is not the Card token: ${cls}`);
  assert.ok(cls.includes('border-[var(--surface-border)]'), 'the card lost the matching border');

  // The round box keeps its OWN cream — the two must not collapse into one.
  const box = card.querySelector('[data-testid="bundle-round-box"]');
  const boxCls = box.getAttribute('class');
  assert.ok(boxCls.includes('bg-[var(--9e-orange-900)]'), `the round box lost its cream: ${boxCls}`);
  assert.equal(
    boxCls.includes('bg-[var(--surface)]'),
    false,
    'the round box took the card surface — the two backgrounds collapsed',
  );
});

test('CONTROL: the class probe discriminates between the two surfaces', () => {
  // Without this, both `includes` checks would pass on a class string that
  // happened to contain everything, and the negative one proves the probe can
  // answer false.
  const d = bundle([item()], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  const box = card.querySelector('[data-testid="bundle-round-box"]');
  assert.notEqual(card.getAttribute('class'), box.getAttribute('class'));
  assert.equal(card.getAttribute('class').includes('bg-[var(--9e-orange-900)]'), false);
});

// ── the round box ─────────────────────────────────────────────────────────

test('the round sits in a BOX, with its label and its date on separate lines', () => {
  /**
   * It was one muted sentence — "รอบอบรม 20 - 21 ส.ค. 69" — and is now a
   * bordered pale box with the label above the date. The date element keeps its
   * testid, so every assertion about the DATE elsewhere in this file is
   * unchanged; what is new is the box around it and the label being its own
   * node rather than a prefix on the same string.
   */
  const d = bundle([item()], [entry()]);
  const box = d.querySelector('[data-testid="bundle-round-box"]');
  assert.notEqual(box, null, 'the card has no round box');
  assert.match(text(box), /รอบอบรม/);

  const date = box.querySelector('[data-testid="bundle-item-dates"]');
  assert.notEqual(date, null, 'the date is not inside the box');
  assert.match(text(date), /20\s*-\s*21 ส\.ค\./);
  assert.equal(
    text(date).includes('รอบอบรม'),
    false,
    'the label ran back into the date string',
  );
});

test('the date in the box is still formatRoundDays — no second formatter', () => {
  /**
   * The round asked for the box, not for a new date format. Compared against
   * the SAME call the component makes rather than against a literal, so a
   * change to the formatter moves both together and a second formatter
   * introduced here would diverge immediately.
   */
  const d = bundle([item()], [entry()]);
  const rendered = text(d.querySelector('[data-testid="bundle-item-dates"]'));
  const expected = formatRoundDays(LIVE_ROUND.dates, {
    showMonth: true,
    showYear: 'auto',
    currentYear: siteCurrentYear(),
  });
  assert.equal(rendered, expected);
});

test('CONTROL: no round, no box — never a bordered rectangle with a bare label', () => {
  // An item whose course resolves but whose round does not: the card still
  // draws (a bundle never silently loses a row), and the box must be absent.
  const d = bundle([item({ roundId: 'gone' })], [entry({ rounds: [] })]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(card, null, 'the card itself vanished');
  assert.equal(card.querySelector('[data-testid="bundle-round-box"]'), null);
  assert.equal(card.querySelector('[data-testid="bundle-item-dates"]'), null);
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

test('CONTROL: the card still links SOMEWHERE — the detail page', () => {
  /**
   * ── THIS CONTROL'S PREMISE CHANGED WITH THE BUTTON ─────────────────────
   * It used to read "the same fixture with an OPEN status IS linkable", and
   * guarded against "no register link" being a card that never links at all.
   * There is no register link in any state now, so that comparison is gone.
   *
   * The residual risk is the same shape and still worth covering: the null
   * above must be the REGISTER button being absent, not the card having failed
   * to render its buttons at all. So the control asserts the detail link IS
   * there on the identical fixture.
   */
  const d = bundle([item()], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(card.querySelector('[data-testid="bundle-item-detail"]'), null);
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null);
});

// ── 2. the cards carry NO registration affordance, in any state ───────────

test('no card offers registration — not open, not closed, not for any round', () => {
  /**
   * ── THIS REPLACES THE OLD DISTINCTION, AND IS STRICTLY STRONGER ─────────
   * It used to assert that closing the bundle left every per-course ลงทะเบียน
   * button EXACTLY as it was — comparing the two href sets, because a promotion
   * ending does not close a course's rounds. That rule was right and is now
   * moot: the buttons are gone, so there is nothing for the switch to spare.
   *
   * Asserting "closing changes nothing" over an empty set would be vacuous and
   * would pass for ever. So the claim moved up: there is NO registration link
   * on a card in either switch position, and the only link a card carries goes
   * to a course detail page. That is what catches the button coming back —
   * which the old test, comparing two empty lists, no longer would.
   */
  const items = [item(), item({ id: 'i2', courseId: 'MSE-L1' })];
  const data = [entry(), entry({ id: 'i2' })];

  for (const registrationOpen of [true, false]) {
    const d = doc({ name: 'B', discountCode: 'EXP1', items, registrationOpen }, data);
    const cards = [...d.querySelectorAll('[data-testid="bundle-item"]')];
    assert.equal(cards.length, 2, 'the fixture drew no cards — every assertion below would be vacuous');

    for (const card of cards) {
      assert.equal(
        card.querySelector('[data-testid="bundle-item-register"]'),
        null,
        `a per-course register button rendered with registrationOpen=${registrationOpen}`,
      );
      // Stronger than the testid: ANY link into the registration wizard,
      // however it were spelt or named, would fail this.
      const hrefs = [...card.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '');
      assert.equal(
        hrefs.some((h) => h.includes('/registration')),
        false,
        `a card links into /registration with registrationOpen=${registrationOpen}: ${hrefs.join(' ')}`,
      );
      // …and it does link somewhere, so the absence above is the register link
      // being gone rather than the card rendering no links at all.
      assert.ok(hrefs.some((h) => h.endsWith('-training-course')), 'the card lost its detail link too');
    }
  }
});

test('CONTROL: the /registration sweep would see a link if one were there', () => {
  // The sweep above is a `.some()` over hrefs; without this, a typo in the
  // needle or an empty href list would make it pass on anything.
  const planted = ['/mse-l1-training-course', '/registration/public?course=mse-l1'];
  assert.equal(planted.some((h) => h.includes('/registration')), true);
  assert.equal(['/mse-l1-training-course'].some((h) => h.includes('/registration')), false);
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

  // The bundle-level affordance is the register link now — the copy button was
  // removed with the round that made registering possible, and CopyCodeButton
  // deleted with it. The CLAIM is unchanged: the switch governs this and not
  // the per-course buttons below.
  assert.notEqual(at(true).querySelector('[data-testid="bundle-register"]'), null);
  assert.equal(at(false).querySelector('[data-testid="bundle-register"]'), null);
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
