/**
 * Thai labels for a stored Bangkok day ('YYYY-MM-DD') — the admin charts' x
 * axis and tooltip. Built on the site's formatter (lib/promotions/
 * promotionDateLabel → formatThaiDate: "7 ต.ค. 2569", Buddhist year), so the
 * day/month/year spelling is the one the rest of the site uses.
 *
 * Noon Bangkok is passed so the instant can never fall on a neighbouring day.
 */
import { formatThaiDate } from '@/lib/promotions/promotionDateLabel';

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** "7 ต.ค. 2569" — or null for a missing/invalid day. */
export function thaiDay(day) {
  return day ? formatThaiDate(`${day}T12:00:00+07:00`) : null;
}

/** "อ. 7 ต.ค. 2569" — weekday + day + month + year, for a tooltip's first line. */
export function thaiDayWithWeekday(day) {
  const base = thaiDay(day);
  if (!base) return null;
  return `${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]} ${base}`;
}

/** "7 ต.ค." — day + month only, for an x-axis tick. */
export function thaiDayTick(day) {
  const base = thaiDay(day);
  return base ? base.replace(/ \d{4}$/, '') : '';
}
