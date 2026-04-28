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

export function formatStatusFromAPI(apiStatus) {
  return (
    { open: "open", nearly_full: "nearFull", full: "full" }[apiStatus] ?? "open"
  );
}
