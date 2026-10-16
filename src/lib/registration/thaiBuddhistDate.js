/**
 * A Gregorian `YYYY-MM-DD` day key shown the Thai way — `DD/MM/YYYY` in the
 * Buddhist year — and the calendar words a Thai date picker needs. Pure; no
 * locale APIs, so the browser's own locale can never change what is printed
 * (an en-US `<input type="date">` showed "06/09/2026", month first).
 *
 * Only DISPLAY is Buddhist-year. Every value stored or submitted stays the
 * Gregorian `YYYY-MM-DD` key.
 */

export const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** Sunday first, matching `weekStartsOn: 0`. */
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const BUDDHIST_OFFSET = 543;
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `2026-06-09` → `09/06/2569`; `''` for an empty or malformed key. */
export function formatBuddhistDayKey(key) {
  const m = KEY.exec(String(key ?? ''));
  if (!m) return '';
  return `${m[3]}/${m[2]}/${Number(m[1]) + BUDDHIST_OFFSET}`;
}

/** A day key as a LOCAL-midnight Date (what a calendar grid compares); `undefined` when malformed. */
export function dayKeyToDate(key) {
  const m = KEY.exec(String(key ?? ''));
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** A calendar Date back to its LOCAL day key — never `toISOString`, which shifts east of UTC. */
export function dateToDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** A calendar header: `มิถุนายน 2569`. */
export function thaiMonthCaption(date) {
  return `${THAI_MONTHS_FULL[date.getMonth()]} ${date.getFullYear() + BUDDHIST_OFFSET}`;
}

/** A day's spoken name for a screen reader: `9 มิถุนายน 2569`. */
export function thaiDayLabel(date) {
  return `${date.getDate()} ${thaiMonthCaption(date)}`;
}
