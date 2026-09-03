import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ADMIN_SCHEDULE_MONTHS,
  ADMIN_SCHEDULE_RANGE_MONTHS_BACK,
  ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD,
  ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL,
  adminScheduleMonthCols,
  adminScheduleSelectableMonthKeys,
  adminScheduleSelectableRange,
  adminScheduleSelectableWindowDays,
  adminScheduleWindow,
  resolveAdminScheduleRange,
} from '@/lib/adminScheduleHorizon';
import {
  EDITOR_RANGE_MONTHS_BACK,
  EDITOR_RANGE_MONTHS_FORWARD,
} from '@/lib/schedule/editorCalendarRange';

// The admin schedule table's from/to dropdowns became user-adjustable this
// round. Everything here is about the SELECTABLE range those dropdowns
// offer — a different concept from ADMIN_SCHEDULE_MONTHS (the DEFAULT number
// of columns rendered when nobody has touched them), covered already in
// test/pure/adminScheduleHorizon.test.mjs, which this file must not disturb.

// ── the reach intentionally matches the editor's picker ─────────────────────

test('the selectable range intentionally EQUALS the editor picker\'s reach', () => {
  // Deliberate, and stated as such: a round the picker allows selecting must
  // land in a table window the admin can also reach. If this equality is
  // ever meant to change, it should fail here and force a conscious choice
  // rather than silently drift apart from the picker.
  assert.equal(ADMIN_SCHEDULE_RANGE_MONTHS_BACK, EDITOR_RANGE_MONTHS_BACK);
  assert.equal(ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD, EDITOR_RANGE_MONTHS_FORWARD);
});

test('the selectable range is wider than the default view in both directions', () => {
  // Otherwise the default view's own edge would be unreachable by the
  // dropdown that is supposed to widen past it.
  assert.ok(ADMIN_SCHEDULE_RANGE_MONTHS_BACK >= 1);
  assert.ok(ADMIN_SCHEDULE_RANGE_MONTHS_FORWARD >= ADMIN_SCHEDULE_MONTHS - 1);
});

// ── adminScheduleSelectableRange ─────────────────────────────────────────────

test('the selectable range spans 12 months back / 24 forward from `now`\'s month', () => {
  const { min, max } = adminScheduleSelectableRange(new Date(2026, 7, 27)); // 2026-08-27
  assert.equal(min, '2025-08');
  assert.equal(max, '2028-08');
});

test('CONTROL: the selectable range is live, not constant', () => {
  const a = adminScheduleSelectableRange(new Date(2026, 0, 10));
  const b = adminScheduleSelectableRange(new Date(2026, 5, 10));
  assert.notEqual(a.min, b.min);
  assert.notEqual(a.max, b.max);
});

test('adminScheduleSelectableMonthKeys enumerates every month in the range, in order', () => {
  const keys = adminScheduleSelectableMonthKeys(new Date(2026, 7, 27));
  assert.equal(keys.length, ADMIN_SCHEDULE_SELECTABLE_MONTHS_TOTAL);
  assert.equal(keys[0], '2025-08');
  assert.equal(keys[keys.length - 1], '2028-08');
  for (let i = 1; i < keys.length; i++) {
    assert.ok(keys[i] > keys[i - 1], 'keys must be strictly increasing');
  }
});

test('adminScheduleSelectableWindowDays is the first day of `min` through the last day of `max`', () => {
  const days = adminScheduleSelectableWindowDays(new Date(2026, 7, 27));
  assert.equal(days.firstDay, '2025-08-01');
  assert.equal(days.lastDay, '2028-08-31');
});

// ── resolveAdminScheduleRange: the validation contract ───────────────────────

test('default-on-arrival is unchanged: no params resolves to today + ADMIN_SCHEDULE_MONTHS - 1', () => {
  const now = new Date(2026, 7, 27); // 2026-08-27
  const resolved = resolveAdminScheduleRange(now, {});
  assert.equal(resolved.from, '2026-08');
  assert.equal(resolved.to, '2027-07'); // 11 months after August = July next year

  // And it must be the SAME default the old fixed-horizon behaviour produced.
  const cols = adminScheduleMonthCols(now);
  assert.equal(resolved.from, cols[0].key);
  assert.equal(resolved.to, cols.at(-1).key);
});

test('a well-formed but out-of-range parameter is CLAMPED, not rejected', () => {
  const now = new Date(2026, 7, 27); // selectable: 2025-08 .. 2028-08
  const tooEarly = resolveAdminScheduleRange(now, { fromKey: '2020-01', toKey: '2026-08' });
  assert.equal(tooEarly.from, '2025-08', 'clamped to the selectable floor');

  const tooLate = resolveAdminScheduleRange(now, { fromKey: '2026-08', toKey: '2099-01' });
  assert.equal(tooLate.to, '2028-08', 'clamped to the selectable ceiling');
});

test('a malformed parameter falls back to that end\'s default rather than being clamped', () => {
  const now = new Date(2026, 7, 27);
  for (const junk of ['garbage', 'abcd-ef', '2026-13', '', null, undefined, '2026']) {
    const resolved = resolveAdminScheduleRange(now, { fromKey: junk, toKey: junk });
    assert.equal(resolved.from, '2026-08', `fromKey=${JSON.stringify(junk)} must fall back to default`);
    assert.equal(resolved.to, '2027-07', `toKey=${JSON.stringify(junk)} must fall back to default`);
  }
});

test('to < from is corrected by raising `to`, never by rendering an empty grid', () => {
  const now = new Date(2026, 7, 27);
  const resolved = resolveAdminScheduleRange(now, { fromKey: '2027-06', toKey: '2026-09' });
  assert.equal(resolved.from, '2027-06');
  assert.equal(resolved.to, '2027-06', 'to is raised to meet from, not left inverted');
});

test('each end resolves independently: one malformed, one valid and in range', () => {
  const now = new Date(2026, 7, 27);
  const resolved = resolveAdminScheduleRange(now, { fromKey: 'nope', toKey: '2027-01' });
  assert.equal(resolved.from, '2026-08', 'malformed from falls back to default');
  assert.equal(resolved.to, '2027-01', 'valid to is honoured as given');
});

// ── adminScheduleMonthCols / adminScheduleWindow: explicit range ────────────

test('adminScheduleMonthCols with an explicit range builds exactly that span', () => {
  const cols = adminScheduleMonthCols(new Date(2026, 7, 27), { fromKey: '2026-11', toKey: '2027-02' });
  assert.deepEqual(cols.map((c) => c.key), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(cols[0].year, 2026);
  assert.equal(cols[0].month, 10); // 0-indexed November
});

test('adminScheduleMonthCols with NO explicit range is byte-identical to the original default', () => {
  const now = new Date(2026, 7, 27);
  const original = [];
  for (let i = 0; i < ADMIN_SCHEDULE_MONTHS; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    original.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      year: d.getFullYear(),
      month: d.getMonth(),
    });
  }
  assert.deepEqual(adminScheduleMonthCols(now), original);
  assert.deepEqual(adminScheduleMonthCols(now, {}), original, 'an empty options object must not change behaviour');
});

test('adminScheduleWindow follows an explicit range starting AWAY from the current month', () => {
  const now = new Date(2026, 7, 27); // 2026-08-27
  // The admin scrolled back to look at October: `from` must be the 1st of
  // October, not "today" — the "today" narrowing only makes sense for a
  // window that actually contains today.
  const win = adminScheduleWindow(now, { fromKey: '2026-10', toKey: '2026-12' });
  assert.equal(win.from, '2026-10-01');
  assert.equal(win.to, '2026-12-31');
});

test('adminScheduleWindow month-aligns `from` even when the range starts at the CURRENT month', () => {
  /*
   * ── THIS TEST ASSERTED THE OPPOSITE, AND THE REASON IT DID HAS EXPIRED ────
   * It pinned `from === '2026-08-27'` — today — for a window starting in the
   * current month, under the heading "keeps the from-today narrowing". That
   * narrowing rested on two facts that no longer hold: MSDB clamped any past
   * `from` up to today (so asking was pointless), and this grid had no way to
   * draw a finished round (so wanting them was pointless). Upstream now honours
   * a past `from`, and the grid now renders an ended round as จบไปแล้ว.
   *
   * Kept as a test rather than deleted, with its assertion inverted, because
   * the case it covers is still the interesting one: it is the ONLY window
   * where `from` and today can differ, and it is where a future edit would
   * reintroduce the narrowing. On 27 ส.ค. the old bound hid every ส.ค. round
   * from the 1st to the 26th from a column that looked complete.
   */
  const now = new Date(2026, 7, 27); // 2026-08-27
  const win = adminScheduleWindow(now, { fromKey: '2026-08', toKey: '2026-08' });
  assert.equal(
    win.from, '2026-08-01',
    'from is the 1st, not today: rounds earlier this month have a cell in this ' +
    'very column and must not be excluded by our own bound',
  );
  assert.equal(win.to, '2026-08-31');
});

test('CONTROL: a window starting away from the current month is unchanged', () => {
  // The other branch of the same rule, pinned alongside so the two cannot be
  // "unified" in the wrong direction — both ends month-align now, and the test
  // above is the one that moved.
  const now = new Date(2026, 7, 27);
  const win = adminScheduleWindow(now, { fromKey: '2026-10', toKey: '2026-12' });
  assert.equal(win.from, '2026-10-01');
  assert.equal(win.to, '2026-12-31');
});

test('adminScheduleWindow with NO explicit range spans the first to the last rendered column', () => {
  /*
   * Was "byte-identical to the original default", where the default's `from`
   * was today. Only the `from` end moved — see the month-alignment note on the
   * test above. The property this case really guards is unchanged and is now
   * stated symmetrically: BOTH bounds are derived from the columns, so no row
   * upstream returns can land outside a column that exists.
   */
  const cases = [
    new Date(2026, 6, 29),
    new Date(2026, 11, 15),
    new Date(2027, 2, 15),
  ];
  for (const now of cases) {
    const cols = adminScheduleMonthCols(now);
    const first = cols[0];
    const last = cols[cols.length - 1];
    const firstDay = new Date(first.year, first.month, 1);
    const lastDay = new Date(last.year, last.month + 1, 0);
    const iso = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const win = adminScheduleWindow(now);
    assert.equal(win.from, iso(firstDay));
    assert.equal(win.to, iso(lastDay));
    assert.deepEqual(adminScheduleWindow(now, {}), win, 'an empty options object must not change behaviour');
  }
});

test('a full round-trip: resolve → cols → window agree on the same selected span', () => {
  const now = new Date(2026, 7, 27);
  const { from, to } = resolveAdminScheduleRange(now, { fromKey: '2026-05', toKey: '2026-09' });
  const cols = adminScheduleMonthCols(now, { fromKey: from, toKey: to });
  const win = adminScheduleWindow(now, { fromKey: from, toKey: to });

  assert.deepEqual(cols.map((c) => c.key), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  assert.equal(win.from, '2026-05-01', 'a past start is month-aligned, not narrowed to today');
  assert.equal(win.to, '2026-09-30');
});
