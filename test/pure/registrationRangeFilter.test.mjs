import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeToDateFilter, buildRegistrationFilter, RANGE_VALUES } from '@/lib/registrations/listFilter';

/**
 * THE DATE WINDOW REACHES THE LIST QUERY, not only the summary cards.
 *
 * The shipped defect: `range` was turned into a `createdAt` clause inside
 * `getRegistrationStatusCounts` and nowhere else, so selecting วันนี้ gave a
 * strip reading ทั้งหมด 1 above a table listing all seven rows, under a header
 * saying `7 รายการทั้งหมด`.
 *
 * ── WHY THE CLOCK IS INJECTED ───────────────────────────────────────────────
 * A builder that calls `new Date()` internally can only be asserted against
 * "roughly now", which is the kind of test that passes at 11:00 and fails at
 * 00:00. `now` is a parameter, so the boundary is exact and reproducible.
 *
 * ── WHY THE ASSERTIONS ARE ON PROPERTIES, NOT ON A RECONSTRUCTED DATE ───────
 * Building the expected `from` with the same `setHours(0,0,0,0)` the module uses
 * would restate the implementation and pass however wrong it is. These assert
 * what the boundary MEANS instead — local midnight, the right calendar day, the
 * right number of days back — which is true independently of how it is computed
 * and holds in whatever timezone the runner is in.
 */

// A fixed instant with a non-zero time of day, mid-month, mid-week, so that
// "midnight", "the 1st" and "six days back" are all visibly different from it.
const NOW = new Date(2026, 7, 14, 19, 27, 35, 123); // 14 Aug 2026, 19:27:35 local

// ── rangeToDateFilter ───────────────────────────────────────────────────────

test('`all` produces NO date clause at all', () => {
  assert.deepEqual(rangeToDateFilter('all', NOW), {});
});

test('an unrecognised range degrades to no date clause, not to an empty match', () => {
  for (const bogus of ['', null, undefined, 'yesterday', 'YEAR', 0]) {
    assert.deepEqual(rangeToDateFilter(bogus, NOW), {}, `range ${JSON.stringify(bogus)}`);
  }
});

test('`today` starts at local midnight of the SAME calendar day', () => {
  const { createdAt } = rangeToDateFilter('today', NOW);
  const from = createdAt.$gte;
  assert.equal(from.getFullYear(), NOW.getFullYear());
  assert.equal(from.getMonth(), NOW.getMonth());
  assert.equal(from.getDate(), NOW.getDate(), 'must be today, not yesterday');
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  assert.equal(from.getSeconds(), 0);
  assert.equal(from.getMilliseconds(), 0);
  assert.ok(from <= NOW, 'the window must start at or before now');
});

test('`week` starts six days back — a seven-day window INCLUDING today', () => {
  const { createdAt } = rangeToDateFilter('week', NOW);
  const from = createdAt.$gte;
  assert.equal(from.getHours(), 0, 'the boundary is a midnight, not a rolling 168 hours');
  const days = Math.round((new Date(NOW).setHours(0, 0, 0, 0) - from.getTime()) / 86400000);
  assert.equal(days, 6, 'six whole days back from today = a 7-day window');
});

test('`month` starts on the 1st of the current month at local midnight', () => {
  const { createdAt } = rangeToDateFilter('month', NOW);
  const from = createdAt.$gte;
  assert.equal(from.getDate(), 1);
  assert.equal(from.getMonth(), NOW.getMonth());
  assert.equal(from.getFullYear(), NOW.getFullYear());
  assert.equal(from.getHours(), 0);
});

test('the three windows nest: month <= week <= today <= now', () => {
  const at = (r) => rangeToDateFilter(r, NOW).createdAt.$gte.getTime();
  assert.ok(at('month') <= at('week'), 'month must reach back at least as far as week');
  assert.ok(at('week') <= at('today'));
  assert.ok(at('today') <= NOW.getTime());
});

test('every RANGE_VALUES member is handled — none falls through to a throw', () => {
  for (const r of RANGE_VALUES) {
    assert.doesNotThrow(() => rangeToDateFilter(r, NOW), `range ${r} threw`);
  }
});

/**
 * CONTROL: a window that reaches back is distinguishable from one that does not.
 *
 * Without this, every assertion above would still pass if `rangeToDateFilter`
 * returned `{}` for all four ranges — the `all` and unknown cases assert exactly
 * that, and the others read `.createdAt.$gte` off it, which would throw rather
 * than fail cleanly. This states the difference positively.
 */
test('CONTROL: today/week/month DO produce a clause and `all` does not', () => {
  assert.equal(Object.keys(rangeToDateFilter('all', NOW)).length, 0);
  for (const r of ['today', 'week', 'month']) {
    assert.ok(rangeToDateFilter(r, NOW).createdAt?.$gte instanceof Date, `${r} produced no Date`);
  }
});

// ── buildRegistrationFilter — the whole filter one list query runs ───────────

test('the range reaches the LIST filter, which is the defect', () => {
  const filter = buildRegistrationFilter({ source: 'inhouse', range: 'today', now: NOW });
  assert.ok(filter.createdAt?.$gte instanceof Date, 'no createdAt clause on the list filter');
  assert.equal(filter.createdAt.$gte.getDate(), NOW.getDate());
});

test('range `all` leaves the filter free of a createdAt key entirely', () => {
  const filter = buildRegistrationFilter({ source: 'inhouse', range: 'all', now: NOW });
  assert.ok(!('createdAt' in filter), 'an undefined createdAt key would not match anything');
});

test('a default call filters on nothing — no status, no search, no date', () => {
  assert.deepEqual(buildRegistrationFilter(), {});
  assert.deepEqual(buildRegistrationFilter({ status: 'all', q: '', range: 'all' }), {});
});

/**
 * ── THE STATUS CLAUSE IS NOW `$in`, AND UNRECOGNISED MEANS "NO CLAUSE" ──────
 *
 * This used to assert `filter.status === 'quoted'`, a scalar. Round 2 changed
 * the shape for two reasons and both are load-bearing:
 *
 *   · an in-house status must also match the RETIRED values that migrate onto
 *     it, for the window between the code deploying and the migration running,
 *     so a single status can name several stored values;
 *   · a status outside the source's live vocabulary must add NO clause at all
 *     rather than a clause matching nothing — `?status=closed-won` is a real
 *     bookmark, and an empty list reads as lost data.
 *
 * `$in` is used even for the one-member case, so there is one shape to check.
 */
test('status `all` adds no status clause; a live status adds an $in', () => {
  assert.ok(!('status' in buildRegistrationFilter({ status: 'all' })));
  assert.deepEqual(
    buildRegistrationFilter({ status: 'quoted', source: 'inhouse' }).status,
    { $in: ['quoted', 'closed-won'] }
  );
  assert.deepEqual(
    buildRegistrationFilter({ status: 'confirmed', source: 'public' }).status,
    { $in: ['confirmed'] }
  );
});

test('a RETIRED status adds no clause — the list shows everything, not nothing', () => {
  for (const stale of ['new', 'contacted', 'closed-won', 'closed-lost']) {
    const filter = buildRegistrationFilter({ status: stale, source: 'inhouse' });
    assert.ok(!('status' in filter),
      `?status=${stale} produced a clause; a stale bookmark must degrade to show-all`);
  }
});

test('a status from the OTHER source adds no clause either', () => {
  // `paid` is real, but not for in-house — it must not be filterable there.
  assert.ok(!('status' in buildRegistrationFilter({ status: 'paid', source: 'inhouse' })));
  assert.ok(!('status' in buildRegistrationFilter({ status: 'quoted', source: 'public' })));
});

test('CONTROL: the degrade is not simply "no status clause ever"', () => {
  // Every assertion above is of the form "no status key". If the builder had
  // stopped emitting the clause altogether they would all pass. This is the
  // positive case on the same source.
  const filter = buildRegistrationFilter({ status: 'pending', source: 'inhouse' });
  assert.ok('status' in filter, 'a live status must still produce a clause');
  assert.deepEqual(filter.status.$in.sort(), ['contacted', 'new', 'pending']);
});

test('a whitespace-only search is not a search', () => {
  assert.ok(!('$or' in buildRegistrationFilter({ q: '   ' })));
  assert.ok(!('$or' in buildRegistrationFilter({ q: '' })));
  assert.ok(!('$or' in buildRegistrationFilter({ q: null })));
});

test('the search term is trimmed before it becomes a regex', () => {
  const filter = buildRegistrationFilter({ q: '  cpn  ', source: 'inhouse' });
  for (const clause of filter.$or) {
    assert.equal(Object.values(clause)[0].$regex, 'cpn');
  }
});

/**
 * The two sources search DIFFERENT fields, and neither searches the other's.
 *
 * An in-house document has no `courseName` and no `coordinator`; a public one
 * has no `companyName`. A shared clause list would silently match nothing on
 * half the fields.
 */
test('in-house search names company/contact fields and no public field', () => {
  const keys = buildRegistrationFilter({ q: 'x', source: 'inhouse' }).$or.map((c) => Object.keys(c)[0]);
  assert.deepEqual(keys, ['companyName', 'contactFirstName', 'contactLastName', 'contactEmail']);
});

test('public search names course/coordinator fields and no in-house field', () => {
  const keys = buildRegistrationFilter({ q: 'x', source: 'public' }).$or.map((c) => Object.keys(c)[0]);
  assert.deepEqual(keys, ['courseName', 'coordinator.firstName', 'coordinator.lastName', 'coordinator.email']);
});

test('in-house search does NOT match coursesInterested — it holds codes, not names', () => {
  const keys = buildRegistrationFilter({ q: 'Power BI', source: 'inhouse' }).$or.map((c) => Object.keys(c)[0]);
  assert.ok(!keys.includes('coursesInterested'));
});

test('status, search and range compose into one filter', () => {
  // `contacted` was the status here and is now retired, so it would compose to
  // nothing and this test would be checking two clauses instead of three.
  const filter = buildRegistrationFilter({
    status: 'pending', q: 'cpn', source: 'inhouse', range: 'month', now: NOW,
  });
  assert.deepEqual(filter.status.$in.sort(), ['contacted', 'new', 'pending']);
  assert.equal(filter.$or.length, 4);
  assert.equal(filter.createdAt.$gte.getDate(), 1);
});

test('`source` is never itself a filter field — it selects the collection', () => {
  for (const source of ['inhouse', 'public']) {
    const filter = buildRegistrationFilter({ source, q: 'x', status: 'new', range: 'today', now: NOW });
    assert.ok(!('source' in filter), 'source must not appear as a query field');
  }
});
