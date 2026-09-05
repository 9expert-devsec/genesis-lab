import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CUSTOM_SPAN_DAYS,
  SPAN_BUCKET_BANDS,
  SPAN_BUCKET_FALLBACK,
  bangkokEndOfDay,
  bucketForSpan,
  bucketKey,
  customWindowLabel,
  enumerateBuckets,
  parseBangkokDate,
  resolveCustomWindow,
  resolveWindow,
} from '@/lib/dashboard/ranges';

/**
 * THE CUSTOM DATE RANGE — the span→bucket rule, the validation table, and the
 * Bangkok boundary.
 *
 * ══ EVERY FIXTURE IS AN ABSOLUTE LITERAL DATE ═══════════════════════════════
 *
 * Standing rule (4), and the round asked for it by name. No expectation below is
 * computed from `SPAN_BUCKET_BANDS`, `MAX_CUSTOM_SPAN_DAYS` or the rule under
 * test — a fixture derived from its own subject moves with it and can never
 * fail, which is the defect round E3 shipped twice in one file before catching.
 *
 * The band edges are pinned to their literals ONCE, at the top, and that single
 * assertion is what gives every date below its meaning. Change a band and this
 * file fails loudly, which is correct: a new rule needs fixtures chosen for it.
 */

const NOW = new Date('2026-09-05T04:00:00.000Z'); // 11:00 on 5 Sep in Bangkok

test('custom: the band edges are the literals these fixtures were chosen for', () => {
  assert.deepEqual(
    SPAN_BUCKET_BANDS.map((b) => [b.maxDays, b.bucket]),
    [[2, 'hour'], [62, 'day']],
    'a band moved — the literal dates below were chosen for 2 and 62 and must be '
    + 're-chosen, not silently followed',
  );
  assert.equal(SPAN_BUCKET_FALLBACK, 'month');
  assert.equal(MAX_CUSTOM_SPAN_DAYS, 3653, 'ten years');
});

// ── 5a. THE BUCKET RULE PER SPAN BAND ──────────────────────────────────────

test('custom: the bucket follows the SPAN, band by band', () => {
  /**
   * Absolute dates, and the expected bucket written out. Each pair straddles a
   * band edge so the assertion is about the edge and not about the middle.
   */
  const CASES = [
    // from,         to,           expected  why
    ['2026-09-05', '2026-09-05', 'hour'],  // one day
    ['2026-09-04', '2026-09-05', 'hour'],  // 1.5 days — inside the 2-day band
    ['2026-09-01', '2026-09-05', 'day'],   // 4.5 days — past it
    ['2026-07-06', '2026-09-05', 'day'],   // 61.5 days — the last daily span
    ['2026-07-05', '2026-09-05', 'month'], // 62.5 days — the first monthly one
    ['2024-09-05', '2026-09-05', 'month'], // two years
  ];
  for (const [from, to, expected] of CASES) {
    const win = resolveCustomWindow({ from, to, now: NOW });
    assert.ok(win, `${from}..${to} was rejected`);
    assert.equal(
      bucketForSpan(win.from, win.to), expected,
      `${from}..${to} (${((win.to - win.from) / 864e5).toFixed(1)} days) drew the wrong bucket`,
    );
  }
});

test('custom: each band produces a legible number of bars', () => {
  // The bands were DERIVED from this, so it is asserted rather than left in a
  // comment: enough bars to show a shape, few enough to draw at card width.
  const CASES = [
    ['2026-09-04', '2026-09-05', 24, 48],
    ['2026-09-01', '2026-09-05', 3, 62],
    ['2026-07-05', '2026-09-05', 3, 62],
    ['2024-09-05', '2026-09-05', 3, 62],
  ];
  for (const [from, to, min, max] of CASES) {
    const win = resolveCustomWindow({ from, to, now: NOW });
    const bars = enumerateBuckets(win.from, win.to, bucketForSpan(win.from, win.to)).length;
    assert.ok(bars >= min && bars <= max, `${from}..${to} drew ${bars} bars, wanted ${min}–${max}`);
  }
});

test('custom: two years of DAILY bars is what the rule exists to prevent', () => {
  // The negative case, stated: the same span at the wrong bucket.
  const win = resolveCustomWindow({ from: '2024-09-05', to: '2026-09-05', now: NOW });
  assert.equal(enumerateBuckets(win.from, win.to, 'day').length, 731, 'the daily count, for contrast');
  assert.equal(bucketForSpan(win.from, win.to), 'month');
  assert.equal(enumerateBuckets(win.from, win.to, 'month').length, 25);
});

// ── 6. SERVER VALIDATION, CASE BY CASE ─────────────────────────────────────

test('custom: both halves absent → fall back to the preset', () => {
  assert.equal(resolveCustomWindow({ now: NOW }), null);
  assert.equal(resolveCustomWindow({ from: '', to: '', now: NOW }), null);
});

test('custom: ONE half missing → fall back', () => {
  // A one-ended span has no length, so no bucket rule and no previous period.
  assert.equal(resolveCustomWindow({ from: '2026-09-01', now: NOW }), null);
  assert.equal(resolveCustomWindow({ to: '2026-09-05', now: NOW }), null);
  assert.equal(resolveCustomWindow({ from: '2026-09-01', to: '', now: NOW }), null);
});

test('custom: an unparseable date → fall back', () => {
  for (const bad of ['05/09/2026', '2026-9-5', 'yesterday', '2026-08', '2026-13-01', 'DROP TABLE', '2026-09-05T00:00:00Z']) {
    assert.equal(
      resolveCustomWindow({ from: bad, to: '2026-09-05', now: NOW }), null,
      `'${bad}' was accepted`,
    );
  }
});

test('custom: an IMPOSSIBLE date is rejected, not rolled forward', () => {
  // `new Date(2026, 1, 31)` silently becomes 3 March. The round-trip check is
  // what stops a window nobody asked for from being drawn under a date that
  // does not exist.
  assert.equal(parseBangkokDate('2026-02-31'), null);
  assert.equal(parseBangkokDate('2026-04-31'), null);
  assert.equal(resolveCustomWindow({ from: '2026-02-31', to: '2026-09-05', now: NOW }), null);
  // …and a real leap day is accepted.
  assert.ok(parseBangkokDate('2024-02-29'), '2024 is a leap year');
  assert.equal(parseBangkokDate('2026-02-29'), null, '2026 is not');
});

test('custom: `from` AFTER `to` is SWAPPED, not rejected', () => {
  /**
   * Control (d) removes this. The intent is unambiguous, and the sibling
   * registrations list already swaps rather than showing an empty table — so an
   * admin who types them backwards gets the same repair on both screens.
   */
  const swapped = resolveCustomWindow({ from: '2026-09-05', to: '2026-09-01', now: NOW });
  const ordered = resolveCustomWindow({ from: '2026-09-01', to: '2026-09-05', now: NOW });
  assert.ok(swapped, 'a reversed pair was rejected');
  assert.equal(swapped.from.getTime(), ordered.from.getTime());
  assert.equal(swapped.to.getTime(), ordered.to.getTime());
  assert.ok(swapped.from < swapped.to, 'the window is still backwards');
});

test('custom: a `to` in the FUTURE is clamped to now', () => {
  // No data can exist after now, and a title naming a window nobody can fill is
  // the E3 defect again.
  const win = resolveCustomWindow({ from: '2026-09-01', to: '2027-01-01', now: NOW });
  assert.ok(win, 'a future end was rejected instead of clamped');
  assert.equal(win.to.getTime(), NOW.getTime(), 'the end was not clamped to now');
  assert.equal(win.from.toISOString(), '2026-08-31T17:00:00.000Z', 'Bangkok midnight on 1 Sep');
});

test('custom: a window ENTIRELY in the future → fall back', () => {
  // After clamping there is nothing left to draw.
  assert.equal(resolveCustomWindow({ from: '2027-01-01', to: '2027-02-01', now: NOW }), null);
});

test('custom: an ABSURD span → fall back', () => {
  // Ten years is the line. 2000→2026 is twenty-six.
  assert.equal(resolveCustomWindow({ from: '2000-01-01', to: '2026-09-05', now: NOW }), null);
  // …and a span just inside it is accepted, so the rule is a threshold and not
  // a blanket rejection of long spans.
  assert.ok(resolveCustomWindow({ from: '2020-01-01', to: '2026-09-05', now: NOW }), 'six years is fine');
});

test('custom: a normal window is accepted and bounded in Bangkok', () => {
  const win = resolveCustomWindow({ from: '2026-08-01', to: '2026-08-31', now: NOW });
  assert.ok(win);
  assert.equal(win.from.toISOString(), '2026-07-31T17:00:00.000Z', '1 Aug 00:00 Bangkok');
  assert.equal(win.to.toISOString(), '2026-08-31T16:59:59.999Z', '31 Aug 23:59:59.999 Bangkok');
});

// ── 7. THE BANGKOK BOUNDARY ────────────────────────────────────────────────

test('custom: a Bangkok-boundary record lands in the day a Bangkok admin expects', () => {
  /**
   * 2026-09-04T17:30Z is 00:30 on 5 September in Bangkok. A Bangkok admin asking
   * for "5 September" means that record.
   *
   * Round E3 found the chart grouping at +07:00 while enumerating in UTC and
   * silently dropping the newest bucket. Control (e) reintroduces exactly that
   * for the custom range, and this is what catches it.
   */
  const record = new Date('2026-09-04T17:30:00Z');
  const win = resolveCustomWindow({ from: '2026-09-05', to: '2026-09-05', now: NOW });
  assert.ok(win);
  assert.ok(record >= win.from, 'the record is before the window starts');
  assert.ok(record <= win.to, 'the record is after the window ends');
  assert.equal(bucketKey(record, 'day'), '2026-09-05', 'and its bucket key is the 5th');

  // The other side of the same boundary: 16:30Z is still the 4th in Bangkok.
  const dayBefore = new Date('2026-09-04T16:30:00Z');
  assert.ok(dayBefore < win.from, 'a record from the previous Bangkok day crept in');
  assert.equal(bucketKey(dayBefore, 'day'), '2026-09-04');
});

test('custom: the window edges themselves are Bangkok midnight and Bangkok 23:59', () => {
  assert.equal(parseBangkokDate('2026-09-05').toISOString(), '2026-09-04T17:00:00.000Z');
  assert.equal(bangkokEndOfDay('2026-09-05').toISOString(), '2026-09-05T16:59:59.999Z');
});

// ── 5b. THE PREVIOUS PERIOD, AND THE TITLE ─────────────────────────────────

test('custom: the previous period is the equal span immediately preceding', () => {
  /**
   * Unlike ทั้งหมด, which has no period before everything, a custom window
   * always has one — so the percentage works normally here.
   */
  const custom = resolveCustomWindow({ from: '2026-09-01', to: '2026-09-05', now: NOW });
  const win = resolveWindow({ range: 'custom', custom, now: NOW });
  assert.ok(win.previous, 'a custom window has no previous period');
  assert.equal(
    win.previous.to.getTime(), win.from.getTime() - 1,
    'the previous window must end the instant the current one begins',
  );
  assert.equal(
    win.previous.to.getTime() - win.previous.from.getTime(),
    win.to.getTime() - win.from.getTime(),
    'the spans must match, or it is not a comparison',
  );
});

test('custom: the title names the window it DREW, not what was typed', () => {
  // A reversed pair is swapped and a future end is clamped on the way in, so the
  // title has to come from the resolved window. Naming the typed dates would be
  // the seven-day lie wearing new clothes.
  const typedBackwards = resolveCustomWindow({ from: '2026-09-05', to: '2026-09-01', now: NOW });
  const label = customWindowLabel(typedBackwards.from, typedBackwards.to);
  assert.match(label, /^2026-09-01 – 2026-09-05/, `the title says: ${label}`);
  assert.match(label, /รายวัน/, 'and it names the bucket it drew');

  const clamped = resolveCustomWindow({ from: '2026-09-01', to: '2027-01-01', now: NOW });
  assert.match(
    customWindowLabel(clamped.from, clamped.to), /– 2026-09-05/,
    'the title names the clamped end, not the requested one',
  );
});

test('custom: the title names the bucket for each band', () => {
  const CASES = [
    ['2026-09-04', '2026-09-05', 'รายชั่วโมง'],
    ['2026-09-01', '2026-09-05', 'รายวัน'],
    ['2024-09-05', '2026-09-05', 'รายเดือน'],
  ];
  for (const [from, to, word] of CASES) {
    const win = resolveCustomWindow({ from, to, now: NOW });
    assert.match(customWindowLabel(win.from, win.to), new RegExp(word), `${from}..${to}`);
  }
});

// ── resolveWindow: one resolver, preset or custom ──────────────────────────

test('custom: resolveWindow reports which kind of window it built', () => {
  const preset = resolveWindow({ range: 'week', now: NOW });
  assert.equal(preset.custom, false);
  assert.equal(preset.bucket, 'day');

  const custom = resolveWindow({
    range: 'week',
    custom: resolveCustomWindow({ from: '2026-09-04', to: '2026-09-05', now: NOW }),
    now: NOW,
  });
  assert.equal(custom.custom, true);
  assert.equal(custom.bucket, 'hour', 'the custom span, not the preset range, chose the bucket');
});

test('custom: a null custom window falls through to the preset', () => {
  const win = resolveWindow({ range: 'week', custom: null, now: NOW });
  assert.equal(win.custom, false);
  assert.equal(win.bucket, 'day');
  assert.match(win.label, /7 วัน/);
});

// ── CONTROLS ───────────────────────────────────────────────────────────────

test('CONTROL: bucketForSpan really varies with the span', () => {
  // Without this, "the bucket follows the span" would hold for a function that
  // returned one value, as long as the expectations happened to agree.
  const seen = new Set([
    bucketForSpan(new Date('2026-09-05T00:00:00Z'), new Date('2026-09-05T12:00:00Z')),
    bucketForSpan(new Date('2026-08-01T00:00:00Z'), new Date('2026-09-05T00:00:00Z')),
    bucketForSpan(new Date('2024-01-01T00:00:00Z'), new Date('2026-09-05T00:00:00Z')),
  ]);
  assert.equal(seen.size, 3, `the bucket did not vary: ${[...seen]}`);
});

test('CONTROL: resolveCustomWindow really rejects — it is not returning null always', () => {
  // Every "→ fall back" assertion would hold for a function that returned null
  // for everything.
  assert.ok(resolveCustomWindow({ from: '2026-09-01', to: '2026-09-05', now: NOW }));
});

test('CONTROL: a UTC parse would land the boundary record on the WRONG day', () => {
  /**
   * Control (e), reconstructed so the red line stays legible. This is the exact
   * arithmetic the registrations list's `parseDateInput` performs, and it is why
   * that function was NOT reused wholesale: on a UTC server it puts the window's
   * start seven hours late, and a record at 00:30 Bangkok falls outside a window
   * the admin believes contains it.
   */
  const record = new Date('2026-09-04T17:30:00Z'); // 00:30 on the 5th, Bangkok
  const utcStart = new Date(Date.UTC(2026, 8, 5)); // what a UTC parse produces
  const bangkokStart = parseBangkokDate('2026-09-05');
  assert.ok(record < utcStart, 'a UTC-parsed window would EXCLUDE the record');
  assert.ok(record >= bangkokStart, 'the Bangkok-parsed window includes it');
  assert.equal(utcStart.getTime() - bangkokStart.getTime(), 7 * 3600e3, 'seven hours apart');
});
