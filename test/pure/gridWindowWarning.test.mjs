import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyAgainstWindow,
  formatDayTh,
  warningTextTh,
} from '@/lib/schedule/gridWindowWarning';
import {
  ADMIN_SCHEDULE_MONTHS,
  adminScheduleMonthCols,
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

// ── it is measured against the REAL grid window ────────────────────────────

test('against the real grid columns, the incident dates classify as they did live', () => {
  const cols = adminScheduleMonthCols(new Date(2026, 7, 27));
  const firstDay = `${cols[0].key}-01`;
  const last = cols.at(-1);
  const lastDay = new Date(last.year, last.month + 1, 0);
  const iso = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  const damaged = classifyAgainstWindow(
    ['2025-09-23', '2026-10-30', '2026-11-02'],
    { firstDay, lastDay: iso },
  );
  assert.equal(damaged.disappears, true, 'this is the round that actually vanished');

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
