import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SchedulesAdminClient } from '@/app/admin/schedules/_components/SchedulesAdminClient';
import { RegistrationSummaryPanel } from '@/app/admin/schedules/_components/RegistrationSummaryPanel';
import { summariseRegistrationsByStatus } from '@/lib/registrations/summariseByStatus';

/**
 * ดูรายละเอียด — THE CONTROL THAT REPLACES แก้ไข AND ลบ, AND WHAT IT SHOWS.
 *
 * Two halves, tested where each can actually be reached:
 *
 *   1. the BUTTON, in the grid: present on a finished round, absent on a live
 *      one. Rendered markup, same fixture style as the ended-round file.
 *   2. the PANEL, on its own: the total, the per-status rows, and the empty
 *      state. It is a separate component precisely so this is possible — the
 *      modal that wraps it owns a fetch, and a fetch's resolved markup is
 *      unreachable from renderToStaticMarkup, so a test of the modal could only
 *      ever have seen "กำลังโหลด…".
 *
 * The panel is fed through `summariseRegistrationsByStatus` rather than a
 * hand-built summary object: the numbers on screen are then the ones the real
 * counting produces, so a change to either side that breaks the pair reddens
 * here instead of at neither.
 *
 * Thai matching is anchored on `>คำ<` boundaries, never bare substrings.
 */

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
    _id: 'c-live',
    course_id: 'LIVE-101',
    course_name: 'Upcoming course',
    course_price: 9000,
    course_trainingdays: 2,
    program: PROGRAM,
  },
];

const SCHEDULES = [
  { _id: 'r-past', course: 'c-past', dates: ['2026-08-10', '2026-08-11'], type: 'classroom', status: 'open' },
  { _id: 'r-live', course: 'c-live', dates: ['2026-09-20'], type: 'classroom', status: 'open' },
];

function renderGrid(overrides = {}) {
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
      monthFrom: '2026-08',
      monthTo: '2026-09',
      todayKey: '2026-09-02',
      ...overrides,
    }),
  );
}

function bodyRows(html) {
  return [...html.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)]
    .flatMap((body) => [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)])
    .map((m) => m[0]);
}

/** THROWS on a missing course code — an empty slice passes every absence test. */
function rowsForCourse(html, courseId) {
  const rows = bodyRows(html);
  const start = rows.findIndex((r) => r.includes(`>${courseId}<`));
  assert.notEqual(start, -1, `no row carries the course code ${courseId}`);
  let end = start + 1;
  while (end < rows.length && !/font-mono/.test(rows[end])) end += 1;
  return rows.slice(start, end).join('');
}

const has = (html, word) => html.includes(`>${word}<`);

const GRID = renderGrid();

// ── 1. the button ───────────────────────────────────────────────────────────

test('a finished round offers ดูรายละเอียด', () => {
  assert.ok(has(rowsForCourse(GRID, 'PAST-101'), 'ดูรายละเอียด'));
});

test('a live round does NOT offer it — it has แก้ไข and ลบ instead', () => {
  /*
   * The two treatments are exclusive. A live round showing all three would mean
   * the details view had become a general affordance rather than the thing that
   * stands in for the withheld controls.
   */
  const live = rowsForCourse(GRID, 'LIVE-101');
  assert.ok(!has(live, 'ดูรายละเอียด'), 'a live round grew a details link');
  assert.ok(has(live, 'แก้ไข'));
  assert.ok(has(live, 'ลบ'));
});

test('CONTROL: the same round loses ดูรายละเอียด when it is not yet over', () => {
  // Identical fixture, clock moved back before the round. Without this, a
  // hardwired button would look exactly like a correctly-placed one.
  const early = renderGrid({ todayKey: '2026-08-01' });
  const past = rowsForCourse(early, 'PAST-101');
  assert.ok(!has(past, 'ดูรายละเอียด'));
  assert.ok(has(past, 'แก้ไข'), 'and the write controls came back');
});

// ── 2. the panel ────────────────────────────────────────────────────────────

const panel = (rows) =>
  renderToStaticMarkup(
    createElement(RegistrationSummaryPanel, {
      summary: summariseRegistrationsByStatus(rows),
    }),
  );

test('the counts on screen match the fixture, status by status', () => {
  /*
   * POWER-BI 10–11 ส.ค. 2026 as it really stands: 13 registrations, pending 6,
   * confirmed 1, paid 6, nobody cancelled. Every number is asserted against its
   * own label so a breakdown that rendered the right total with the wrong rows
   * — or the right rows against the wrong labels — reddens.
   */
  const html = panel([
    ...Array(6).fill({ status: 'pending' }),
    ...Array(1).fill({ status: 'confirmed' }),
    ...Array(6).fill({ status: 'paid' }),
  ]);

  assert.ok(has(html, 'ทั้งหมด'), 'no total row');
  assert.ok(has(html, '13'), 'the total 13 is missing');

  const pairs = [...html.matchAll(/>([^<>]+)<\/span><span[^>]*>(\d+)<\/span>/g)]
    .map((m) => [m[1], m[2]]);
  const found = Object.fromEntries(pairs);

  assert.equal(found['รอดำเนินการ'], '6');
  assert.equal(found['ส่งใบเสนอราคาแล้ว'], '1');
  assert.equal(found['ชำระแล้ว'], '6');
  assert.equal(found['ยกเลิก'], '0', 'a zeroed status must still be stated');
});

test('CONTROL: a different fixture moves the numbers', () => {
  const html = panel([{ status: 'cancelled' }, { status: 'cancelled' }]);
  const found = Object.fromEntries(
    [...html.matchAll(/>([^<>]+)<\/span><span[^>]*>(\d+)<\/span>/g)].map((m) => [m[1], m[2]]),
  );
  assert.equal(found['ยกเลิก'], '2');
  assert.equal(found['รอดำเนินการ'], '0');
});

test('a round with NO registrations renders the empty sentence', () => {
  /*
   * Not four zeros. A round nobody booked and a join that silently matched
   * nothing produce identical breakdowns, and only a sentence separates them.
   */
  const html = panel([]);
  assert.ok(has(html, 'ไม่มีผู้ลงทะเบียนในรอบนี้'), 'no empty-state sentence');
  assert.ok(
    html.includes('ไม่พบใบสมัครแบบสาธารณะที่ผูกกับรอบอบรมนี้'),
    'the empty state does not say WHICH population it searched',
  );
});

test('the empty state replaces the breakdown rather than sitting above it', () => {
  const html = panel([]);
  assert.ok(!has(html, 'ทั้งหมด'), 'a total row was drawn beside the empty state');
  assert.ok(!has(html, 'รอดำเนินการ'), 'a row of zeros was drawn beside the empty state');
});

test('CONTROL: one registration is enough to replace the empty state', () => {
  // Pins the boundary from the other side: the sentence is for zero and only
  // zero, so a panel stuck on the empty branch cannot pass both this and the
  // test above.
  const html = panel([{ status: 'pending' }]);
  assert.ok(!has(html, 'ไม่มีผู้ลงทะเบียนในรอบนี้'));
  assert.ok(has(html, 'ทั้งหมด'));
  assert.ok(has(html, 'รอดำเนินการ'));
});

test('an unrecognised stored status is shown verbatim, after the known ones', () => {
  const html = panel([{ status: 'pending' }, { status: 'archived' }]);
  assert.ok(has(html, 'archived'), 'an unknown status was dropped from the panel');
  assert.ok(
    html.indexOf('>ยกเลิก<') < html.indexOf('>archived<'),
    'an unrecognised value must sit AFTER the vocabulary, never inside it',
  );
});

test('a missing status is named rather than rendered as a blank chip', () => {
  const html = panel([{}, {}]);
  assert.ok(has(html, 'ไม่ระบุสถานะ'), 'a status-less row rendered as an empty chip');
});
