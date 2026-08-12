import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { TRAINING_TYPE_COLOR } from '@/lib/schedule/trainingTypeColor';
import { readSource } from '../sourceScan.mjs';

/**
 * The course card's ROUND STRIP — two up, side by side, in a box that fits.
 *
 * ── WHAT REPLACED WHAT ──────────────────────────────────────────────────────
 * A `flex flex-nowrap overflow-x-auto` strip of `schedules.slice(0, 3)`, each
 * round drawn as a hand-authored SVG `<path>` inside a fixed `viewBox="0 0 90
 * 80"` in a fixed `h-[70px] w-[83px]` box, inner text `whitespace-nowrap`.
 *
 * The box could not grow — the path geometry is absolute — and the label it now
 * has to hold is `8, 10, 12 ต.ค. 69`, which overflows 83px and, being nowrap,
 * overflowed VISIBLY. So the SVG is gone and the border is CSS `border-color`.
 *
 * ── THE YEAR IS THE OTHER HALF, AND IT IS A MEASUREMENT ─────────────────────
 * These rounds come from `enrichCoursesWithDetails` → `listSchedulesByCourse`,
 * which takes `limit: 3` with NO `to` bound and no horizon at all — "the next N
 * rounds", not "the next N months". A course running twice a year, viewed in
 * November, shows rounds in February and May of the FOLLOWING year, and a bare
 * `16-17 ก.พ.` on a bookable card reads as a date that has already passed. So
 * the label runs `showYear: 'auto'`.
 *
 * ── THE FIXTURE PINS THE CLOCK ──────────────────────────────────────────────
 * `CURRENT_YEAR` is a constant and every date is fixed. This card takes the year
 * as a PROP precisely so it can be pinned; a test that read the real clock would
 * mean something different every January, which is the class of defect the prop
 * exists to prevent.
 */

const CURRENT_YEAR = 2026;

const round = (id, dates, type = 'classroom', status = 'open') => ({
  _id: id,
  dates,
  type,
  status,
});

const COURSE = {
  _id: 'c1',
  course_id: 'MSE-PBI',
  course_name: 'Power BI Desktop',
  course_price: 9000,
  course_trainingdays: 2,
  course_type_public: true,
  schedules: [
    round('s1', ['2026-09-16', '2026-09-17']),
    round('s2', ['2026-10-08', '2026-10-10', '2026-10-12'], 'hybrid', 'nearly_full'),
    round('s3', ['2026-11-05']),
  ],
};

const render = (course = COURSE, props = {}) =>
  renderToStaticMarkup(
    createElement(CourseCard, { course, currentYear: CURRENT_YEAR, ...props }),
  );

/** The round strip's grid, and the boxes inside it. */
const strip = (html) => html.match(/<div class="grid grid-cols-2[^"]*">([\s\S]*?)<\/div><\/div>/)?.[1] ?? '';
const roundBoxes = (html) =>
  [...html.matchAll(/<div class="relative flex h-full flex-col[^"]*"[^>]*>[\s\S]*?<\/div>/g)].map((m) => m[0]);
const linkedRounds = (html) =>
  [...html.matchAll(/&amp;class=([^"&]+)/g)].map((m) => m[1]);

// ── Two up ──────────────────────────────────────────────────────────────────

test('two rounds render', () => {
  const html = render();
  assert.equal(roundBoxes(html).length, 2, 'the card must show exactly two round boxes');
  const ids = linkedRounds(html);
  assert.ok(ids.includes('s1'), 'the first round is missing');
  assert.ok(ids.includes('s2'), 'the second round is missing');
});

test('a THIRD round does not', () => {
  // The strip used to show three behind a horizontal scroll inside a card that
  // is itself inside a grid — an affordance nobody finds.
  assert.equal(linkedRounds(render()).includes('s3'), false, 's3 must not render');
});

test('CONTROL: the third round IS in the fixture and CAN render', () => {
  /**
   * `includes(...) === false` passes for free against a card that rendered
   * nothing, or a fixture that never had a third round. So: the fixture has one,
   * and moving it into second place puts it on the card.
   */
  assert.equal(COURSE.schedules.length, 3, 'the fixture must have a third round to drop');
  const reordered = { ...COURSE, schedules: [COURSE.schedules[0], COURSE.schedules[2]] };
  assert.ok(linkedRounds(render(reordered)).includes('s3'), 's3 renders when it is within the cap');
});

test('the two boxes sit in a 2-column grid, not a scrolling strip', () => {
  const html = render();
  assert.match(html, /<div class="grid grid-cols-2 items-stretch gap-2 pt-2">/, 'the grid is gone');
  assert.equal(/overflow-x-auto/.test(strip(html)), false, 'the horizontal scroll is back');
  assert.equal(/flex-nowrap/.test(strip(html)), false);
});

test('CONTROL: the scroll probes DO fire on the strip this replaced', () => {
  const before =
    '<div class="scrollbar-hide flex flex-nowrap items-start justify-start gap-1 '
    + '@[280px]:gap-[15px] overflow-x-auto  pt-2">';
  assert.ok(/overflow-x-auto/.test(before), 'the probe can see the old scroll');
  assert.ok(/flex-nowrap/.test(before));
  assert.equal(/grid-cols-2/.test(before), false);
});

// ── The box, and its border ─────────────────────────────────────────────────

test('the border colour differs between a classroom and a hybrid round', () => {
  /**
   * The delivery type is what the border says. Both boxes are rendered from the
   * same component, so if the colour stopped being applied they would come out
   * identical — which is the failure this compares against.
   *
   * ── RE-POINTED, NOT WEAKENED ────────────────────────────────────────────────
   * These were the literals `#005eff` and `#a854f7` — this card's own palette,
   * which disagreed with /schedule's for the same two delivery types. The card
   * now reads lib/schedule/trainingTypeColor, so it draws `#00CCFF` and
   * `#8B5CF6` and the two pages finally say the same thing.
   *
   * Asserted through the SHARED MAP rather than against new literals: the claim
   * worth pinning here is "this card paints the shared palette", and a fresh
   * pair of hardcoded hexes would go stale the next time the palette moves while
   * still passing. The exact values are pinned once, in
   * test/pure/trainingTypeColor.
   */
  const boxes = roundBoxes(render());
  const colourOf = (box) => box.match(/border-color:([^;"]+)/)?.[1];
  assert.equal(colourOf(boxes[0]), TRAINING_TYPE_COLOR.classroom, 'classroom');
  assert.equal(colourOf(boxes[1]), TRAINING_TYPE_COLOR.hybrid, 'hybrid');
  assert.notEqual(colourOf(boxes[0]), colourOf(boxes[1]), 'the two types must not look alike');

  // And the retired values are really gone from the rendered output, so this is
  // a move rather than a coincidence of two maps that happen to agree.
  const html = render();
  assert.equal(/#005eff/i.test(html), false, 'the old course-card classroom is back');
  assert.equal(/#a854f7/i.test(html), false, 'the old course-card hybrid is back');
});

test('CONTROL: the colour probe reads a real value, and both types are in the fixture', () => {
  const boxes = roundBoxes(render());
  assert.equal(boxes.length, 2);
  for (const box of boxes) {
    assert.match(box, /border-color:#[0-9a-fA-F]{6}/, 'a box rendered with no border colour');
  }
  assert.equal(COURSE.schedules[0].type, 'classroom');
  assert.equal(COURSE.schedules[1].type, 'hybrid');
});

test('the SVG box is gone — border, dot and text are ordinary elements', () => {
  /**
   * The measurement, restated as markup. A `<path>` in a fixed `viewBox` cannot
   * grow to fit a Thai label; a bordered `<div>` can.
   */
  const html = render();
  assert.equal(/<svg/.test(strip(html)), false, 'the SVG is back');
  assert.equal(/<path/.test(html), false, 'and its path with it');
  assert.equal(/<mask/.test(html), false, 'and the mask it needed');
  assert.equal(/viewBox="0 0 90 80"/.test(html), false);
  // The fixed box that could not hold the label.
  assert.equal(/h-\[70px\]/.test(html), false, 'the fixed height is back');
  assert.equal(/w-\[83px\]/.test(html), false, 'the fixed width is back');
});

test('the label may WRAP — nothing pins it to one line', () => {
  /**
   * `8, 10, 12 ต.ค.` is the case the fixed box could not hold. It is allowed to
   * wrap now; what must not come back is the `whitespace-nowrap` that made it
   * overflow visibly instead.
   */
  const boxes = roundBoxes(render());
  const dateLine = boxes[1].match(/<span class="text-\[0\.72rem\][^"]*">([^<]*)<\/span>/);
  assert.ok(dateLine, 'the date line is gone');
  assert.equal(dateLine[1], '8, 10, 12 ต.ค.', 'every day of the round, listed');
  const dateClasses = boxes[1].match(/<span class="(text-\[0\.72rem\][^"]*)">/)?.[1] ?? '';
  assert.equal(
    /whitespace-nowrap/.test(dateClasses),
    false,
    'a nowrap date is what overflowed the old box',
  );
  assert.match(dateClasses, /leading-tight/, 'a wrapped label must not double the box height');
});

test('the corner dot is INSIDE the box, where overflow-hidden cannot eat it', () => {
  /**
   * Caught by looking at the rendered markup rather than by a failing assertion,
   * which is why it is now an assertion.
   *
   * The link wrapper is `relative overflow-hidden` — REQUIRED by EarlyBirdRibbon,
   * whose diagonal tails clip against it (see that component's docstring). A dot
   * at a negative offset therefore does not merely sit outside the border, it is
   * clipped away and never paints. The SVG this replaced had the same
   * constraint and solved it the same way: `<circle cx="6.5" cy="5.5">` was
   * inside the viewBox, with the border notched around it.
   */
  const dot = roundBoxes(render())[0].match(/<span class="(absolute[^"]*)"/)?.[1];
  assert.ok(dot, 'the corner dot is gone');
  assert.equal(
    /-(left|top|right|bottom)-/.test(dot),
    false,
    `the dot hangs outside the box ("${dot}") — overflow-hidden on the link will clip it`,
  );
  assert.match(dot, /\bleft-1\b/);
  assert.match(dot, /\btop-1\b/);
  // And the wrapper really does clip, so the assertion above is not theoretical.
  assert.match(render(), /<a[^>]*class="relative block overflow-hidden/);
});

test('CONTROL: the negative-offset probe DOES fire on the shape that would clip', () => {
  const clipped = 'absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full';
  assert.ok(/-(left|top|right|bottom)-/.test(clipped), 'the probe sees a negative offset');
  const safe = 'absolute left-1 top-1 h-2.5 w-2.5 rounded-full';
  assert.equal(/-(left|top|right|bottom)-/.test(safe), false, 'and not a positive one');
});

test('the two boxes are equal height whatever their labels do', () => {
  // `items-stretch` on the grid plus `h-full` on the box. Nothing here can
  // measure, so the mechanism is what is pinned.
  const html = render();
  assert.match(html, /grid-cols-2 items-stretch/, 'the grid must stretch its cells');
  for (const box of roundBoxes(html)) {
    assert.match(box, /\bh-full\b/, 'each box must fill its cell');
  }
});

// ── Linking ─────────────────────────────────────────────────────────────────

test('a round with an _id links to the registration wizard', () => {
  const html = render();
  assert.match(
    html,
    /href="\/registration\/public\?course=mse-pbi&amp;class=s1"/,
    'the round must link with its class pre-selected',
  );
});

test('a round with no _id falls back to signup_url', () => {
  const external = {
    ...COURSE,
    schedules: [{ dates: ['2026-09-16'], type: 'classroom', status: 'open', signup_url: 'https://example.test/x' }],
  };
  assert.match(render(external), /href="https:\/\/example\.test\/x"/);
});

test('a FULL round is NOT a link, even with a usable _id', () => {
  /**
   * The card built its own `/registration/public?course=…&class=…` inline and
   * never asked the status, so a sold-out round would have been a live link
   * straight into the wizard. It goes through `scheduleRegistrationHref` now,
   * which returns null for `full` — and for the local override collection's
   * `closed` spelling of the same state.
   *
   * ── THIS HOLE IS LATENT, WHICH IS WHY IT NEEDS A TEST ───────────────────────
   * Measured against the live feed: enrichCoursesWithDetails calls
   * listSchedulesByCourse with NO `status`, so upstream filters `full` out and
   * one does not reach this card today. /schedule, /search and the course detail
   * page have each already widened their own fetch so a sold-out round can be
   * SHOWN; the day anyone does the same here, this assertion is what stops the
   * card being the one surface that still links it.
   */
  const soldOut = {
    ...COURSE,
    schedules: [round('sf', ['2026-09-16', '2026-09-17'], 'classroom', 'full')],
  };
  const html = render(soldOut);

  assert.equal(roundBoxes(html).length, 1, 'the round must still be SHOWN');
  assert.equal(
    /registration\/public/.test(html),
    false,
    'a full round must not link into the wizard',
  );
  assert.equal(
    /<a[^>]*>\s*<div class="relative flex h-full/.test(html),
    false,
    'and must not be wrapped in an anchor at all — no focus stop either',
  );
  assert.match(html, /class="cursor-not-allowed"/, 'the cursor must say so');
});

test('a full round does not escape via signup_url either', () => {
  /**
   * The worst case the shared helper deliberately shadows: a sold-out round
   * carrying a live upstream signup link is a working form that will take a
   * booking for a round with no seats.
   */
  const soldOut = {
    ...COURSE,
    schedules: [{
      _id: 'sf',
      dates: ['2026-09-16'],
      type: 'classroom',
      status: 'full',
      signup_url: 'https://example.test/still-open',
    }],
  };
  const html = render(soldOut);
  assert.equal(html.includes('example.test'), false, 'the signup_url must be shadowed');
});

test('CONTROL: the same round, OPEN, IS a link', () => {
  /**
   * Without this, every absence above is satisfied by a card that renders no
   * links at all — including one broken by the routing change itself.
   */
  const open = {
    ...COURSE,
    schedules: [round('sf', ['2026-09-16', '2026-09-17'], 'classroom', 'open')],
  };
  const html = render(open);
  assert.match(html, /href="\/registration\/public\?course=mse-pbi&amp;class=sf"/);
  assert.ok(/<a[^>]*>\s*<div class="relative flex h-full/.test(html), 'and IS anchored');
  assert.equal(/class="cursor-not-allowed"/.test(html), false);
});

test('a round with neither is NOT a link', () => {
  /**
   * The full-round contract, same as the table's: no href means no anchor at
   * all, so there is nothing to click and nothing to focus — the box is inert in
   * fact, not merely in appearance.
   */
  const unbookable = {
    ...COURSE,
    schedules: [{ dates: ['2026-09-16'], type: 'classroom', status: 'full' }],
  };
  const html = render(unbookable);
  assert.equal(roundBoxes(html).length, 1, 'the round must still be SHOWN');
  assert.equal(
    /<a[^>]*>\s*<div class="relative flex h-full/.test(html),
    false,
    'an unbookable round must not be wrapped in an anchor',
  );
  assert.equal(/registration\/public/.test(html), false, 'and must not link anywhere');
});

test('CONTROL: the anchor probe DOES see a linked round', () => {
  // Otherwise the assertion above passes against any markup at all.
  assert.ok(
    /<a[^>]*>\s*<div class="relative flex h-full/.test(render()),
    'a bookable round IS wrapped in an anchor',
  );
});

// ── The year ────────────────────────────────────────────────────────────────

test('a CURRENT-year round shows no year', () => {
  const html = render();
  assert.ok(html.includes('16-17 ก.ย.'), 'expected the bare month');
  assert.equal(html.includes('16-17 ก.ย. 69'), false, 'a current-year round must not carry one');
});

test('a NEXT-year round shows one', () => {
  /**
   * The measurement in the file docstring, as a test. `limit: 3` with no horizon
   * means this really happens: a course running twice a year, viewed in
   * November, lists February of the following year.
   */
  const nextYear = {
    ...COURSE,
    schedules: [round('n1', ['2027-02-16', '2027-02-17'])],
  };
  const html = render(nextYear);
  assert.ok(html.includes('16-17 ก.พ. 70'), 'a next-year round must carry its Buddhist year');
});

test('CONTROL: both year cases run through the SAME fixture and differ', () => {
  /**
   * One-sided year assertions pass for a constant. Both directions are rendered
   * and compared: same days, same month position, different year treatment.
   */
  const thisYear = render({ ...COURSE, schedules: [round('a', ['2026-02-16', '2026-02-17'])] });
  const nextYear = render({ ...COURSE, schedules: [round('a', ['2027-02-16', '2027-02-17'])] });
  assert.ok(thisYear.includes('16-17 ก.พ.'), 'the current-year label renders');
  assert.equal(thisYear.includes('16-17 ก.พ. 69'), false, 'without a year');
  assert.ok(nextYear.includes('16-17 ก.พ. 70'), 'and the next-year one renders WITH one');
  assert.notEqual(thisYear, nextYear, 'the two must not produce identical markup');
});

test('the card takes currentYear as a PROP and never reads a clock', () => {
  /**
   * The b-001 rule. This component renders during SSR too, and on Vercel (UTC)
   * `new Date().getFullYear()` differs from the visitor's Bangkok year for the
   * seven hours before midnight on 31 December — a hydration mismatch on the one
   * night of the year when the year is the question.
   */
  const src = readSource('src/app/(public)/training-course/_components/CourseCard.jsx');
  assert.equal(
    /new Date\(\)/.test(src.code),
    false,
    'the card must be HANDED the year, not go and get one',
  );
  assert.match(src.code, /currentYear/, 'and it must take it as a prop');
  assert.equal(
    /currentYear\s*=\s*/.test(src.code.replace(/currentYear=\{currentYear\}/g, '')),
    false,
    'with NO default — a default is a silent guess, and it must throw instead',
  );
});

test('THE THROW: a call site that forgets currentYear fails loudly', () => {
  /**
   * The intended failure mode, asserted rather than assumed. `formatRoundDays`
   * refuses to guess, so a missed call site is a crash in development, not a
   * wrong year in production.
   */
  assert.throws(
    () => renderToStaticMarkup(createElement(CourseCard, { course: COURSE })),
    /currentYear/,
    'omitting currentYear must throw, naming the missing argument',
  );
});

test('CONTROL: the throw is about the YEAR, not about a broken fixture', () => {
  // The same fixture WITH the prop renders cleanly, so the throw above is the
  // missing year and not the card failing on this course.
  assert.doesNotThrow(() => render());
  // And a card with no rounds at all does not need the year — the throw is
  // reached only when a round is actually drawn.
  assert.doesNotThrow(() =>
    renderToStaticMarkup(createElement(CourseCard, { course: { ...COURSE, schedules: [] } })),
  );
});

// ── Everything else about the card is unchanged ─────────────────────────────

test('the Classroom / Hybrid legend row survives', () => {
  const html = render();
  assert.ok(html.includes('รอบการอบรม'), 'the strip heading');
  assert.ok(html.includes('Classroom'), 'the legend');
  assert.ok(html.includes('Hybrid'));
});

test('the status badge still renders, and a blank status renders none', () => {
  const html = render();
  assert.ok(html.includes('เปิดรับ'), 'the open badge');
  assert.ok(html.includes('ใกล้เต็ม'), 'and the nearly-full one');

  const blank = render({ ...COURSE, schedules: [round('b', ['2026-09-16'], 'classroom', '')] });
  const box = roundBoxes(blank)[0];
  assert.ok(box, 'the round must still render');
  assert.equal(/rounded-full px-2 py-\[2px\]/.test(box), false, 'no empty pill, no default label');
});

test('the inhouse-only branch still shows no strip at all', () => {
  const inhouse = {
    ...COURSE,
    course_price: 'Inhouse Only',
    course_type_public: false,
    course_type_inhouse: true,
  };
  assert.equal(roundBoxes(render(inhouse)).length, 0, 'an inhouse-only course has no public rounds');
});
