import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUCKET_BY_RANGE,
  BUCKET_TZ,
  RANGE_VALUES,
  bucketForRange,
  bucketFormat,
  bucketKey,
  dateRangeAt,
  enumerateBuckets,
  previousWindow,
  windowLabel,
} from '@/lib/dashboard/ranges';

/**
 * The window, the bucket size, and the period before.
 *
 * ══ WHY THE CLOCK IS INJECTED EVERYWHERE ════════════════════════════════════
 * Every value here is relative to "now". A test that cannot fix the clock can
 * only assert that the code computed SOMETHING — it cannot assert that เดือนนี้
 * starts on the 1st, because it does not know which month it is. `dateRangeAt`
 * and `previousWindow` both take `now`, and every assertion below pins it.
 *
 * NOW is 2026-09-05T04:00Z, which is 11:00 on 5 September in Bangkok — chosen
 * deliberately as a time where the UTC date and the Bangkok date AGREE, so the
 * separate timezone assertions further down are testing the timezone rather than
 * riding on a coincidence. The pair that DISAGREE is tested explicitly.
 */
const NOW = new Date('2026-09-05T04:00:00.000Z');

// ── 5. BUCKET SIZE CHANGES WITH THE RANGE, asserted per range ───────────────

test('buckets: the rule is hour / day / day / month, per range', () => {
  assert.equal(bucketForRange('today'), 'hour');
  assert.equal(bucketForRange('week'),  'day');
  assert.equal(bucketForRange('month'), 'day');
  assert.equal(bucketForRange('all'),   'month');
});

test('buckets: ทั้งหมด is NOT daily — the whole point of the rule', () => {
  /**
   * Control (d) in the round brief breaks exactly this. Daily buckets over the
   * whole corpus draw a flat line with two spikes: production spans 2026-04-23
   * to 2026-08-31, which is 131 daily bars for 41 public registrations, ~90 of
   * them zero.
   */
  assert.notEqual(bucketForRange('all'), 'day');
  assert.equal(BUCKET_BY_RANGE.all, 'month');
});

test('buckets: every range in the control has a bucket, and no range is missing', () => {
  // A range with no entry would silently fall through to the ทั้งหมด rule and
  // draw monthly bars under a daily heading.
  for (const range of RANGE_VALUES) {
    assert.ok(BUCKET_BY_RANGE[range], `${range} has no bucket size`);
  }
  assert.deepEqual(Object.keys(BUCKET_BY_RANGE).sort(), [...RANGE_VALUES].sort());
});

test('buckets: each size has its own $dateToString format', () => {
  assert.equal(bucketFormat('hour'),  '%Y-%m-%dT%H');
  assert.equal(bucketFormat('day'),   '%Y-%m-%d');
  assert.equal(bucketFormat('month'), '%Y-%m');
  // The three must be DISTINCT, or two ranges would produce keys that collide
  // and the series would sum buckets the axis draws separately.
  assert.equal(new Set(['hour', 'day', 'month'].map(bucketFormat)).size, 3);
});

// ── the timezone, both halves ───────────────────────────────────────────────

test('buckets: keys are built in Bangkok, not in the server zone', () => {
  assert.equal(BUCKET_TZ, '+07:00');
  /**
   * 17:30Z on the 4th is 00:30 on the 5th in Bangkok. This is the pair that
   * disagree, and it is the defect the pre-E3 chart shipped: the aggregate
   * grouped with `timezone: '+07:00'` and emitted `2026-09-05`, while the JS
   * that enumerated the days to fill used `toISOString()` and produced
   * `2026-09-04`. On a UTC server (Vercel) the newest bucket had no slot to land
   * in for the first seven hours of every Bangkok day, and its count vanished.
   */
  assert.equal(bucketKey(new Date('2026-09-04T17:30:00Z'), 'day'), '2026-09-05');
  assert.equal(bucketKey(new Date('2026-09-04T16:30:00Z'), 'day'), '2026-09-04');
  assert.equal(bucketKey(new Date('2026-09-04T17:30:00Z'), 'hour'), '2026-09-05T00');
  assert.equal(bucketKey(new Date('2026-08-31T17:30:00Z'), 'month'), '2026-09');
});

// ── enumeration fills the gaps ──────────────────────────────────────────────

test('buckets: enumeration fills empty periods rather than closing the gap', () => {
  const days = enumerateBuckets(new Date('2026-09-01T00:00:00+07:00'), new Date('2026-09-05T00:00:00+07:00'), 'day');
  assert.deepEqual(days, ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);
  // A day with no registrations must still get a slot, or the chart draws four
  // bars where five days passed and looks denser than the data is.
  assert.equal(days.length, 5);
});

test('buckets: months step on the calendar, not by adding 30 days', () => {
  const months = enumerateBuckets(new Date('2026-01-15T00:00:00+07:00'), new Date('2026-12-20T00:00:00+07:00'), 'month');
  assert.equal(months.length, 12, `12 calendar months, got ${months.length}: ${months}`);
  assert.equal(months[0], '2026-01');
  assert.equal(months[11], '2026-12');
  // Adding 30 days repeatedly drifts a day per short month and would emit
  // '2026-03' twice while skipping nothing visible.
  assert.equal(new Set(months).size, months.length, 'a month key repeated');
});

test('buckets: a year boundary is crossed correctly', () => {
  const months = enumerateBuckets(new Date('2026-11-05T00:00:00+07:00'), new Date('2027-02-05T00:00:00+07:00'), 'month');
  assert.deepEqual(months, ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('buckets: enumeration degrades to [] rather than spinning or throwing', () => {
  assert.deepEqual(enumerateBuckets(null, new Date(), 'day'), []);
  assert.deepEqual(enumerateBuckets(new Date(), null, 'day'), []);
  assert.deepEqual(enumerateBuckets(new Date('2026-09-05'), new Date('2026-09-01'), 'day'), [], 'reversed');
  assert.deepEqual(enumerateBuckets(new Date('nope'), new Date(), 'day'), []);
});

// ── the windows ─────────────────────────────────────────────────────────────

test('window: each range starts where it says it does', () => {
  const today = dateRangeAt('today', NOW);
  assert.equal(today.from.getHours(), 0, 'today starts at local midnight');
  assert.equal(today.from.getDate(), NOW.getDate());

  const week = dateRangeAt('week', NOW);
  assert.equal(Math.round((today.from - week.from) / 864e5), 6, '7 วัน spans today plus six');

  const month = dateRangeAt('month', NOW);
  assert.equal(month.from.getDate(), 1, 'เดือนนี้ starts on the 1st');
  assert.equal(month.from.getMonth(), NOW.getMonth());

  assert.equal(dateRangeAt('all', NOW).from, null, 'ทั้งหมด is unbounded');
});

// ── 4. NO PREVIOUS PERIOD AT ทั้งหมด ────────────────────────────────────────

test('previous: ทั้งหมด has NO previous period — null, not an empty window', () => {
  /**
   * There is no period before everything. A window that merely matched nothing
   * would produce a zero, and a zero is a measurement: it renders as "0%" or
   * "-100%", both of which assert something nobody computed. Control (c) breaks
   * this.
   */
  assert.equal(previousWindow('all', NOW), null);
});

test('previous: the other three get an equal span, immediately preceding', () => {
  for (const range of ['today', 'week', 'month']) {
    const win = dateRangeAt(range, NOW);
    const prev = previousWindow(range, NOW);
    assert.ok(prev, `${range} must have a previous window`);
    assert.equal(
      prev.to.getTime(), win.from.getTime() - 1,
      `${range}: the previous window must END the instant the current one begins`,
    );
    const span = win.to.getTime() - win.from.getTime();
    const prevSpan = prev.to.getTime() - prev.from.getTime();
    assert.equal(prevSpan, span, `${range}: the spans must match, or the comparison is not one`);
  }
});

test('previous: เดือนนี้ compares an EQUAL span, not the whole previous month', () => {
  // On the 5th, เดือนนี้ holds five days. Comparing five days against a full
  // 31-day month prints a catastrophic decline every month and resets on the
  // 1st — wrong in a way that looks like news.
  const prev = previousWindow('month', NOW);
  const win = dateRangeAt('month', NOW);
  const days = (prev.to - prev.from) / 864e5;
  assert.ok(days < 6, `the previous window is ${days.toFixed(1)} days — a whole month crept in`);
  assert.ok(prev.to < win.from);
});

// ── 6. THE TITLE NAMES THE WINDOW ───────────────────────────────────────────

test('label: every range has a window label, and it names the bucket it drew', () => {
  const BUCKET_WORD = { hour: 'ชั่วโมง', day: 'วัน', month: 'เดือน' };
  for (const range of RANGE_VALUES) {
    const label = windowLabel(range);
    assert.ok(typeof label === 'string' && label.length > 0, `${range} has no label`);
    assert.ok(
      label.includes(BUCKET_WORD[bucketForRange(range)]),
      `${range} is bucketed by ${bucketForRange(range)} but its label says "${label}" — `
      + 'a title written independently of the query is how the seven-day lie survived',
    );
  }
});

test('label: the four labels are distinct', () => {
  // Two ranges sharing a label would let the chart claim the wrong window while
  // the assertion above still passed.
  assert.equal(new Set(RANGE_VALUES.map(windowLabel)).size, RANGE_VALUES.length);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: bucketForRange really varies — it is not a constant', () => {
  // Without this, "bucket size changes with the range" would hold for a function
  // that returned 'day' for everything, as long as the expectations agreed.
  assert.equal(new Set(RANGE_VALUES.map(bucketForRange)).size, 3, 'hour, day, month');
});

test('CONTROL: an unknown range falls back rather than returning undefined', () => {
  // A silent `undefined` bucket would produce `bucketFormat(undefined)` → the
  // day format, i.e. daily bars under whatever heading, with nothing to say so.
  assert.equal(bucketForRange('nonsense'), BUCKET_BY_RANGE.all);
  assert.equal(windowLabel('nonsense'), windowLabel('all'));
});

test('CONTROL: enumeration can produce a WRONG count, so its assertions bite', () => {
  // Proves the day/month assertions above are not tautologies over a function
  // that returns whatever it is handed.
  assert.equal(enumerateBuckets(new Date('2026-09-01T00:00:00+07:00'), new Date('2026-09-01T00:00:00+07:00'), 'day').length, 1);
  assert.equal(enumerateBuckets(new Date('2026-09-01T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'), 'day').length, 30);
  assert.equal(enumerateBuckets(new Date('2026-09-01T00:00:00+07:00'), new Date('2026-09-30T00:00:00+07:00'), 'month').length, 1);
});
