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
// ADDED beside the statements above rather than folded into one — the same
// standing rule. The chip itself, so the "no ลงทะเบียน pill" guard can prove
// the pill is reachable from this component rather than asserting an absence
// that might just be a dead selector.
import ScheduleCard from '@/components/ScheduleCard';
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
const doc = (content, data, style) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, { content, data, style, pageId: 'p1', sectionId: 'sec-1' }),
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
  assert.match(text(card.querySelector('[data-schedule-card-date]')), /20\s*-\s*21 ส\.ค\./);

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

  /**
   * THE ROUND NO LONGER PAINTS A SURFACE AT ALL, and that is the change this
   * assertion was inverted for rather than deleted. It used to carry its own
   * cream slab (`bg-[var(--9e-orange-900)]`), which was this file drawing a
   * second round visual while the site already had one. The round is now a
   * `ScheduleCard` chip — a type-coloured border on the tile's own surface —
   * so the correct claim is that NEITHER background is there.
   */
  const box = card.querySelector('[data-testid="bundle-round-box"]');
  const boxCls = box.getAttribute('class') ?? '';
  assert.equal(
    boxCls.includes('bg-[var(--9e-orange-900)]'),
    false,
    'the round box still paints the retired cream slab',
  );
  assert.equal(
    boxCls.includes('bg-[var(--surface)]'),
    false,
    'the round box took the card surface — the two backgrounds collapsed',
  );
});

test('CONTROL: the class probe can answer true as well as false', () => {
  /**
   * Every surface assertion above is now a NEGATIVE one — "this class is not
   * there" — and a probe that can only answer false would satisfy all of them
   * against an empty string, a missing element or a typo in the selector. So
   * this proves the same probe returns true for a class that IS present, on
   * the one element that still carries a painted surface.
   */
  const d = bundle([item()], [entry()]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.ok(card.getAttribute('class').includes('bg-[var(--surface)]'));
  assert.equal(card.getAttribute('class').includes('bg-[var(--9e-orange-900)]'), false);
});

// ── the round box ─────────────────────────────────────────────────────────

test('the round is a shared ScheduleCard chip, under its own label', () => {
  /**
   * It was one muted sentence — "รอบอบรม 20 - 21 ส.ค. 69", then a
   * bundle-shaped cream box, and is now the SAME CHIP the course card draws:
   * `components/ScheduleCard`, a type-coloured border with a corner dot and a
   * bold date.
   *
   * PINNED BY THE COMPONENT'S OWN MARKER, not by a colour class. A class
   * assertion would go green against a hand-rolled div that copied the
   * classes, which is the drift that reusing the component exists to prevent
   * — `[data-schedule-card]` can only be satisfied by the shared chip.
   */
  const d = bundle([item()], [entry()]);
  const box = d.querySelector('[data-testid="bundle-round-box"]');
  assert.notEqual(box, null, 'the card has no round box');

  // THE LABEL MOVED OUT OF THE BOX, because there can be several boxes now:
  // one item offers many rounds, and repeating "รอบอบรม" above each date was
  // a word per row saying what the list already says. It is a single heading
  // on the list instead — asserted here so the label is still SOMEWHERE and
  // this test keeps being about the label/date separation rather than
  // quietly becoming a test about the date alone.
  const list = d.querySelector('[data-testid="bundle-round-list"]');
  assert.notEqual(list, null, 'the rounds list wrapper is gone');
  assert.match(text(list), /รอบอบรม/, 'the list heading lost its label');

  // THE SHARED COMPONENT, not a look-alike.
  const chip = box.querySelector('[data-schedule-card]');
  assert.notEqual(chip, null, 'the round is not drawn by the shared ScheduleCard');

  const date = box.querySelector('[data-schedule-card-date]');
  assert.notEqual(date, null, 'the date is not inside the chip');
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
  const rendered = text(d.querySelector('[data-schedule-card-date]'));
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
  assert.equal(card.querySelector('[data-schedule-card-date]'), null);
});

test('CONTROL: the same probes come back empty on an item with nothing resolved', () => {
  // Discrimination for every selector above — same markup path, no data.
  const d = bundle([item()], []);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.notEqual(card, null, 'the card itself must still exist');
  assert.equal(card.querySelector('h4'), null);
  assert.equal(card.querySelector('img'), null);
  assert.equal(card.querySelector('[data-schedule-card-date]'), null);
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
  assert.match(text(card.querySelector('[data-schedule-card-date]')), /10\s*-\s*11 มี\.ค\./);

  // NOT a link: /registration/public?class=<id> for an id upstream does not
  // have renders a blank step 1.
  assert.equal(card.querySelector('[data-testid="bundle-item-register"]'), null);
  // …and the course link is untouched — the COURSE still exists.
  assert.notEqual(card.querySelector('[data-testid="bundle-item-detail"]'), null);
  /**
   * THE PER-TILE STATE BADGE IS GONE, and this assertion is inverted rather
   * than deleted so its absence is a pinned claim. It read `จบไปแล้ว` for a
   * rolled-off round — a verdict about the ONE round `chooseItemRound`
   * picked, printed once beneath a list that shows EVERY offered round, with
   * nothing saying which of them it was about. Each chip now carries its own
   * state instead.
   */
  assert.equal(card.querySelector('[data-testid="bundle-item-round-state"]'), null);
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
  assert.equal(card.querySelector('[data-schedule-card-date]'), null);
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
  assert.notEqual(card.querySelector('[data-schedule-card-date]'), null, 'it must still be shown');
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

// ── several offered rounds, their states and their deadlines ───────────────

const OPEN_A = { _id: 'ra', dates: ['2030-08-20', '2030-08-21'], status: 'open', type: 'classroom' };
const OPEN_B = { _id: 'rb', dates: ['2030-11-05'], status: 'open', type: 'online' };
const FULL_C = { _id: 'rc', dates: ['2030-12-01'], status: 'full', type: 'online' };
const CLOSED_D = { _id: 'rd', dates: ['2030-12-20'], status: 'closed', type: 'online' };
const STARTED_E = { _id: 're', dates: ['2020-01-05'], status: 'open', type: 'online' };
/**
 * A round that CROSSES A MONTH, so `formatRoundDays` has to print both months
 * and the label is far longer than any single-month one.
 *
 * IT USED TO FEED THE SHARED-WIDTH TESTS, which derived one chip width from
 * the longest label in a bundle and needed a label of a different length to
 * tell a real maximum from a constant. That width is gone with the stack it
 * sized — see the carousel-track test — and this fixture now does the
 * opposite job: the LONGEST label in a half-width box is the one that proves
 * a box neither grows nor shrinks to fit its date.
 */
const LONG_E = { _id: 'rlong', dates: ['2030-12-30', '2030-12-31', '2031-01-02'], status: 'open', type: 'online' };

const multi = (rounds, live, extra = {}, style) =>
  doc(
    { name: 'Bundle 1', items: [{ id: 'i1', courseId: 'MSE-L1', rounds }], ...extra },
    [{ id: 'i1', courseId: 'MSE-L1', course: COURSE, rounds: live }],
    style,
  );

test('ALL offered rounds are listed, not just the first', () => {
  const d = multi(
    [{ id: 'ra' }, { id: 'rb' }, { id: 'rc' }],
    [OPEN_A, OPEN_B, FULL_C],
  );
  assert.equal(d.querySelectorAll('[data-testid="bundle-round-box"]').length, 3);
});

/**
 * The four Thai words a round used to be refused with ON THIS CARD. They are
 * still the wizard's words — `PICK_REASON_TEXT` is one table — so the list is
 * written out here rather than imported: if the table gains a fifth word, this
 * guard should keep testing the four it was written about and a human should
 * decide about the fifth, which an import would quietly skip.
 */
const REFUSAL_WORDS = ['เต็ม', 'ปิดรับ', 'เริ่มแล้ว', 'หมดเวลาเลือก'];

test('a non-pickable round stays VISIBLE, and is greyed rather than worded', () => {
  /**
   * Removing it would make the card shorter the moment a round filled — the
   * same silently-shrinking failure chooseRounds already refuses.
   *
   * WHAT CHANGED: it used to be `opacity-60` plus a Thai reason word under
   * the date. The word is gone from the public card — a greyed chip beside a
   * coloured one already says "not this one" — and the fading is now the
   * shared chip's `muted` tone rather than a blanket opacity.
   */
  const d = multi([{ id: 'ra' }, { id: 'rc' }, { id: 'rd' }, { id: 're' }],
    [OPEN_A, FULL_C, CLOSED_D, STARTED_E]);
  const boxes = [...d.querySelectorAll('[data-testid="bundle-round-box"]')];
  assert.equal(boxes.length, 4, 'nothing is dropped');

  const by = Object.fromEntries(boxes.map((b) => [b.getAttribute('data-reason') ?? 'ok', b]));

  // The pickable one takes the NORMAL chip colours.
  assert.equal(boxes[0].getAttribute('data-pickable'), 'yes');
  assert.equal(
    boxes[0].querySelector('[data-schedule-card]').getAttribute('data-tone'),
    'scoped',
    'a pickable round is not drawn in the normal tone',
  );

  for (const [reason, word] of [['full', 'เต็ม'], ['closed', 'ปิดรับ'], ['started', 'เริ่มแล้ว']]) {
    const box = by[reason];
    assert.notEqual(box, null, `no box reported ${reason}`);
    assert.equal(box.getAttribute('data-pickable'), 'no');

    // GREYED — asserted through the shared chip's own variant marker, not
    // through a colour class a look-alike could copy.
    const chip = box.querySelector('[data-schedule-card]');
    assert.notEqual(chip, null, `${reason} is not drawn by the shared chip`);
    assert.equal(chip.getAttribute('data-tone'), 'muted', `${reason} is not greyed`);

    // THE STATUS IS STILL THERE, FOR A SCREEN READER. Greying is a colour,
    // and WCAG 1.4.1 does not let colour be the only carrier.
    const sr = box.querySelector('.sr-only');
    assert.notEqual(sr, null, `${reason} conveys its state by colour alone`);
    assert.match(text(sr), new RegExp(word));
  }
});

test('no refusal word is VISIBLE anywhere on the card', () => {
  /**
   * The companion to the test above, and the half it cannot make: that one
   * proves the word is in the `sr-only` node, this one proves it is nowhere
   * ELSE — not under the date, not as a per-tile badge, not in a pill. The
   * card text is read with every `.sr-only` subtree removed first, which is
   * what "visible" means here.
   */
  const d = multi([{ id: 'ra' }, { id: 'rc' }, { id: 'rd' }, { id: 're' }],
    [OPEN_A, FULL_C, CLOSED_D, STARTED_E]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  for (const el of [...card.querySelectorAll('.sr-only')]) el.remove();
  const visible = text(card);

  for (const word of REFUSAL_WORDS) {
    assert.equal(
      visible.includes(word),
      false,
      `the card still shows the refusal word ${word}: ${visible}`,
    );
  }
});

test('a bundle chip draws NO dot at all', () => {
  /**
   * It had a corner dot, which overlapped a wrapped date; then an inline one
   * (3b74d7a6), which did not overlap and went on costing width — a dot plus
   * its gap — on the one surface with none to spare.
   *
   * The dot was never carrying information HERE. On a course card it names
   * the delivery type against the Classroom/Hybrid legend printed directly
   * above the strip; a bundle tile has no legend, and the chip's BORDER is
   * already that same colour. So it is dropped rather than squeezed in, and
   * the width goes to the date.
   */
  const d = multi([{ id: 'ra' }, { id: 'rc' }], [OPEN_A, FULL_C]);
  const chips = [...d.querySelectorAll('[data-schedule-card]')];
  assert.equal(chips.length, 2, 'the chips did not render');

  for (const chip of chips) {
    assert.equal(chip.getAttribute('data-dot'), 'none', 'a bundle chip still declares a dot');
    // Neither of the two shapes a dot has ever taken in this component.
    assert.equal(
      chip.querySelector('.absolute'),
      null,
      'the out-of-flow corner dot is still in the markup',
    );
    const date = chip.querySelector('[data-schedule-card-date]');
    assert.notEqual(date, null, 'the chip has no date element');
    assert.equal(
      date.firstElementChild,
      null,
      'the date element still leads with an inline dot',
    );
    // The date is the chip’s only visible content — a bare text node now,
    // not a flex row built around a dot.
    assert.equal(/flex items-start/.test(date.getAttribute('class') ?? ''), false);

    // The colour the dot used to carry is still on the border.
    assert.match(chip.getAttribute('style') ?? '', /border-color/);
  }
});

test('CONTROL: the corner dot IS what the component draws by default', () => {
  /**
   * Every assertion above is "no dot". They would all pass against a chip
   * that never had one, a renamed marker or a dead selector. So: the same
   * component, same date, default props, must produce exactly the
   * absolutely positioned dot the bundle is asserting the absence of.
   */
  const html = renderToStaticMarkup(createElement(ScheduleCard, { dateLabel: '1 ม.ค.' }));
  assert.match(html, /data-dot="corner"/);
  assert.match(html, /class="absolute left-1 top-1 h-2\.5 w-2\.5 rounded-full"/);
});

test('the boxes sit TWO to a scroll-snapped track, not one per row', () => {
  /**
   * WHAT THIS REPLACED. The chips filled a
   * `grid-cols-[repeat(auto-fill,minmax(0,var(--bundle-chip-w)))]` track whose
   * width was the longest date label in the whole bundle — about 5.2rem for a
   * Thai round — which fits ONE column in a ~200-230px tile. So a five-round
   * course stacked five chips one per row and the tile grew to roughly three
   * times the height of its neighbours.
   *
   * The shared width went with it, and nothing replaced it: two boxes at
   * `calc(50% - 0.25rem)` are equal to each other and equal across every tile
   * by construction, with no per-character estimate to go wrong in a fallback
   * font. The absence probes below are the half that matters — a leftover grid
   * class or a leftover `--bundle-chip-w` would both look fine and fight the
   * track.
   */
  // LONG_E is in here on purpose: it is the longest label the fixtures have,
  // and a box that sized itself to its own date would betray it first.
  const d = multi(
    [{ id: 'ra' }, { id: 'rb' }, { id: 'rc' }, { id: 'rlong' }],
    [OPEN_A, OPEN_B, FULL_C, LONG_E],
  );
  const track = d.querySelector('[data-testid="bundle-round-track"]');
  assert.notEqual(track, null, 'the carousel track is gone');
  const cls = track.getAttribute('class') ?? '';
  assert.match(cls, /\boverflow-x-auto\b/, `the track does not scroll: ${cls}`);
  assert.match(cls, /\bsnap-x\b/, `the track does not snap: ${cls}`);
  assert.match(cls, /\bsnap-mandatory\b/, `the track snaps only loosely: ${cls}`);

  assert.equal(
    /grid-cols-/.test(cls), false,
    `the old chip grid is back on the track: ${cls}`,
  );
  assert.equal(
    /--bundle-chip-w/.test(d.body.innerHTML), false,
    'the shared chip width is still being written somewhere',
  );

  // Two in view, whatever the dates measure: each box takes half the track
  // minus half the gap, and neither grows nor shrinks away from it.
  const boxes = [...d.querySelectorAll('[data-testid="bundle-round-box"]')];
  assert.equal(boxes.length, 4);
  for (const b of boxes) {
    const bc = b.getAttribute('class') ?? '';
    assert.match(bc, /\bshrink-0\b/, `a box can shrink below half the track: ${bc}`);
    assert.match(bc, /\bgrow-0\b/, `a box can grow past half the track: ${bc}`);
    assert.match(bc, /\bsnap-start\b/, `a box is not a snap point: ${bc}`);
    assert.match(bc, /\bmin-w-0\b/, `a long date will widen the track: ${bc}`);
    assert.equal(
      b.getAttribute('style'),
      'flex-basis:calc(50% - 0.25rem)',
      `a box is not half the track: ${b.getAttribute('style')}`,
    );

    /**
     * AND NO `h-full` ON THE CHIP. It is 100% of the BOX, and the box now has
     * a `รอบที่ k` label above the chip — so the percentage would overflow by
     * the label's height. `flex-1` fills what is left instead, which is also
     * what equalises the two chips when one date wraps and the other does not.
     */
    const chipCls = b.querySelector('[data-schedule-card]').getAttribute('class') ?? '';
    assert.equal(
      /\bh-full\b/.test(chipCls), false,
      `the chip takes its height from the box: ${chipCls}`,
    );
    assert.match(chipCls, /\bflex-1\b/, `the chip does not fill its box: ${chipCls}`);
  }
});

test('CONTROL: h-full IS what the component emits by default', () => {
  /**
   * The assertion above is an absence, and would pass against a renamed class
   * or a chip that never had one. The course card still needs `h-full` — its
   * grid cells rely on it — so the default must still carry it, in the same
   * position in the string it has always occupied.
   */
  const html = renderToStaticMarkup(createElement(ScheduleCard, { dateLabel: '1 ม.ค.' }));
  assert.match(html, /class="relative flex h-full flex-col/, 'the default chip lost h-full');
});

test('every tile heads its rounds รอบอบรมที่เข้าร่วม (N รอบ), counting its own', () => {
  /**
   * TWO RULINGS, ONE LINE.
   *
   * The heading used to be `offeredRows.length > 1 ? 'รอบที่เลือกได้' :
   * 'รอบอบรม'`, so a row of tiles labelled the same thing two different ways
   * depending on how many rounds each course happened to offer — a difference
   * a reader has to account for before deciding it meant nothing. That ruling
   * STANDS: the label does not change with the count.
   *
   * What it now carries is the count ITSELF, because only two rounds are on
   * screen at a time and `(5 รอบ)` is what tells a visitor there is more to
   * scroll to. A number is not a different label.
   *
   * Asserted across a ONE-round and a THREE-round course IN THE SAME CARD,
   * which is the shape that made the old defect visible, rather than across
   * two renders where the two headings would never be seen together.
   */
  const d = doc(
    {
      name: 'B',
      items: [
        { id: 'i1', courseId: 'A', rounds: [{ id: 'ra' }] },
        { id: 'i2', courseId: 'B', rounds: [{ id: 'rb' }, { id: 'rc' }, { id: 'rd' }] },
      ],
    },
    [
      { id: 'i1', courseId: 'A', course: COURSE, rounds: [OPEN_A] },
      { id: 'i2', courseId: 'B', course: COURSE, rounds: [OPEN_B, FULL_C, CLOSED_D] },
    ],
  );

  const lists = [...d.querySelectorAll('[data-testid="bundle-round-list"]')];
  assert.equal(lists.length, 2, 'both tiles must draw a rounds list');
  // One round on the first tile, three on the second — the case that used to
  // produce two different headings.
  assert.deepEqual(
    lists.map((l) => l.querySelectorAll('[data-testid="bundle-round-box"]').length),
    [1, 3],
    'the fixture no longer contrasts a single round with several',
  );
  assert.deepEqual(
    lists.map((l) => text(l.querySelector('[data-testid="bundle-round-heading"]'))),
    ['รอบอบรมที่เข้าร่วม (1 รอบ)', 'รอบอบรมที่เข้าร่วม (3 รอบ)'],
    'the tiles head their rounds differently, or lost their count',
  );
  // And the plural wording is gone from the card entirely.
  assert.equal(
    text(d.body).includes('รอบที่เลือกได้'),
    false,
    'the count-dependent heading is still rendered somewhere',
  );
});
test('a closed chip fades as a WHOLE — fill, border, dot and ink together', () => {
  /**
   * `muted` used to grey the ink, border and dot to `--text-secondary` and
   * leave the fill transparent, which read as a chip drawn in dark slate: a
   * closed round looked EMPHASISED beside an open one. It now takes a pale
   * fill as well.
   *
   * NOT `opacity`, and that is asserted rather than assumed. Fading the
   * element scales the ink's contrast against whatever is behind it by an
   * amount that depends on the surface — the one way a faded state drifts
   * under AA with nothing on screen to say so. The three
   * `--round-chip-muted-*` tokens carry measured values instead.
   */
  const d = multi([{ id: 'ra' }, { id: 'rc' }], [OPEN_A, FULL_C]);
  const [open, closed] = [...d.querySelectorAll('[data-schedule-card]')];

  assert.equal(closed.getAttribute('data-tone'), 'muted');
  const cls = closed.getAttribute('class');
  assert.match(cls, /bg-\[var\(--round-chip-muted-bg\)\]/, 'the closed chip has no faded fill');
  assert.match(
    closed.querySelector('[data-schedule-card-date]').getAttribute('class'),
    /text-\[var\(--round-chip-muted-ink\)\]/,
    'the closed date is not using the faded ink',
  );
  // The border is an inline style from the same token. There is no dot to
  // check any more — a bundle chip draws none (see the no-dot test), so the
  // border is the only thing carrying the colour, which is exactly why
  // dropping the dot cost the chip no information.
  assert.match(closed.getAttribute('style') ?? '', /var\(--round-chip-muted-border\)/);
  assert.equal(
    closed.querySelector('[data-schedule-card-date] span'),
    null,
    'the chip grew a dot back inside its date',
  );

  // NO blanket opacity anywhere on the chip.
  assert.equal(/opacity-/.test(cls), false, `the chip fades with opacity: ${cls}`);
  assert.equal(/opacity/.test(closed.getAttribute('style') ?? ''), false, 'inline opacity on the chip');

  // The status is still there for a screen reader.
  assert.match(text(closed.querySelector('.sr-only')), /เต็ม/);

  // THE PICKABLE CHIP IS UNTOUCHED: no fill, no muted ink, and its border is
  // still the delivery-type colour rather than a token.
  const openCls = open.getAttribute('class');
  assert.equal(open.getAttribute('data-tone'), 'scoped');
  assert.equal(/round-chip-muted/.test(openCls), false, 'the open chip took the faded fill');
  assert.equal(
    /round-chip-muted/.test(open.getAttribute('style') ?? ''),
    false,
    'the open chip took the faded border',
  );
  assert.match(open.getAttribute('style') ?? '', /border-color:\s*#/, 'the open chip lost its type colour');
});

test('no chip offers ลงทะเบียน — the bundle button is the only way in', () => {
  /**
   * ScheduleCard draws a green `ลงทะเบียน` pill for an open round, because on a
   * course card that is exactly the next thing to do. Here it would be false
   * twice over: a bundle is bought as a package through its own button, and a
   * register pill per round would say each round is separately bookable at its
   * own price — the same competing cheaper-looking exit the per-course
   * ลงทะเบียน button was removed for.
   *
   * Suppressed by passing NO status, which `resolveScheduleBadge` answers with
   * null. Asserted on an all-OPEN item, which is the only state that would
   * produce the pill.
   */
  const d = multi([{ id: 'ra' }, { id: 'rb' }], [OPEN_A, OPEN_B]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.equal(d.querySelectorAll('[data-schedule-card]').length, 2, 'the chips did not render');
  assert.equal(
    text(card).includes('ลงทะเบียน'),
    false,
    `a chip offers registration: ${text(card)}`,
  );
  // And no status pill of ANY wording — the slot itself is empty.
  assert.equal(text(card).includes('เปิดรับ'), false, 'a status pill came back');
});

test('CONTROL: ScheduleCard DOES draw ลงทะเบียน when a status is passed', () => {
  /**
   * Without this the test above passes against a chip that never had the pill
   * to begin with — a renamed component, a broken import, a dead selector. The
   * pill must be demonstrably reachable from the same component, so that its
   * absence in the bundle is a decision this card made and not an accident.
   */
  const html = renderToStaticMarkup(
    createElement(ScheduleCard, { dateLabel: '1 ม.ค.', status: 'open' }),
  );
  assert.match(html, /ลงทะเบียน/, 'ScheduleCard no longer draws the pill at all');
});

test('CONTROL: the visible-text probe would SEE a refusal word if one were shown', () => {
  /**
   * Without this, the guard above passes against a card that renders nothing
   * at all, a broken selector or a stripped-too-hard probe. Strip only the
   * chip's `sr-only` nodes from a FULL card and the word must come back.
   */
  const d = multi([{ id: 'rc' }], [FULL_C]);
  const card = d.querySelector('[data-testid="bundle-item"]');
  assert.match(text(card), /เต็ม/, 'the word is not even in the sr-only node');
  for (const el of [...card.querySelectorAll('.sr-only')]) el.remove();
  assert.equal(text(card).includes('เต็ม'), false);
  // …and the chip survived the strip, so the probe did not empty the card.
  assert.notEqual(
    card.querySelector('[data-schedule-card-date]'),
    null,
    'the strip removed the chip itself, not just its sr-only node',
  );
});

test('a round past its pick deadline is greyed, and says so only to a screen reader', () => {
  const d = multi([{ id: 'ra', pickUntil: '2020-01-01' }], [OPEN_A]);
  const box = d.querySelector('[data-testid="bundle-round-box"]');
  assert.equal(box.getAttribute('data-reason'), 'deadline_passed');
  assert.equal(box.querySelector('[data-schedule-card]').getAttribute('data-tone'), 'muted');
  assert.match(text(box.querySelector('.sr-only')), /หมดเวลาเลือก/);
});

test('NO round shows a pick deadline — the เลือกได้ถึง line is gone', () => {
  /**
   * It read `เลือกได้ถึง 19 ส.ค. 2573` under every pickable round: the last
   * day the round can be CHOSEN, printed beside the days the training runs.
   * Two dates per round, one of them about the buying process, on a card
   * whose job is to let a visitor see whether any date suits them.
   *
   * REMOVED FROM THE PUBLIC CARD ONLY. The deadline is still computed by
   * `roundChoices` and still decides pickability — `deadline_passed` above is
   * that same computation — and the editor still shows the author the date.
   * Asserted over BOTH a default deadline and an explicit one, so a later
   * `pickUntil` branch cannot bring the line back for one of them.
   */
  for (const rounds of [[{ id: 'ra' }], [{ id: 'ra', pickUntil: '2030-07-01' }]]) {
    const d = multi(rounds, [OPEN_A]);
    assert.equal(
      d.querySelector('[data-testid="bundle-round-deadline"]'),
      null,
      'the deadline line is back',
    );
    // `text(d.body)`, NOT `text(d)` — a Document has no textContent, so the
    // document form reads null and `.includes` throws instead of asserting.
    assert.equal(text(d.body).includes('เลือกได้ถึง'), false, 'the deadline wording is back');
    // The dates it was printed beside are untouched.
    assert.match(text(d.querySelector('[data-schedule-card-date]')), /20\s*-\s*21 ส\.ค\./);
  }
});

/**
 * ── TWO DEADLINE TESTS RETIRED HERE, AND WHERE THEIR SUBJECT LIVES NOW ────
 * "an EARLIER pickUntil is the date shown, and a later one is clamped away"
 * and "a non-pickable round shows NO deadline line" both read the
 * `bundle-round-deadline` element, which the public card no longer renders.
 *
 * NEITHER IS A COVERAGE LOSS, and that was checked rather than assumed. The
 * first was really a test of the CLAMP, asserted through a card that happened
 * to print the result; the clamp is pinned directly in
 * test/pure/bundleRoundChoice — "an EARLIER pickUntil wins", "a LATER
 * pickUntil does NOT extend the round", "a pickUntil EQUAL to the cap is kept
 * as-is", and "the reported deadline is the EFFECTIVE one, not the stored
 * one". The second asserted the absence of a line that is now absent for
 * EVERY round, which "NO round shows a pick deadline" above states once and
 * for both branches.
 */

// ── sequential: the order labels and the rule line ─────────────────────────

test('sequential draws ลำดับที่ N on every tile', () => {
  const d = doc(
    {
      name: 'B',
      sequential: true,
      items: [
        { id: 'i1', courseId: 'A', rounds: [{ id: 'ra' }] },
        { id: 'i2', courseId: 'B', rounds: [{ id: 'rb' }] },
      ],
    },
    [
      { id: 'i1', courseId: 'A', course: COURSE, rounds: [OPEN_A] },
      { id: 'i2', courseId: 'B', course: COURSE, rounds: [OPEN_B] },
    ],
  );
  const labels = [...d.querySelectorAll('[data-testid="bundle-item-order"]')].map((e) => text(e));
  assert.deepEqual(labels, ['ลำดับที่ 1', 'ลำดับที่ 2']);

  /**
   * AND NO RULE LINE. `เลือกรอบตามลำดับ — รอบของหลักสูตรถัดไปต้องเริ่มหลัง
   * หลักสูตรก่อนหน้าจบ` used to sit under the list. It was true and it was
   * early: this card describes what is IN the package, and the constraint
   * only bites once someone is choosing dates.
   *
   * The wizard still states it — above its controls AND per disabled option
   * — so the rule is read where it applies. Asserted here as BOTH the
   * element and the wording, because the element could be renamed.
   */
  assert.equal(d.querySelector('[data-testid="bundle-sequential-note"]'), null);
  assert.equal(text(d.body).includes('เลือกรอบตามลำดับ'), false, 'the rule line is back on the card');
});

test('CONTROL: a NON-sequential bundle draws no order labels and no rule line', () => {
  const d = multi([{ id: 'ra' }], [OPEN_A]);
  assert.equal(d.querySelector('[data-testid="bundle-item-order"]'), null);
  assert.equal(d.querySelector('[data-testid="bundle-sequential-note"]'), null);
});

test('the card does NOT fade a later course behind previous_not_picked', () => {
  // The subtle call: with the real sequential flag and no picks, every round of
  // course 2 would be `previous_not_picked` — true and useless on a card, which
  // is not a picker. Each round shows its OWN state and the sequence is stated
  // once as a rule.
  const d = doc(
    {
      name: 'B',
      sequential: true,
      items: [
        { id: 'i1', courseId: 'A', rounds: [{ id: 'ra' }] },
        { id: 'i2', courseId: 'B', rounds: [{ id: 'rb' }] },
      ],
    },
    [
      { id: 'i1', courseId: 'A', course: COURSE, rounds: [OPEN_A] },
      { id: 'i2', courseId: 'B', course: COURSE, rounds: [OPEN_B] },
    ],
  );
  const boxes = [...d.querySelectorAll('[data-testid="bundle-round-box"]')];
  assert.equal(boxes.length, 2);
  assert.equal(boxes.every((b) => b.getAttribute('data-pickable') === 'yes'), true);
});

// ── auto-close (R5) ───────────────────────────────────────────────────────

test('AUTO-CLOSE: a course whose every round is full closes the bundle', () => {
  const d = multi([{ id: 'rc' }], [FULL_C]);
  assert.equal(d.querySelector('[data-testid="bundle-register"]'), null);
  const state = d.querySelector('[data-testid="bundle-closed"]');
  assert.notEqual(state, null, 'there is no state message in the button slot');
  assert.match(text(state), /ยังไม่มีรอบที่เปิดรับครบทุกหลักสูตร/);
});

test("the AUTHOR'S switch wins over auto-close, and says the author's sentence", () => {
  // Both refusals are true at once here. The author's is checked first, so an
  // author who closed a bundle is never told instead that the schedule did.
  const d = multi([{ id: 'rc' }], [FULL_C], { registrationOpen: false });
  assert.match(text(d.querySelector('[data-testid="bundle-closed"]')), /ปิดรับสมัครแล้ว/);
});

test('AUTO-CLOSE: sequential with no fitting chain closes it, non-sequential does not', () => {
  // Course 2's only round starts before course 1's only round ends.
  const items = [
    { id: 'i1', courseId: 'A', rounds: [{ id: 'rb' }] }, // 2030-11-05
    { id: 'i2', courseId: 'B', rounds: [{ id: 'ra' }] }, // 2030-08-20..21, EARLIER
  ];
  const data = [
    { id: 'i1', courseId: 'A', course: COURSE, rounds: [OPEN_B] },
    { id: 'i2', courseId: 'B', course: COURSE, rounds: [OPEN_A] },
  ];
  const free = doc({ name: 'B', items }, data);
  assert.notEqual(free.querySelector('[data-testid="bundle-register"]'), null, 'order does not matter when off');

  const seq = doc({ name: 'B', sequential: true, items }, data);
  assert.equal(seq.querySelector('[data-testid="bundle-register"]'), null);
  assert.match(text(seq.querySelector('[data-testid="bundle-closed"]')), /ยังไม่มีรอบที่เปิดรับครบทุกหลักสูตร/);
});

test('A LEGACY single-round bundle still registers — the regression this caught', () => {
  // THE BUG THIS PINS: bundleRoundChoice read `item.rounds` only, so a legacy
  // item (roundId, no rounds[]) looked like a course offering NOTHING — and
  // every one of the 91 stored items is legacy. The card would have
  // auto-closed every existing bundle. Caught by a fixture on the old shape.
  const d = doc(
    { name: 'B', discountCode: 'EXP1', items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'ra' }] },
    [{ id: 'i1', courseId: 'MSE-L1', course: COURSE, rounds: [OPEN_A] }],
  );
  assert.notEqual(d.querySelector('[data-testid="bundle-register"]'), null, 'a legacy bundle lost its button');
  assert.equal(d.querySelector('[data-testid="bundle-closed"]'), null);
  assert.equal(d.querySelectorAll('[data-testid="bundle-round-box"]').length, 1);
});

// ── both card styles ──────────────────────────────────────────────────────

test('the rounds list renders in BOTH card styles, with no active dark: colour on Navy', () => {
  for (const theme of ['light', 'navy']) {
    const d = multi([{ id: 'ra' }, { id: 'rc' }], [OPEN_A, FULL_C], {}, { bundleCardTheme: theme });
    assert.equal(
      d.querySelectorAll('[data-testid="bundle-round-box"]').length, 2,
      `the list did not render on ${theme}`,
    );
    // BOTH chips are the shared component, and the pair of tones is intact —
    // one pickable, one greyed — on each style.
    const tones = [...d.querySelectorAll('[data-schedule-card]')].map((c) => c.getAttribute('data-tone'));
    assert.deepEqual(tones, ['scoped', 'muted'], `the tones are wrong on ${theme}`);
    // The greyed one still says why, to a screen reader only.
    assert.match(text(d.querySelector('.sr-only')), /ปิดรับ|เต็ม|เริ่มแล้ว|หมดเวลาเลือก/);
    // And neither chip draws a dot on EITHER style — this is a property of
    // the bundle chip, not of which card it happens to sit on.
    const dots = [...d.querySelectorAll('[data-schedule-card]')].map((c) => c.getAttribute('data-dot'));
    assert.deepEqual(dots, ['none', 'none'], `a chip drew a dot on ${theme}`);
  }

  // On Navy the tile is a LIGHT surface, so no dark: utility may remain inside
  // it — they compile to :is(.dark *) and the card scopes `dark` on itself.
  const navy = multi([{ id: 'ra' }], [OPEN_A], {}, { bundleCardTheme: 'navy' });
  const tile = navy.querySelector('[data-testid="bundle-item"]');
  assert.doesNotMatch(tile.innerHTML, /dark:/, 'a dark: utility survived inside the light tile');
});
