import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseScheduleSection } from '@/components/pageBuilder/sections/course_schedule';
import { NEUTRAL_STATUS, SCHEDULE_STATUS } from '@/lib/scheduleStatus';

/**
 * `course_schedule` in CHOSEN-ROUNDS mode — round 64, step 3.
 *
 * The three MSDB statuses are NOT re-asserted here. test/pure/scheduleStatus and
 * test/render/scheduleStatus already own the words and the colours across every
 * surface, and a second copy of those assertions beside this component would be
 * the sixth local map in test form. What this file covers is what is new: the
 * two DERIVED states, and the rule that neither of them is a link.
 *
 * ── MATCHING WITH BOUNDARIES ───────────────────────────────────────────────
 * This repo has been bitten five times by a bare element or attribute match —
 * `includes('<a')` is true of `<article`, and `\bchecked\b` matches inside
 * `aria-checked`. Every structural assertion below uses an explicit boundary,
 * and the anchor helper is shared so there is one place to get it wrong.
 */

const R = (content, data) => renderToStaticMarkup(CourseScheduleSection({ content, data }));

/** Anchors, matched with a boundary so `<article>` cannot pass for one. */
const anchors = (html) => html.match(/<a[\s>]/g) ?? [];

const live = (id, dates, extra = {}) => ({
  _id: id, dates, status: 'open', type: 'classroom', ...extra,
});

const ROWS = [
  live('r1', ['2026-09-10', '2026-09-11']),
  live('r2', ['2026-10-02'], { status: 'nearly_full', type: 'hybrid' }),
  live('r3', ['2026-11-20']),
];

const manual = (roundIds, roundSnapshots = []) => ({
  courseId: 'MSE-L1', source: 'manual', roundIds, roundSnapshots,
});

// ── the mode itself ────────────────────────────────────────────────────────

test('manual mode draws only the chosen rounds, in the author\'s order', () => {
  const html = R(manual(['r3', 'r1']), ROWS);
  assert.ok(html.includes('20 พ.ย.'), 'the first chosen round is missing');
  assert.ok(html.includes('10-11 ก.ย.'), 'the second chosen round is missing');
  assert.ok(!html.includes('2 ต.ค.'), 'an UNCHOSEN round was drawn');
  assert.ok(html.indexOf('20 พ.ย.') < html.indexOf('10-11 ก.ย.'),
    'the rows came back in fetch order, not the order the author chose them');
});

test('a chosen round that is still live keeps its status and its link', () => {
  const html = R(manual(['r2']), ROWS);
  assert.ok(html.includes(SCHEDULE_STATUS.nearly_full.action));
  assert.equal(anchors(html).length, 1, 'a live chosen round stopped being clickable');
  assert.ok(html.includes('/registration/public?course=mse-l1'));
  assert.ok(html.includes('class=r2'));
});

// ── the two derived states ─────────────────────────────────────────────────

test('an ELAPSED chosen round renders, greyed, and is not a link', () => {
  const html = R(
    manual(['gone'], [{ id: 'gone', dates: ['2026-01-05', '2026-01-06'], type: 'hybrid' }]),
    ROWS
  );

  assert.notEqual(html, '', 'a chosen round was DROPPED — it must render (round 64 amendment)');
  assert.ok(html.includes('จบไปแล้ว'), 'the elapsed chip is missing');
  assert.ok(html.includes('5-6 ม.ค.'), 'the snapshot dates were not drawn');
  assert.ok(html.includes('ไฮบริด'), 'the snapshot delivery type was not drawn');
  assert.ok(html.includes(NEUTRAL_STATUS.soft.split(' ')[0]), 'the chip is not the neutral grey');
  assert.deepEqual(anchors(html), [], 'an elapsed round was clickable');
});

test('a MISSING chosen round renders, greyed, and is not a link', () => {
  const html = R(
    manual(['withdrawn'], [{ id: 'withdrawn', dates: ['2027-05-04'], type: 'classroom' }]),
    ROWS
  );

  assert.ok(html.includes('ไม่พบรอบนี้'), 'the missing chip is missing');
  assert.ok(html.includes('4 พ.ค.'), 'the last-known dates were not drawn');
  assert.deepEqual(anchors(html), [], 'a missing round was clickable');
});

test('a chosen round with NO snapshot still renders, and says nothing it cannot know', () => {
  const html = R(manual(['never-seen']), ROWS);

  assert.ok(html.includes('ไม่พบรอบนี้'));
  assert.ok(html.includes('ยังไม่ระบุวันที่'), 'the no-date fallback did not fire');
  assert.deepEqual(anchors(html), []);
  // The three things a row this thin must never claim.
  for (const word of [
    SCHEDULE_STATUS.open.action, SCHEDULE_STATUS.nearly_full.action, SCHEDULE_STATUS.full.action,
  ]) {
    assert.ok(!html.includes(word),
      `a round the site knows NOTHING about claimed the status "${word}"`);
  }
  assert.ok(!html.includes('/registration/public'), 'a dead round carried a registration url');
});

test('the two derived states are told APART, not merged into one grey', () => {
  const elapsed = R(manual(['x'], [{ id: 'x', dates: ['2020-01-01'] }]), ROWS);
  const missing = R(manual(['x'], [{ id: 'x', dates: ['2099-01-01'] }]), ROWS);

  assert.ok(elapsed.includes('จบไปแล้ว') && !elapsed.includes('ไม่พบรอบนี้'));
  assert.ok(missing.includes('ไม่พบรอบนี้') && !missing.includes('จบไปแล้ว'));
  assert.notEqual(elapsed, missing, 'elapsed and missing collapsed into one word — a computed '
    + 'conclusion and a total absence of knowledge are different claims (round 63 §C.2)');
});

test('live and dead rounds sit in ONE list, each drawn on what is known about it', () => {
  const html = R(
    manual(['r1', 'gone', 'r3'], [{ id: 'gone', dates: ['2026-02-02'], type: 'classroom' }]),
    ROWS
  );
  assert.equal(anchors(html).length, 2, 'exactly the two LIVE rows should be links');
  assert.ok(html.includes('จบไปแล้ว'));
  assert.ok(html.includes(SCHEDULE_STATUS.open.action));
  assert.ok(html.indexOf('10-11 ก.ย.') < html.indexOf('2 ก.พ.'));
  assert.ok(html.indexOf('2 ก.พ.') < html.indexOf('20 พ.ย.'));
});

// ── the controls ───────────────────────────────────────────────────────────

test('CONTROL: the "not a link" assertions can fail', () => {
  /**
   * `anchors(html)` returning [] and the renderer never running produce the same
   * empty array. So the same helper is pointed at a row that IS a link — a live
   * chosen round — and must come back with one. If this ever reports zero, every
   * un-clickable assertion above is vacuous.
   *
   * And the boundary is exercised on purpose: `<article` must NOT count, which is
   * the bare-element trap this repo has hit five times.
   */
  assert.equal(anchors(R(manual(['r1']), ROWS)).length, 1,
    'the anchor matcher found nothing in markup that DOES contain a link');
  assert.deepEqual(anchors('<article><address>x</address></article>'), [],
    'the anchor matcher counted <article> as an anchor — match with boundaries');
  assert.deepEqual(anchors('<a href="/x">y</a>'), ['<a ']);
});

test('CONTROL: the mode is actually being read', () => {
  // Same rows, same section, only `source` differs. If these agree, every
  // manual-mode assertion above is measuring the unchanged path.
  const asUpcoming = R({ courseId: 'MSE-L1' }, ROWS);
  const asManual = R(manual(['r1']), ROWS);
  assert.notEqual(asUpcoming, asManual);
  assert.equal(anchors(asUpcoming).length, 3);
});

// ── what did NOT change ────────────────────────────────────────────────────

test('the empty case is inherited unchanged — no course, no rounds, bad code', () => {
  /**
   * Round 63 §H: a real course with no open rounds and a code MSDB does not have
   * both resolve to `[]`, and the section renders NOTHING on the page. 35 of 79
   * public courses were in that state when it was measured, so this is a common
   * path, not an edge.
   */
  assert.equal(R({ courseId: 'MAKE-L1', limit: 0 }, []), '');
  assert.equal(R({ courseId: 'NOPE-XX', limit: 0 }, []), '');
  assert.equal(R({ courseId: 'MSE-L1' }, undefined), '');
  assert.equal(R({}, []), '');
  // ...and manual with nothing chosen fails closed the same way.
  assert.equal(R(manual([]), ROWS), '');
});
