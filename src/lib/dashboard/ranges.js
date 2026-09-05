/**
 * The range control's WINDOW, its BUCKET SIZE, and the period before it.
 *
 * ══ THE CONTRADICTION THIS FILE EXISTS TO END ═══════════════════════════════
 *
 * Before round E3 the header said ทั้งหมด while the chart underneath said
 * "แนวโน้มการลงทะเบียน (7 วัน)" and drew seven bars — a fixed seven-day window
 * that ignored the control entirely. One screen making two contradictory claims
 * about what it was showing, and the seven bars were empty besides, because the
 * newest registration is older than seven days.
 *
 * So the window, the bucket size and the chart's own title all come from here,
 * and a test asserts the title states the window that was actually drawn.
 *
 * ── NO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────
 * Same constraint as lib/registrations/statuses.js and lib/dashboard/scopeKeys.js.
 * The pure tier loads this with nothing stubbed, and nothing here may reach for
 * a model, a session or next/*.
 */

export const RANGE_VALUES = Object.freeze(['today', 'week', 'month', 'all']);

/**
 * ══ THE BUCKET RULE ═════════════════════════════════════════════════════════
 *
 *   วันนี้     → HOUR    24 bars across one day
 *   7 วัน      → DAY      7 bars
 *   เดือนนี้   → DAY     28–31 bars
 *   ทั้งหมด    → MONTH   one bar per calendar month the data spans
 *
 * ── WHY ทั้งหมด IS NOT DAILY ────────────────────────────────────────────────
 * Because daily buckets over the whole corpus draw a flat line with two spikes,
 * which is not a trend — it is noise with a chart around it. Production data
 * currently spans 2026-04-23 to 2026-08-31: 131 daily bars for 41 public
 * registrations, i.e. ~0.3 registrations per bar, and 90-odd of those bars are
 * zero. Monthly gives five bars that actually say something.
 *
 * MONTH rather than WEEK — the brief allowed either. Monthly scales: this corpus
 * spans five months today and will span years, where weekly would grow without
 * bound and monthly grows twelve times more slowly. Weekly also has to pick a
 * week-start convention, which is a second decision with no obviously right
 * answer and no reader who cares.
 *
 * ── WHY วันนี้ IS HOURLY ────────────────────────────────────────────────────
 * A daily bucket over วันนี้ is ONE bar. A single bar is not a trend either, and
 * widening the window to make it look like one would put back the exact defect
 * this file removes — a chart drawing a period the header does not name.
 */
export const BUCKET_BY_RANGE = Object.freeze({
  today: 'hour',
  week:  'day',
  month: 'day',
  all:   'month',
});

/** 'hour' | 'day' | 'month'. Unknown ranges fall back to the ทั้งหมด rule. */
export function bucketForRange(range) {
  return BUCKET_BY_RANGE[range] ?? BUCKET_BY_RANGE.all;
}

/**
 * The `$dateToString` format for a bucket, and the timezone every bucket key is
 * built in.
 *
 * ── ONE TIMEZONE, NAMED ONCE ────────────────────────────────────────────────
 * Bangkok. The pre-E3 trend aggregate already grouped with `timezone: '+07:00'`
 * — correctly — but then enumerated the seven days it needed to fill with
 * `new Date().toISOString().slice(0, 10)`, i.e. in UTC. On a server running UTC
 * (Vercel) those two disagree for the first seven hours of every Bangkok day:
 * the aggregate emits `2026-09-05` while the enumerator is still producing
 * `2026-09-04`, so the newest bucket has no slot to land in and its count is
 * silently dropped from the chart. Both halves read BUCKET_TZ now.
 */
export const BUCKET_TZ = '+07:00';
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

const BUCKET_FORMAT = Object.freeze({
  hour:  '%Y-%m-%dT%H',
  day:   '%Y-%m-%d',
  month: '%Y-%m',
});

/** The Mongo `$dateToString` format string for a bucket size. */
export function bucketFormat(bucket) {
  return BUCKET_FORMAT[bucket] ?? BUCKET_FORMAT.day;
}

/**
 * A Date rendered as its bucket key IN BANGKOK — the JS half of the pair whose
 * two halves used to disagree (see BUCKET_TZ above).
 *
 * Shifting the epoch and then reading UTC getters is the whole trick: it gives
 * Bangkok's calendar fields without a timezone library and without depending on
 * the server's own zone, which is UTC on Vercel and +07:00 on the developer
 * machine — a difference that would otherwise make this correct in exactly one
 * of the two places.
 */
export function bucketKey(date, bucket) {
  const d = new Date(new Date(date).getTime() + TZ_OFFSET_MS);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  if (bucket === 'month') return `${y}-${mo}`;
  if (bucket === 'hour') return `${y}-${mo}-${da}T${h}`;
  return `${y}-${mo}-${da}`;
}

/**
 * Compute the [start, end] Date range from a range key.
 *
 * MOVED HERE FROM buildMetrics.js UNCHANGED, and re-exported from there so no
 * importer moves. The 'all' arm returning `from: null` is what makes the count
 * filter an empty object, and an empty object is what makes the ทั้งหมด counts
 * unbounded — behaviour round E1 measured and neither E2 nor E3 touches.
 *
 * @param {'today'|'week'|'month'|'all'} range
 * @returns {{ from: Date|null, to: Date }}
 */
export function dateRange(range) {
  // DELEGATES rather than repeating the arithmetic. Two copies of a date
  // boundary is how the chart and the counts end up disagreeing about what
  // "เดือนนี้" means, which is the same class of defect as the seven-day title.
  return dateRangeAt(range, new Date());
}

/**
 * ══ THE PERIOD BEFORE — EQUAL SPAN, IMMEDIATELY PRECEDING ═══════════════════
 *
 * `null` for ทั้งหมด, and that is the point rather than an edge case: there is
 * no period before everything. A card that renders 0% there is asserting a
 * measurement nobody made, and "—" is worse still because a dash reads as a
 * value that happened to be small. The percentage is OMITTED at ทั้งหมด, the
 * same way round E2 omits an unauthorised figure rather than nulling it.
 *
 * ── EQUAL SPAN, NOT THE PREVIOUS CALENDAR MONTH ─────────────────────────────
 * เดือนนี้ on the 5th is five days of data. Comparing that against a full
 * previous month compares five days against thirty-one and prints a catastrophic
 * decline every month, resetting on the 1st — a number that is wrong in a way
 * that looks like news. Equal span compares five days against the five days
 * before them, which is the comparison a reader means by "ช่วงก่อนหน้า".
 *
 * The cost, stated: for เดือนนี้ the comparison window straddles the month
 * boundary, so the UI renders the actual dates rather than the word "เดือน".
 */
export function previousWindow(range, now = new Date()) {
  if (range === 'all') return null;
  const { from, to } = dateRangeAt(range, now);
  if (!from) return null;
  const span = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - 1 - span);
  return { from: prevFrom, to: prevTo };
}

/**
 * `dateRange` with an injectable clock.
 *
 * `dateRange()` reads `new Date()` internally, which is right for production and
 * useless for a test that has to assert what the previous window is. This is the
 * same arithmetic with `now` passed in; `dateRange` delegates to it so there is
 * one implementation rather than two that drift.
 */
export function dateRangeAt(range, now = new Date()) {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (range === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (range === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (range === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to };
  }
  return { from: null, to };
}

/**
 * Every bucket key between two instants, inclusive, in order — so a day with no
 * registrations draws a zero bar rather than closing the gap and making the
 * series look denser than it is.
 *
 * `fallbackFrom` is used when `from` is null (ทั้งหมด): the caller passes the
 * oldest record's date, which the same aggregation returns. With no data at all
 * the answer is an empty array, and the chart's own empty state takes over.
 */
export function enumerateBuckets(from, to, bucket) {
  if (!from || !to) return [];
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return [];

  const keys = [];
  const seen = new Set();
  // Step by the bucket's own size. Months are stepped on the Bangkok calendar
  // rather than by adding 30 days, which would drift a day every other month.
  if (bucket === 'month') {
    const s = new Date(start + TZ_OFFSET_MS);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    for (let guard = 0; guard < 1200; guard += 1) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      if (!seen.has(key)) { seen.add(key); keys.push(key); }
      const cursor = Date.UTC(y, m, 1) - TZ_OFFSET_MS;
      if (cursor > end) break;
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      if (Date.UTC(y, m, 1) - TZ_OFFSET_MS > end) break;
    }
    return keys;
  }

  const step = bucket === 'hour' ? 3600e3 : 864e5;
  // A generous guard rather than an exact count: the loop is bounded by `end`,
  // and this only stops a malformed pair from spinning forever.
  const limit = bucket === 'hour' ? 24 * 40 : 366 * 20;
  for (let t = start, guard = 0; t <= end && guard < limit; t += step, guard += 1) {
    const key = bucketKey(new Date(t), bucket);
    if (!seen.has(key)) { seen.add(key); keys.push(key); }
  }
  // The end instant's own bucket, in case the step overshot it.
  const endKey = bucketKey(new Date(end), bucket);
  if (!seen.has(endKey)) keys.push(endKey);
  return keys;
}

/**
 * What the chart should SAY it drew.
 *
 * Returned as data rather than a formatted string so the client owns the copy,
 * but the WINDOW it names comes from here — a title written independently of
 * the query is exactly how the seven-day lie survived.
 */
export const RANGE_WINDOW_LABEL = Object.freeze({
  today: 'วันนี้ — รายชั่วโมง',
  week:  '7 วัน — รายวัน',
  month: 'เดือนนี้ — รายวัน',
  all:   'ทั้งหมด — รายเดือน',
});

/** The label for the window actually drawn. Unknown ranges get ทั้งหมด's. */
export function windowLabel(range) {
  return RANGE_WINDOW_LABEL[range] ?? RANGE_WINDOW_LABEL.all;
}
