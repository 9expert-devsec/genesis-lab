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
 * ══ THE DEFAULT RANGE — ทั้งหมด ═════════════════════════════════════════════
 *
 * It was วันนี้, and that is why an admin opening /admin saw a page of zeros.
 * Round E1 measured the cause: the newest registration is weeks old, so วันนี้,
 * 7 วัน and เดือนนี้ all hold nothing. The page was working exactly as designed
 * and the first thing it told anyone was 0.
 *
 * ทั้งหมด is the only range guaranteed to contain data if any exists. A default
 * that is usually empty trains the reader to distrust the screen, and E3's
 * empty state — which now names the most recent record — is a repair for a
 * situation the default should not have been creating in the first place.
 *
 * ── DECLARED ONCE, HERE ─────────────────────────────────────────────────────
 * Three places need it: the page (normalising `?range=`), the server action (its
 * parameter default) and the client (which range button is lit, and which value
 * means "no query parameter"). A string repeated in three files is three places
 * to change it and two places to forget — and the failure would be silent, since
 * every one of them is a valid range on its own.
 *
 * `?range=today` still works and still means today. This changes what NO
 * parameter means, not what a parameter means.
 */
export const DEFAULT_RANGE = 'all';

/**
 * A `?range=` value from a URL, narrowed to something safe to compute with.
 *
 * Anything unrecognised — absent, misspelt, an array, an injected object —
 * becomes the default rather than reaching `dateRangeAt`. The page used to do
 * this with an inline `['today','week','month','all'].includes(...)`, i.e. a
 * fourth copy of RANGE_VALUES.
 */
export function normaliseRange(value) {
  return RANGE_VALUES.includes(value) ? value : DEFAULT_RANGE;
}

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

// ════════════════════════════════════════════════════════════════════════════
// THE CUSTOM RANGE (E4.4)
// ════════════════════════════════════════════════════════════════════════════

/**
 * ══ THE BUCKET RULE FOR AN ARBITRARY SPAN ═══════════════════════════════════
 *
 * The four presets each know their own bucket. A custom span does not, so the
 * bucket is DERIVED FROM THE SPAN — a couple of days is not a month's worth of
 * bars, and two years of daily bars is not a trend.
 *
 * ── HOW THE BANDS WERE DERIVED, NOT GUESSED ────────────────────────────────
 * The target is a bar count a card-width chart can actually draw: enough to show
 * a shape, few enough to stay legible. Roughly 3 at the low end and ~62 at the
 * high end. Each band's upper bound is the span at which its bucket reaches that
 * ceiling, and the next band's floor is chosen so it starts with at least three
 * bars rather than one.
 *
 *   span <= 2 days     -> HOUR    24-48 bars
 *   span <= 62 days    -> DAY      3-62 bars
 *   span >  62 days    -> MONTH    3+ bars (63 days spans at least three months)
 *
 * ── THERE IS A DISCONTINUITY AT 62 DAYS, AND IT IS INHERENT ────────────────
 * 62 days draws 62 daily bars; 63 draws three monthly ones. That jump is the
 * price of having three bucket sizes and no fourth. A WEEK bucket would smooth
 * it, and round E3 declined to add one for a reason that still holds: weekly has
 * to pick a week-start convention, which is a second decision with no obviously
 * right answer and no reader who cares. Stated rather than hidden.
 */
export const SPAN_BUCKET_BANDS = Object.freeze([
  { maxDays: 2,  bucket: 'hour' },
  { maxDays: 62, bucket: 'day' },
]);
export const SPAN_BUCKET_FALLBACK = 'month';

/** 'hour' | 'day' | 'month', from the span between two instants. */
export function bucketForSpan(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return SPAN_BUCKET_FALLBACK;
  const days = ms / 864e5;
  for (const band of SPAN_BUCKET_BANDS) {
    if (days <= band.maxDays) return band.bucket;
  }
  return SPAN_BUCKET_FALLBACK;
}

/**
 * A `YYYY-MM-DD` string as the instant Bangkok midnight begins.
 *
 * ── THE PARSE IS STRICT, AND THE INSTANT IS BANGKOK'S ──────────────────────
 * The strict regex plus the round-trip check is the pattern `parseDateInput` in
 * lib/registrations/listFilter.js already uses, borrowed deliberately: it
 * rejects `2026-02-31` (which `new Date` would roll into March), partials like
 * `2026-08`, and anything that is not exactly ten characters of the right shape.
 *
 * What is NOT borrowed is that function's `new Date(y, m, d)`, which builds the
 * instant in the SERVER's zone — UTC on Vercel. Round E3 found the chart
 * grouping at +07:00 while enumerating in UTC and silently dropping the newest
 * bucket; a picker whose dates were parsed in UTC would reintroduce exactly that
 * for the first seven hours of every Bangkok day. These are Bangkok dates
 * because the admin typing them is in Bangkok, and BUCKET_TZ is where that is
 * written down.
 *
 * @returns {Date|null} null for anything that is not a real calendar date
 */
export function parseBangkokDate(value) {
  const s = String(value ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const utcMidnight = Date.UTC(y, mo - 1, d);
  const probe = new Date(utcMidnight);
  // Round-trip, so 2026-02-31 is rejected rather than rolling into March.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return new Date(utcMidnight - TZ_OFFSET_MS);
}

/** The last instant of a Bangkok calendar day — `to` is INCLUSIVE. */
export function bangkokEndOfDay(value) {
  const start = parseBangkokDate(value);
  return start ? new Date(start.getTime() + 864e5 - 1) : null;
}

/** A span nobody means: ten years. Beyond this the input is treated as junk. */
export const MAX_CUSTOM_SPAN_DAYS = 3653;

/**
 * ══ THE VALIDATION RULE, IN ONE SENTENCE ════════════════════════════════════
 *
 * THE SERVER NEVER RENDERS A WINDOW THE ADMIN DID NOT ASK FOR. It either renders
 * exactly what they asked for — repairing an input whose intent is unambiguous —
 * or it falls back to the preset range and shows no custom window at all. It
 * never invents a third window, and it never silently keeps half of a broken one.
 *
 * The cases, and which half of that sentence each lands in:
 *
 *   both absent            -> FALL BACK   no custom range was asked for
 *   one half missing       -> FALL BACK   a one-ended span has no length, so no
 *                                         bucket rule and no previous period
 *   unparseable            -> FALL BACK   '2026-13-01', '05/09/2026', 'yesterday'
 *   impossible date        -> FALL BACK   '2026-02-31' — right shape, no such day
 *   from AFTER to          -> SWAP        unambiguous intent, and the sibling
 *                                         registrations list already swaps rather
 *                                         than showing an empty table
 *   `to` in the future     -> CLAMP       to now; no data can exist after now, and
 *                                         a title naming a window nobody can fill
 *                                         is the E3 defect again
 *   entirely in the future -> FALL BACK   after clamping there is no window left
 *   span > 10 years        -> FALL BACK   not a range anyone means
 *
 * ORDER MATTERS, and is why this is one function rather than a chain of guards:
 * parse -> swap -> clamp -> re-check. Clamping before swapping would turn a
 * reversed future pair into a backwards window; swapping after clamping would
 * hide that the window had already collapsed.
 *
 * @returns {{from: Date, to: Date}|null} null means "use the preset range"
 */
export function resolveCustomWindow({ from, to, now = new Date() } = {}) {
  let start = parseBangkokDate(from);
  let end = bangkokEndOfDay(to);
  if (!start || !end) return null;

  // from after to — the reader typed them the wrong way round.
  if (start.getTime() > end.getTime()) {
    start = parseBangkokDate(to);
    end = bangkokEndOfDay(from);
  }

  // A `to` beyond now cannot contain data. Clamp rather than reject: the reader
  // asked for "up to and including a date", and now is where that stops.
  const ceiling = new Date(now);
  if (end.getTime() > ceiling.getTime()) end = ceiling;

  // Entirely in the future — after clamping there is nothing left to draw.
  if (start.getTime() > end.getTime()) return null;

  const days = (end.getTime() - start.getTime()) / 864e5;
  if (days > MAX_CUSTOM_SPAN_DAYS) return null;

  return { from: start, to: end };
}

/**
 * The chart's title for a custom window — the DATES it actually drew, and the
 * bucket it drew them in.
 *
 * The same rule E3 established for the four presets. Here the window came from
 * the URL and may have been swapped or clamped on the way in, so naming what the
 * admin TYPED would be the seven-day lie wearing new clothes. This names what
 * was drawn, in Bangkok dates, via the same `bucketKey` the buckets use.
 */
export function customWindowLabel(from, to) {
  const bucket = bucketForSpan(from, to);
  const word = { hour: 'รายชั่วโมง', day: 'รายวัน', month: 'รายเดือน' }[bucket] ?? 'รายวัน';
  return `${bucketKey(from, 'day')} – ${bucketKey(to, 'day')} — ${word}`;
}

/**
 * ══ ONE WINDOW RESOLVER — PRESET OR CUSTOM ══════════════════════════════════
 *
 * Every consumer asks this and nothing else: the aggregation's `$match`, the
 * bucket the series is grouped into, the axis the client draws, the title that
 * names the window, and the previous period the percentage divides by. Before
 * this they were five separate calls threaded through `readRegistrations`, and a
 * custom range would have meant five branches — five chances for the chart to
 * draw one window while the title named another, which is exactly the defect
 * round E3 existed to end.
 *
 * ── THE CUSTOM PREVIOUS PERIOD IS THE EQUAL SPAN IMMEDIATELY PRECEDING ──────
 * The same rule the presets use, and here it always exists — unlike ทั้งหมด,
 * which has no period before everything. So a custom range gets its percentage
 * normally, and that is a real difference between the two the report names.
 *
 * @param {object} args
 * @param {string} args.range           one of RANGE_VALUES
 * @param {{from: Date, to: Date}|null} args.custom  an ALREADY-VALIDATED window
 *   from `resolveCustomWindow`. This function does not parse or validate: it is
 *   pure arithmetic over instants, and the validation lives where the untrusted
 *   strings arrive.
 * @param {Date} args.now
 */
export function resolveWindow({ range, custom = null, now = new Date() } = {}) {
  if (custom && custom.from && custom.to) {
    const from = new Date(custom.from);
    const to = new Date(custom.to);
    const span = to.getTime() - from.getTime();
    return {
      from,
      to,
      custom: true,
      bucket: bucketForSpan(from, to),
      label: customWindowLabel(from, to),
      previous: {
        from: new Date(from.getTime() - 1 - span),
        to: new Date(from.getTime() - 1),
      },
    };
  }

  const { from, to } = dateRangeAt(range, now);
  return {
    from,
    to,
    custom: false,
    bucket: bucketForRange(range),
    label: windowLabel(range),
    previous: previousWindow(range, now),
  };
}
