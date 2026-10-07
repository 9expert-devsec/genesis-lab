/**
 * Admin date range (and day/week grouping), read from the URL — shared by
 * /admin/consent-stats and /admin/article-views.
 *
 * PURE: no DB, no request objects. A page reads `searchParams`, hands them
 * here with today's Bangkok date, and gets back the effective range.
 *
 * ── URL SHAPE ───────────────────────────────────────────────────────────────
 *   ?range=7|30|90          preset; 30 is the default and is never written
 *   ?from=YYYY-MM-DD&to=…   custom range (both required; wins over `range`)
 *   ?group=week             weekly grouping (weeks start Monday); daily default
 *
 * Every control is a link or a GET form, so the URL is the only state —
 * nothing is copied into a component and written back.
 *
 * Dates are `YYYY-MM-DD` strings in Asia/Bangkok — the form both counter
 * collections store — so string order IS date order and a DB query stays a
 * string range.
 */

export const RANGE_PRESETS = Object.freeze([7, 30, 90]);
export const DEFAULT_RANGE = 30;
export const MAX_RANGE_DAYS = 365;
export const GROUPS = Object.freeze(['day', 'week']);

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD` form, or null. */
export function parseIsoDate(value) {
  const s = String(value ?? '').trim();
  if (!DATE_RE.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(ms)) return null;
  // Date.parse rolls 2026-02-31 over to March — reject instead.
  return new Date(ms).toISOString().slice(0, 10) === s ? s : null;
}

/** `date` moved by `days` (may be negative). */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive day count from `from` to `to`. */
export function daySpan(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The Monday on or before `date`. */
export function weekStart(date) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

/**
 * The effective range and grouping for a request.
 *
 * An unusable custom range never errors the page: it falls back to the default
 * preset and says why in `error`, shown inline above the form.
 *   - from > to                  → rejected
 *   - span > 365 days            → capped: `from` moved to 365 days before `to`,
 *                                  with a notice (`error`) saying so
 *   - `to` after today           → clamped to today (there is no data yet)
 *
 * @returns {{ mode: 'preset'|'custom', days: number, from: string, to: string,
 *             group: 'day'|'week', error: string|null,
 *             input: { from: string, to: string } }}
 */
export function parseDateRange(sp, today) {
  const group = first(sp?.group) === 'week' ? 'week' : 'day';
  const rawFrom = String(first(sp?.from) ?? '').trim();
  const rawTo = String(first(sp?.to) ?? '').trim();
  const input = { from: rawFrom, to: rawTo };

  const preset = (days, error = null) => ({
    mode: 'preset',
    days,
    from: addDays(today, -(days - 1)),
    to: today,
    group,
    error,
    input,
  });

  if (rawFrom || rawTo) {
    const from = parseIsoDate(rawFrom);
    let to = parseIsoDate(rawTo);
    if (!from || !to) return preset(DEFAULT_RANGE, 'วันที่ไม่ถูกต้อง — ระบุทั้งวันเริ่มต้นและวันสิ้นสุด');
    if (from > to) return preset(DEFAULT_RANGE, 'วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด');
    if (to > today) to = today;
    if (from > to) return preset(DEFAULT_RANGE, 'วันเริ่มต้นอยู่หลังวันนี้ — ยังไม่มีข้อมูล');
    if (daySpan(from, to) > MAX_RANGE_DAYS) {
      const capped = addDays(to, -(MAX_RANGE_DAYS - 1));
      return {
        mode: 'custom',
        days: MAX_RANGE_DAYS,
        from: capped,
        to,
        group,
        error: `ช่วงยาวเกิน ${MAX_RANGE_DAYS} วัน — แสดง ${capped} ถึง ${to}`,
        input,
      };
    }
    return { mode: 'custom', days: daySpan(from, to), from, to, group, error: null, input };
  }

  const n = Number(first(sp?.range));
  return preset(RANGE_PRESETS.includes(n) ? n : DEFAULT_RANGE);
}

/** The subtitle's range label: "30 วันล่าสุด" or "ช่วงที่กำหนดเอง (N วัน)". */
export function rangeLabel(range) {
  return range.mode === 'custom' ? `ช่วงที่กำหนดเอง (${range.days} วัน)` : `${range.days} วันล่าสุด`;
}


/** Every `YYYY-MM-DD` from `from` to `to`, inclusive, oldest first. */
export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
