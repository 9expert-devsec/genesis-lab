import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulesAdminClient } from '@/app/admin/schedules/_components/SchedulesAdminClient';

/**
 * /admin/schedules DRAWS HISTORY NOW, AND HISTORY LOOKS DIFFERENT.
 *
 * MSDB began returning rounds whose last training day has passed, so the grid
 * shows finished rounds beside upcoming ones. Three things follow, and all
 * three are asserted against the real markup here rather than trusted:
 *
 *   1. a finished round says จบไปแล้ว and NOT its stored status;
 *   2. it carries neither แก้ไข nor ลบ — see the cell's comment for why the
 *      delete in particular must not be reachable on a historical round;
 *   3. a round that is not finished is COMPLETELY unchanged — same status
 *      word, both controls.
 *
 * ── THE FIXTURE IS PINNED, INCLUDING "TODAY" ────────────────────────────────
 * `todayKey` is a PROP, fed from page.jsx's single `now` read. That is a design
 * decision about hydration (a client component reading `new Date()` answers
 * twice and can straddle midnight), and it makes this file fully deterministic:
 * the ended/running line is fixture data, not the clock the suite happens to
 * run at. Every case below therefore states its own today.
 *
 * ── THE STALE-STATUS TRAP IS THE POINT OF `r-past` ──────────────────────────
 * `r-past` is deliberately stored as `open`. That is not a contrived value: of
 * 172 fully-past rounds upstream on 2026-09-02, 40 still say `open`, because
 * nothing rewrites a round's status when it finishes. If the card read `status`
 * instead of the dates, this round would render เปิดรับ — a course that ended
 * three weeks ago advertised as taking registrations. Asserting the ABSENCE of
 * เปิดรับ on this card is what catches that, and no assertion about จบไปแล้ว
 * alone can.
 *
 * ── THAI MATCHING IS ANCHORED ON TAG BOUNDARIES ─────────────────────────────
 * `>คำ<`, never a bare substring. 'ลบ' as a substring would also match inside
 * a longer word or an attribute; the boundaries pin it to a rendered text node.
 */

const MONTH_FROM = '2026-08';
const MONTH_TO = '2026-09';
const TODAY = '2026-09-02';

const PROGRAM = { _id: 'p-x', program_id: 'PX', program_name: 'Power BI' };

const COURSES = [
  {
    _id: 'c-past',
    course_id: 'PAST-101',
    course_name: 'Finished course',
    course_price: 8500,
    course_trainingdays: 2,
    program: PROGRAM,
  },
  {
    _id: 'c-run',
    course_id: 'RUN-101',
    course_name: 'Running today course',
    course_price: 9000,
    course_trainingdays: 2,
    program: PROGRAM,
  },
  {
    _id: 'c-fut',
    course_id: 'FUT-101',
    course_name: 'Upcoming course',
    course_price: 6000,
    course_trainingdays: 1,
    program: PROGRAM,
  },
];

/**
 *   r-past    10–11 ส.ค.   ENDED, and stored `open` — the stale-status trap
 *   r-run      1–2  ก.ย.   last day IS today → still running, must be untouched
 *   r-fut       20  ก.ย.   future, `full` → must still say เต็ม
 */
const SCHEDULES = [
  { _id: 'r-past', course: 'c-past', dates: ['2026-08-10', '2026-08-11'], type: 'classroom', status: 'open' },
  { _id: 'r-run', course: 'c-run', dates: ['2026-09-01', '2026-09-02'], type: 'classroom', status: 'open' },
  { _id: 'r-fut', course: 'c-fut', dates: ['2026-09-20'], type: 'hybrid', status: 'full' },
];

function render(overrides = {}) {
  return renderToStaticMarkup(
    createElement(SchedulesAdminClient, {
      schedules: SCHEDULES,
      courses: COURSES,
      programs: [PROGRAM],
      scheduleLocals: [],
      instructors: [],
      search: '',
      filterProgram: '',
      filterStatus: '',
      monthFrom: MONTH_FROM,
      monthTo: MONTH_TO,
      todayKey: TODAY,
      ...overrides,
    }),
  );
}

const HTML = render();

/** Every `<tbody>` row, across every program table. */
function bodyRows(html) {
  return [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    .flatMap((body) => [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)])
    .map((m) => m[0]);
}

/**
 * The `<tr>`s belonging to one course, found by its code cell.
 *
 * Same walk as test/render/adminScheduleGrid: a course owns every following row
 * until the next row carrying a `font-mono` code cell, which is emitted exactly
 * once per course. THROWS when the code is absent rather than returning [] — an
 * empty slice satisfies every "does not contain" assertion below, so a renamed
 * fixture would disarm half this file in silence.
 */
function rowsForCourse(html, courseId) {
  const rows = bodyRows(html);
  const start = rows.findIndex((r) => r.includes(`>${courseId}<`));
  assert.notEqual(start, -1, `no row carries the course code ${courseId}`);
  let end = start + 1;
  while (end < rows.length && !/font-mono/.test(rows[end])) end += 1;
  return rows.slice(start, end).join('');
}

const has = (html, word) => html.includes(`>${word}<`);

test('CONTROL: the fixture really does reach the grid, all three rounds', () => {
  /*
   * Guards every absence assertion in this file. If the rounds never rendered —
   * a packing change, a fixture typo, a course key that stops matching — then
   * "no ลบ on the past card" would pass for the wrong reason, and so would
   * every other negative below.
   */
  for (const code of ['PAST-101', 'RUN-101', 'FUT-101']) {
    assert.ok(rowsForCourse(HTML, code).length > 0, `${code} rendered no rows`);
  }
  // Three status words are in play; two must be present up front.
  assert.ok(has(HTML, 'จบไปแล้ว'), 'no ended round rendered at all');
  assert.ok(has(HTML, 'เปิดรับ'), 'no live round rendered at all');
});

test('an ended round says จบไปแล้ว', () => {
  assert.ok(has(rowsForCourse(HTML, 'PAST-101'), 'จบไปแล้ว'));
});

test('an ended round does NOT show its stale stored status', () => {
  // r-past is stored `open`. เปิดรับ appearing here is the exact defect.
  const past = rowsForCourse(HTML, 'PAST-101');
  assert.ok(!has(past, 'เปิดรับ'), 'the ended card is still advertising เปิดรับ');
});

test('an ended round shows ONE word, not its status AND จบไปแล้ว', () => {
  const past = rowsForCourse(HTML, 'PAST-101');
  for (const word of ['เปิดรับ', 'ใกล้เต็ม', 'เต็ม']) {
    assert.ok(!has(past, word), `the ended card renders ${word} beside จบไปแล้ว`);
  }
});

test('an ended round carries NO ลบ control', () => {
  /*
   * The load-bearing one. `deleteSchedule` hard-deletes upstream with no check
   * for registrations pointing at the round, and everything on this side of the
   * line already happened.
   */
  assert.ok(!has(rowsForCourse(HTML, 'PAST-101'), 'ลบ'));
});

test('an ended round carries NO แก้ไข control', () => {
  assert.ok(!has(rowsForCourse(HTML, 'PAST-101'), 'แก้ไข'));
});

test('a round whose LAST day is today is still live — status and both controls', () => {
  /*
   * The boundary case, at the markup. `roundHasEnded` is strict (`<`), and this
   * is what that strictness buys: a course being taught today keeps its real
   * status and stays editable, which is when an admin most needs it.
   */
  const run = rowsForCourse(HTML, 'RUN-101');
  assert.ok(has(run, 'เปิดรับ'), 'the running round lost its status');
  assert.ok(has(run, 'แก้ไข'), 'the running round lost แก้ไข');
  assert.ok(has(run, 'ลบ'), 'the running round lost ลบ');
  assert.ok(!has(run, 'จบไปแล้ว'), 'the running round was greyed out');
});

test('a future round is untouched, including a full one', () => {
  const fut = rowsForCourse(HTML, 'FUT-101');
  assert.ok(has(fut, 'เต็ม'), 'the future round lost its เต็ม status');
  assert.ok(has(fut, 'แก้ไข'));
  assert.ok(has(fut, 'ลบ'));
  assert.ok(!has(fut, 'จบไปแล้ว'));
});

test('CONTROL: the SAME past round is live when today is before it', () => {
  /*
   * The control the whole file turns on. Identical fixture, clock moved to
   * 1 ส.ค.: PAST-101 must come back with its stored เปิดรับ and both controls.
   * Without this, a card that rendered จบไปแล้ว because of a typo'd course key,
   * a hardwired `true`, or a permanently-greyed cell would look identical to
   * one greyed for the right reason.
   */
  const early = render({ todayKey: '2026-08-01' });
  const past = rowsForCourse(early, 'PAST-101');
  assert.ok(has(past, 'เปิดรับ'), 'not restored to its stored status');
  assert.ok(has(past, 'แก้ไข'), 'แก้ไข not restored');
  assert.ok(has(past, 'ลบ'), 'ลบ not restored');
  assert.ok(!has(early, 'จบไปแล้ว'), 'something is still ended on 1 ส.ค.');
});

test('CONTROL: with no todayKey nothing is ended, and nothing loses a control', () => {
  /*
   * The prop defaults to '' rather than to a live clock, so a caller that says
   * nothing gets the pre-existing behaviour exactly. A default that read the
   * clock would reintroduce the hydration split the prop exists to remove — and
   * would do it invisibly, since the rendered output would look correct.
   */
  const blind = render({ todayKey: '' });
  assert.ok(!has(blind, 'จบไปแล้ว'), 'a round was greyed with no date supplied');
  const past = rowsForCourse(blind, 'PAST-101');
  assert.ok(has(past, 'เปิดรับ'));
  assert.ok(has(past, 'ลบ'));
});

test('the ended card is visually greyed, the live ones are not', () => {
  /*
   * `border-dashed` is the ended card's marker, and the inline `borderColor` —
   * the delivery-type accent every live card wears — is dropped. Asserting both
   * directions, because a rule that greyed EVERY card would satisfy either one
   * alone.
   */
  const past = rowsForCourse(HTML, 'PAST-101');
  const run = rowsForCourse(HTML, 'RUN-101');
  assert.match(past, /border-dashed/, 'the ended card is not greyed');
  assert.doesNotMatch(run, /border-dashed/, 'a live card was greyed too');
  assert.doesNotMatch(past, /border-color/i, 'the ended card kept the type accent');
  assert.match(run, /border-color/i, 'the live card lost its type accent');
});

test('every month column still gets its + รอบ button on a past month', () => {
  /*
   * ส.ค. is now a column full of history, and adding a round to it must stay
   * possible: an admin backfilling a round that ran last month has nowhere else
   * to do it. The `+ รอบ` row is emitted per course per column and is
   * independent of any round's state — pinned here because the ended-card work
   * sits in the same cell and could plausibly take it out.
   */
  const past = rowsForCourse(HTML, 'PAST-101');
  assert.equal(
    [...past.matchAll(/\+ รอบ/g)].length,
    3,
    'expected one + รอบ per month column (2) plus the course-name shortcut (1)',
  );
});
