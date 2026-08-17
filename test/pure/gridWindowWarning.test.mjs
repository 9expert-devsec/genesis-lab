import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyAgainstWindow,
  formatDayTh,
  warningTextTh,
} from '@/lib/schedule/gridWindowWarning';
import {
  ADMIN_SCHEDULE_MONTHS,
  ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL,
  adminScheduleMonthCols,
  adminScheduleSelectableWindowDays,
} from '@/lib/adminScheduleHorizon';

// The first version of this warning looked only PAST the last column. The
// backward direction was unguarded, and on 2026-08-27 a stray click on
// 2025-09-23 while editing a round dated 30 Oct / 2 Nov 2026 removed that round
// from the admin table entirely — the grid buckets on the round's FIRST date,
// so one past date moved the whole row into a month with no column. It could
// not be reopened, because the table is the only way in.
//
// So the asymmetry under test is not cosmetic: after-the-window is a waiting
// problem, before-the-window is a disappearance.

const WINDOW = { firstDay: '2026-08-01', lastDay: '2027-07-31' };

// ── both directions fire ───────────────────────────────────────────────────

test('a date BEFORE the first column fires the warning', () => {
  const c = classifyAgainstWindow(['2025-09-23', '2026-10-30'], WINDOW);
  assert.equal(c.hasWarning, true);
  assert.deepEqual(c.before, ['2025-09-23']);
  assert.deepEqual(c.after, []);
});

test('a date AFTER the last column fires the warning', () => {
  const c = classifyAgainstWindow(['2026-10-30', '2027-09-01'], WINDOW);
  assert.equal(c.hasWarning, true);
  assert.deepEqual(c.after, ['2027-09-01']);
  assert.deepEqual(c.before, []);
});

test('a date INSIDE the window does not fire the warning', () => {
  const c = classifyAgainstWindow(['2026-10-30', '2026-11-02'], WINDOW);
  assert.equal(c.hasWarning, false);
  assert.deepEqual(c.offending, []);
  assert.equal(c.disappears, false);
  assert.equal(warningTextTh(c, 12), null, 'no warning object at all');
});

test('the window boundaries themselves are INSIDE, not outside', () => {
  const c = classifyAgainstWindow([WINDOW.firstDay, WINDOW.lastDay], WINDOW);
  assert.equal(c.hasWarning, false, 'the first and last days must be inclusive');
});

test('one day outside either edge is enough', () => {
  assert.equal(classifyAgainstWindow(['2026-07-31'], WINDOW).hasWarning, true);
  assert.equal(classifyAgainstWindow(['2027-08-01'], WINDOW).hasWarning, true);
});

// ── the disappearing case, reported separately ─────────────────────────────

test('the EARLIEST date being before the window is reported as the disappearing case', () => {
  const c = classifyAgainstWindow(['2025-09-23', '2026-10-30', '2026-11-02'], WINDOW);
  assert.equal(c.disappears, true, 'the round vanishes from the table entirely');

  const w = warningTextTh(c, ADMIN_SCHEDULE_MONTHS);
  assert.equal(w.severe, true);
  assert.match(w.title, /หายไปจากตาราง/, 'the title must say it disappears');
  assert.ok(
    w.lines.some((l) => /วันแรก/.test(l)),
    'the text must explain that placement uses the round\'s FIRST date',
  );
  assert.ok(
    w.lines.some((l) => /ไม่สามารถเปิดรอบนี้ขึ้นมาแก้ไขจากตารางได้อีก/.test(l)),
    'the text must say the round can no longer be opened for editing from the table',
  );
});

test('a LATE date alone is NOT the disappearing case — the row still renders', () => {
  const c = classifyAgainstWindow(['2026-10-30', '2027-09-01'], WINDOW);
  assert.equal(c.disappears, false, 'placement is by the first date, which is in range');

  const w = warningTextTh(c, ADMIN_SCHEDULE_MONTHS);
  assert.equal(w.severe, false);
  assert.doesNotMatch(w.title, /หายไป/, 'a late date must not be worded as a disappearance');
  assert.ok(
    w.lines.some((l) => /จนกว่าเดือนดังกล่าวจะเข้ามาอยู่ในช่วงที่แสดง/.test(l)),
    'the late case is a waiting problem and must be worded as one',
  );
});

test('CONTROL: the two directions are worded differently, or the asymmetry is lost', () => {
  const early = warningTextTh(classifyAgainstWindow(['2025-09-23'], WINDOW), 12);
  const late = warningTextTh(classifyAgainstWindow(['2027-09-01'], WINDOW), 12);
  assert.notEqual(early.title, late.title);
  assert.notEqual(early.severe, late.severe);
});

test('a past date that is NOT the earliest still warns, but does not disappear', () => {
  // Contrived but reachable: the stray click lands between two stored dates.
  const c = classifyAgainstWindow(['2026-09-01', '2027-12-25'], WINDOW);
  assert.equal(c.hasWarning, true);
  assert.equal(c.disappears, false);
});

// ── the message lists the dates ────────────────────────────────────────────

test('the warning LISTS the offending dates rather than counting them', () => {
  const c = classifyAgainstWindow(['2025-09-23', '2026-10-30', '2027-09-01'], WINDOW);
  const w = warningTextTh(c, 12);
  assert.equal(w.dates.length, 2, 'both offenders, and only the offenders');
  assert.deepEqual(w.dates, [formatDayTh('2025-09-23'), formatDayTh('2027-09-01')]);
  assert.ok(!w.dates.some((d) => d.includes('2026')), 'the in-range date is not listed');
});

test('dates are rendered in Thai with the Buddhist era, never by adding 543', () => {
  const label = formatDayTh('2026-10-30');
  assert.match(label, /2569/, '2026 CE is 2569 BE');
  assert.ok(!label.includes('2026'), 'the Gregorian year must not leak through');
});

test('the warning always states that nothing was altered', () => {
  for (const dates of [['2025-09-23'], ['2027-09-01'], ['2025-01-01', '2028-01-01']]) {
    const w = warningTextTh(classifyAgainstWindow(dates, WINDOW), 12);
    assert.ok(
      w.lines.some((l) => /ระบบไม่ได้แก้ไขวันที่ให้/.test(l)),
      `warn-only must be stated for ${JSON.stringify(dates)}`,
    );
  }
});

// ── re-based on the MAXIMUM SELECTABLE range, not the current view ─────────
//
// The admin table's from/to month range became user-adjustable in the round
// that added this section. Before that, "the table's window" and "the
// table's reach" were the same fixed 12 months, so classifying against the
// rendered columns and against the outer selectable boundary gave the same
// answer — which is what the ORIGINAL version of this test (classifying
// against `adminScheduleMonthCols()`) exercised. Once the dropdowns can move,
// the two stop agreeing: a date outside TODAY'S chosen months but inside the
// SELECTABLE range is not a problem, because the admin can just widen the
// dropdowns and see it. Only a date outside the selectable range's outer edge
// is genuinely unreachable. `SchedulesAdminClient.jsx`'s `gridWindowDays()`
// was re-pointed at `adminScheduleSelectableWindowDays()` for exactly this
// reason, and this file now measures against the same function it calls.

test('a date outside the CURRENT VIEW but inside the selectable range does not warn', () => {
  // 2025-09-23 is the incident's own stray date — 11 months before
  // 2026-08-27, i.e. inside a 12-month-back selectable range even though it
  // is well before any month a default or narrow current view would show.
  const now = new Date(2026, 7, 27); // 2026-08-27
  const window = adminScheduleSelectableWindowDays(now);

  const c = classifyAgainstWindow(['2025-09-23', '2026-10-30', '2026-11-02'], window);
  assert.equal(
    c.hasWarning, false,
    'a date the admin can still reach by widening the from/to dropdowns must not warn',
  );
  assert.equal(c.disappears, false);
});

test('a date OUTSIDE the selectable range still warns and still disappears', () => {
  // 12 months back is the selectable floor at this `now` (2025-08); a date a
  // further month back (2025-07) is outside it no matter how the admin sets
  // the dropdowns — genuinely unreachable, and the disappearing case still
  // applies because it is the EARLIEST date.
  const now = new Date(2026, 7, 27); // 2026-08-27
  const window = adminScheduleSelectableWindowDays(now);
  assert.equal(window.firstDay, '2025-08-01', 'sanity: the selectable floor for this `now`');

  const c = classifyAgainstWindow(['2025-07-15', '2026-10-30'], window);
  assert.equal(c.hasWarning, true);
  assert.equal(c.disappears, true, 'still unreachable by any dropdown selection — still severe');

  const w = warningTextTh(c, ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL);
  assert.equal(w.severe, true);
});

test('a date past the selectable FORWARD edge still warns as the non-severe, waiting case', () => {
  const now = new Date(2026, 7, 27); // 2026-08-27
  const window = adminScheduleSelectableWindowDays(now);
  assert.equal(window.lastDay, '2028-08-31', 'sanity: the selectable ceiling for this `now`');

  const c = classifyAgainstWindow(['2026-10-30', '2028-09-01'], window);
  assert.equal(c.hasWarning, true);
  assert.equal(c.disappears, false, 'placement is by the first date, which is in range');
});

test('against the real grid columns, the CURRENT VIEW alone would have missed the incident', () => {
  // CONTROL for the re-basing itself: if `gridWindowDays()` still classified
  // against the currently rendered columns (the pre-fix shape), the incident
  // dates would still register as a warning today — proving the two windows
  // are genuinely different rather than the fix being a no-op.
  const cols = adminScheduleMonthCols(new Date(2026, 7, 27));
  const firstDay = `${cols[0].key}-01`;
  const last = cols.at(-1);
  const lastDay = new Date(last.year, last.month + 1, 0);
  const iso = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  const damaged = classifyAgainstWindow(
    ['2025-09-23', '2026-10-30', '2026-11-02'],
    { firstDay, lastDay: iso },
  );
  assert.equal(damaged.disappears, true, 'against the narrow current view this still disappears');

  const repaired = classifyAgainstWindow(['2026-10-30', '2026-11-02'], { firstDay, lastDay: iso });
  assert.equal(repaired.hasWarning, false, 'and the repaired round is clean');
});

// ── degenerate input must not manufacture warnings ─────────────────────────

test('an unusable window warns about nothing rather than about everything', () => {
  for (const bad of [{}, { firstDay: null, lastDay: null }, { firstDay: 'x', lastDay: 'y' }]) {
    const c = classifyAgainstWindow(['2025-09-23', '2030-01-01'], bad);
    assert.equal(c.hasWarning, false, `window ${JSON.stringify(bad)} must not fire`);
    assert.equal(c.disappears, false);
  }
});

test('junk dates are ignored, not warned about', () => {
  const c = classifyAgainstWindow(['', null, 'nope', '2026-10-30'], WINDOW);
  assert.equal(c.hasWarning, false);
  assert.deepEqual(c.offending, []);
});

test('MSDB timestamps classify by their date part', () => {
  const c = classifyAgainstWindow(['2025-09-23T00:00:00.000Z'], WINDOW);
  assert.deepEqual(c.before, ['2025-09-23']);
  assert.equal(c.disappears, true);
});

test('an empty selection is not a disappearance', () => {
  const c = classifyAgainstWindow([], WINDOW);
  assert.equal(c.hasWarning, false);
  assert.equal(c.disappears, false);
});

test('CONTROL: the old one-sided rule would have MISSED the incident', () => {
  // The shipped check was `dates.filter(d => d > lastDay)` and nothing else.
  const dates = ['2025-09-23', '2026-10-30', '2026-11-02'];
  const oneSided = dates.filter((d) => d > WINDOW.lastDay);
  assert.equal(oneSided.length, 0, 'the old rule saw nothing wrong — that is why this exists');
  assert.equal(classifyAgainstWindow(dates, WINDOW).hasWarning, true, 'the new rule catches it');
});
