/**
 * /admin/consent-stats — the date range and grouping, read from the URL.
 *
 * PURE: no DB, no request objects. The page reads `searchParams`, hands them
 * here with today's Bangkok date, and gets back everything it renders from:
 * the effective range, the grouping, an inline error, and the periods.
 *
 * ── URL SHAPE ───────────────────────────────────────────────────────────────
 *   ?range=7|30|90          preset; 30 is the default and is never written
 *   ?from=YYYY-MM-DD&to=…   custom range (both required; wins over `range`)
 *   ?group=week             weekly rows (weeks start Monday); daily is default
 *   ?host=…                 unchanged from before
 *
 * Every control on the page is a link or a GET form, so the URL is the only
 * state — nothing is copied into a component and written back.
 *
 * Dates are `YYYY-MM-DD` strings in Asia/Bangkok, the same form the counters
 * are stored under (ConsentDailyStat.date), so string order IS date order and
 * the DB query stays a string range.
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
export function parseConsentStatsRange(sp, today) {
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

/**
 * The page URL for a state, with defaults omitted so the bare URL stays bare.
 * `host` is omitted when it is the default host.
 */
export function consentStatsHref({ host, defaultHost, range, from, to, group }) {
  const p = new URLSearchParams();
  if (host && host !== defaultHost) p.set('host', host);
  if (from && to) {
    p.set('from', from);
    p.set('to', to);
  } else if (range && Number(range) !== DEFAULT_RANGE) {
    p.set('range', String(range));
  }
  if (group === 'week') p.set('group', 'week');
  const qs = p.toString();
  return qs ? `/admin/consent-stats?${qs}` : '/admin/consent-stats';
}

/**
 * Daily documents → periods, OLDEST FIRST, covering the whole range.
 *
 * Every day (or Monday-start week, clipped to the range) gets a period, data
 * or not, so the chart can show a GAP where nothing was recorded. `hasData` is
 * whether any stored day fell in it; `docs` are those days' documents, for the
 * caller to sum with sumCounters.
 *
 * @returns {Array<{ key: string, from: string, to: string, label: string,
 *                   hasData: boolean, docs: object[] }>}
 */
export function bucketConsentDays(docs, { from, to, group }) {
  const byDate = new Map();
  for (const d of docs ?? []) {
    if (d?.date >= from && d?.date <= to) byDate.set(d.date, d);
  }

  const periods = [];
  let cursor = from;
  while (cursor <= to) {
    const start = cursor;
    const end =
      group === 'week'
        ? (() => {
            const sunday = addDays(weekStart(cursor), 6);
            return sunday < to ? sunday : to;
          })()
        : cursor;
    const inPeriod = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (byDate.has(d)) inPeriod.push(byDate.get(d));
    }
    periods.push({
      key: start,
      from: start,
      to: end,
      label: start === end ? start : `${start} – ${end}`,
      hasData: inPeriod.length > 0,
      docs: inPeriod,
    });
    cursor = addDays(end, 1);
  }
  return periods;
}
