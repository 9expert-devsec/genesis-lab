import { normalizeScheduleStatus } from '@/lib/scheduleStatus';

/**
 * แปลง schedule object จาก API → dateLabel string สำหรับ <ScheduleCard />
 *
 * Input shape (verified against /schedules adapter):
 *   { dates: string[], type: "classroom"|"hybrid", status: "open"|"nearly_full"|"full" }
 *
 * Output: string ใช้ "\n" คั่นระหว่างบรรทัด เช่น
 *   "17\nOCT"           — วันเดียว
 *   "17-18\nOCT"        — วันต่อเนื่อง เดือนเดียว
 *   "17 & 19\nOCT"      — วันไม่ต่อเนื่อง เดือนเดียว
 *   "30 APR\n- 2 MAY"   — ข้ามเดือน
 */

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

export function formatScheduleDate(schedule) {
  const dates = schedule?.dates;
  if (!Array.isArray(dates) || dates.length === 0) return "TBD\n-";

  const sorted = dates
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);

  if (sorted.length === 0) return "TBD\n-";

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const startDay = first.getDate();
  const startMonth = MONTHS[first.getMonth()];
  const endDay = last.getDate();
  const endMonth = MONTHS[last.getMonth()];

  if (sorted.length === 1) {
    return `${startDay}\n${startMonth}`;
  }

  if (startMonth === endMonth) {
    const isConsecutive = endDay - startDay === sorted.length - 1;
    const separator = isConsecutive ? "-" : "&";
    return `${startDay}${separator === "-" ? "-" : " & "}${endDay}\n${startMonth}`;
  }

  return `${startDay} ${startMonth}\n- ${endDay} ${endMonth}`;
}

/**
 * Canonicalise an upstream status for <ScheduleCard />.
 *
 * This used to keep its own table — `{open, nearly_full→nearFull, full}` with
 * `?? "open"` — which made it a SECOND fallback policy sitting upstream of the
 * shared one. Two problems, both silent: it did not know `closed`, and its
 * default laundered every unrecognised value into green "open" before
 * lib/scheduleStatus was ever consulted. There is now one policy: delegate,
 * and pass anything unrecognised through UNCHANGED so the renderer can show it
 * neutrally instead of guessing.
 *
 * Kept as a named export because <ScheduleCard /> is fed through it from
 * CourseCard; it is now a thin alias of normalizeScheduleStatus.
 */
export function formatStatusFromAPI(apiStatus) {
  return normalizeScheduleStatus(apiStatus) ?? apiStatus;
}
