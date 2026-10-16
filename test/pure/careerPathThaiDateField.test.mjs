import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THAI_WEEKDAYS_SHORT,
  dateToDayKey,
  dayKeyToDate,
  formatBuddhistDayKey,
  thaiMonthCaption,
} from '@/lib/registration/thaiBuddhistDate';

/**
 * THE MANUAL TRANSFER ROUND'S DATE FIELDS show `DD/MM/YYYY` in the Buddhist
 * year whatever the browser's locale, while the value they hold and hand back
 * stays a Gregorian `YYYY-MM-DD` key.
 */

test('a day key prints as DD/MM/พ.ศ.', () => {
  assert.equal(formatBuddhistDayKey('2026-06-09'), '09/06/2569');
  assert.equal(formatBuddhistDayKey('2025-12-31'), '31/12/2568');
});

test('empty or malformed prints nothing', () => {
  assert.equal(formatBuddhistDayKey(''), '');
  assert.equal(formatBuddhistDayKey(undefined), '');
  assert.equal(formatBuddhistDayKey('09/06/2026'), '');
});

test('a key round-trips through the calendar Date unchanged, at month and year ends', () => {
  for (const key of ['2026-06-09', '2025-12-31', '2026-01-01', '2028-02-29']) {
    assert.equal(dateToDayKey(dayKeyToDate(key)), key);
  }
  assert.equal(dayKeyToDate(''), undefined);
  assert.equal(dateToDayKey(undefined), '');
});

test('calendar words are Thai with the Buddhist year, Sunday first', () => {
  assert.equal(thaiMonthCaption(dayKeyToDate('2026-06-09')), 'มิถุนายน 2569');
  assert.deepEqual(THAI_WEEKDAYS_SHORT, ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']);
  // 2026-06-07 is a Sunday.
  assert.equal(THAI_WEEKDAYS_SHORT[dayKeyToDate('2026-06-07').getDay()], 'อา');
});
