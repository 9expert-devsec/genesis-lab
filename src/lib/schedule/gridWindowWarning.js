/**
 * "Will this round actually show up in the admin table?" — classified, and
 * worded, in one place.
 *
 * ── WHY THIS IS A SEPARATE QUESTION FROM THE PICKER'S RANGE ─────────────────
 * src/lib/schedule/editorCalendarRange.js answers WHAT MAY BE PICKED and is
 * deliberately free of any grid vocabulary: a round outside the table's reach
 * must still be editable, which is the defect that module exists to remove.
 * This module answers the opposite question — WHAT THE TABLE WILL SHOW — and
 * the two must not be fused.
 *
 * It still names no grid identifier. The window is PASSED IN as two ISO dates,
 * so the caller (the modal) is the only thing that touches
 * `adminScheduleMonthCols()`, and this module stays unit-testable without the
 * horizon, the fetch, or a DOM.
 *
 * ── WHY BOTH DIRECTIONS, AND WHY THEY ARE NOT SYMMETRIC IN SEVERITY ─────────
 * The first version of this warning only looked PAST the last column. The
 * backward direction was never guarded, and it is the more damaging of the two:
 *
 *   · A date AFTER the last column is a waiting problem. The round is stored,
 *     it is simply not listed yet, and it appears on its own once its month
 *     rolls into the window.
 *   · A date BEFORE the first column is a TRAP, because the admin grid places a
 *     round by the month of its FIRST date (SchedulesAdminClient.jsx: the
 *     `monthKey(s.dates?.[0])` bucket). One stray past date moves the whole
 *     round into a month that has no column, so it vanishes from the table
 *     entirely — including the rows for the dates that ARE in range — and there
 *     is no way to open it for editing again, because the only way in is the
 *     table. It does not come back on its own; it gets further away.
 *
 * That happened, on 2026-08-27: a click on 2025-09-23 while editing a round
 * dated 30 Oct / 2 Nov 2026 removed it from the October column with no way back
 * short of a direct database write. Hence `disappears`, which is reported
 * separately and worded more strongly than a plain out-of-window date.
 *
 * WARN ONLY. Nothing here blocks a save or edits a date; the admin may have a
 * good reason, and silently "fixing" their input would be its own defect.
 */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const clean = (dates) =>
  (Array.isArray(dates) ? dates : [])
    .map((d) => String(d ?? '').slice(0, 10))
    .filter((d) => ISO_DAY.test(d))
    .sort();

/**
 * Split the selected dates against the table's visible window.
 *
 * @param {string[]} dates `YYYY-MM-DD`, any order
 * @param {object} window
 * @param {string} window.firstDay first day of the FIRST column (`YYYY-MM-DD`)
 * @param {string} window.lastDay  last day of the LAST column (`YYYY-MM-DD`)
 * @returns {{
 *   before: string[], after: string[], offending: string[],
 *   disappears: boolean, hasWarning: boolean,
 * }}
 *   `disappears` is true when the EARLIEST selected date is before the window —
 *   i.e. the round's placement date itself is out of range and the row is gone
 *   from the table, not merely incomplete.
 */
export function classifyAgainstWindow(dates, { firstDay, lastDay } = {}) {
  const all = clean(dates);
  const lo = ISO_DAY.test(String(firstDay ?? '')) ? String(firstDay) : null;
  const hi = ISO_DAY.test(String(lastDay ?? '')) ? String(lastDay) : null;

  // An unusable window must not manufacture a warning about every date.
  if (!lo || !hi) {
    return { before: [], after: [], offending: [], disappears: false, hasWarning: false };
  }

  const before = all.filter((d) => d < lo);
  const after = all.filter((d) => d > hi);
  const offending = [...before, ...after].sort();

  // The grid buckets on the FIRST date, so it is the earliest date — not merely
  // the presence of some out-of-range date — that decides whether the row
  // survives at all.
  const disappears = all.length > 0 && all[0] < lo;

  return { before, after, offending, disappears, hasWarning: offending.length > 0 };
}

/** `'2026-10-30'` → `'30 ต.ค. 2569'`. Buddhist era via `th-TH`, never `+ 543`. */
export function formatDayTh(iso) {
  if (!ISO_DAY.test(String(iso ?? ''))) return String(iso ?? '');
  return new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The Thai warning text for a classification.
 *
 * Returns `null` when there is nothing to warn about, so the caller can use the
 * return value itself as the condition rather than re-deriving it.
 *
 * The offending dates are LISTED rather than counted: "3 วันอยู่นอกช่วง" tells
 * an admin they made a mistake without telling them which click caused it, and
 * the click that caused the incident was a mis-aimed one the admin did not
 * remember making.
 *
 * @param {ReturnType<typeof classifyAgainstWindow>} c
 * @param {number} months how many months the table shows
 * @returns {{title: string, lines: string[], dates: string[], severe: boolean}|null}
 */
export function warningTextTh(c, months) {
  if (!c || !c.hasWarning) return null;

  const lines = [];
  const n = Number(months);
  const span = Number.isFinite(n) && n > 0 ? `${n} เดือน` : 'ช่วงเวลา';

  if (c.disappears) {
    lines.push(
      `รอบนี้จะหายไปจากตารางทั้งรอบ เพราะตารางจัดรอบตาม “วันแรก” ของรอบ ` +
        `และวันแรกที่เลือกไว้อยู่ก่อนช่วง ${span} ที่ตารางแสดง`
    );
    lines.push(
      'เมื่อหายไปแล้วจะไม่สามารถเปิดรอบนี้ขึ้นมาแก้ไขจากตารางได้อีก ' +
        'และจะไม่กลับมาเองเมื่อเวลาผ่านไป'
    );
  } else if (c.before.length > 0) {
    lines.push(
      `วันที่ด้านล่างอยู่ก่อนช่วง ${span} ที่ตารางแสดง จะไม่ปรากฏในตาราง`
    );
  }

  if (c.after.length > 0) {
    lines.push(
      `วันที่ด้านล่างอยู่หลังช่วง ${span} ที่ตารางแสดง ` +
        'รอบนี้จะยังไม่ปรากฏในตารางจนกว่าเดือนดังกล่าวจะเข้ามาอยู่ในช่วงที่แสดง'
    );
  }

  lines.push('รอบนี้จะถูกบันทึกตามที่เลือกไว้ทุกวัน ระบบไม่ได้แก้ไขวันที่ให้');

  return {
    title: c.disappears
      ? 'รอบนี้จะหายไปจากตารางอบรม'
      : 'รอบนี้จะไม่ปรากฏในตารางอบรม',
    lines,
    dates: c.offending.map(formatDayTh),
    severe: c.disappears,
  };
}
