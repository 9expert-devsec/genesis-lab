import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RANGE_VALUES,
  parseDateInput,
  resolveDateWindow,
  courseClause,
  buildRegistrationFilter,
  buildRegistrationScope,
} from '@/lib/registrations/listFilter';

/**
 * THE DATE RANGE AND THE COURSE FILTER, AT THE BUILDER.
 *
 * ══ ASSERTED HERE, INDEPENDENTLY OF THE PAGE — AND THAT IS THE REQUIREMENT ══
 *
 * Round 2 established that an unknown value must degrade to UNFILTERED in TWO
 * layers: the page normalises for the chrome, and the filter builder degrades
 * the query on its own. The reason is that `listRegistrations` is a POST
 * endpoint — every `'use server'` export is — and NEED NOT PASS THROUGH THE
 * PAGE. A degrade that lived only in page.jsx would be absent for any caller
 * that did not come through it.
 *
 * So every degrade below is asserted against the BUILDER, with no page involved.
 *
 * Pure tier: the module imports one import-free sibling and nothing else.
 *
 * ── THE CLOCK IS INJECTED ─────────────────────────────────────────────────
 * `now` is a parameter for the reason this file's subject already documents:
 * "today" moves while the suite runs, and a boundary assertion can only be
 * written against a clock it controls.
 */

/** A Wednesday, mid-afternoon, local. */
const NOW = new Date(2026, 7, 13, 15, 30, 0, 0); // 2026-08-13

// ════════════════════════════════════════════════════════════════════════════
// 1. PARSING — AND WHY NOT `new Date(s)`
// ════════════════════════════════════════════════════════════════════════════

test('a date input parses to LOCAL midnight, not UTC midnight', () => {
  /**
   * ── THE DEFECT THIS AVOIDS, WHICH IS SILENT AND OFF BY HOURS ─────────────
   * `new Date('2026-08-13')` is parsed as UTC midnight by the spec, so read back
   * in Bangkok it is 07:00 on the 13th — and a range naming that day would drop
   * every registration made before 07:00. The rest of this module is careful to
   * use local midnight for exactly this reason.
   */
  const d = parseDateInput('2026-08-13');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 13);
  assert.equal(d.getHours(), 0, 'the parsed date is not at local midnight');
  assert.equal(d.getMinutes(), 0);
  assert.equal(d.getSeconds(), 0);
  assert.equal(d.getMilliseconds(), 0);
});

test('anything that is not YYYY-MM-DD parses to null', () => {
  for (const bad of [
    '', '   ', 'nonsense', '2026-08', '2026', '13/08/2026', '2026-8-13',
    '2026-08-13T00:00:00Z', '0000-00-00', null, undefined, 42, {}, [],
  ]) {
    assert.equal(parseDateInput(bad), null, `${JSON.stringify(bad)} parsed to a date`);
  }
});

test('an IMPOSSIBLE date is rejected rather than rolling over', () => {
  // `new Date(2026, 1, 31)` is 2 March. A filter silently naming a different day
  // than the reader typed is worse than one that ignores the input.
  assert.equal(parseDateInput('2026-02-31'), null, '31 February rolled into March');
  assert.equal(parseDateInput('2026-13-01'), null, 'month 13 was accepted');
  assert.equal(parseDateInput('2026-00-10'), null, 'month 0 was accepted');
  // …and a real leap day IS accepted, so this is not rejecting everything.
  assert.ok(parseDateInput('2024-02-29'), 'a real leap day was rejected');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. ONE WINDOW, TWO WAYS IN
// ════════════════════════════════════════════════════════════════════════════

test('with no custom dates, the chips are the window and one is lit', () => {
  for (const range of RANGE_VALUES) {
    const w = resolveDateWindow({ range, now: NOW });
    assert.equal(w.preset, range, `the ${range} chip is not reported as selected`);
    assert.equal(w.custom, false);
  }
  // …and 'all' really is the absence of a clause, not a clause matching all.
  assert.deepEqual(resolveDateWindow({ range: 'all', now: NOW }).clause, {});
});

test('a custom range WINS and deselects every chip', () => {
  /**
   * The whole point of (a): one value, two ways in. If both applied, a screen
   * could show วันนี้ lit above a table filtered to last March.
   */
  const w = resolveDateWindow({ range: 'today', from: '2026-03-01', to: '2026-03-31', now: NOW });
  assert.equal(w.preset, null, 'a chip stayed lit under a custom range');
  assert.equal(w.custom, true);
  assert.equal(w.clause.createdAt.$gte.getMonth(), 2, 'the custom FROM did not win over the chip');
});

test('an OPEN end is allowed, both ways', () => {
  const since = resolveDateWindow({ from: '2026-08-01', now: NOW });
  assert.ok(since.clause.createdAt.$gte, 'a from-only range has no lower bound');
  assert.equal(since.clause.createdAt.$lte, undefined, 'a from-only range invented an upper bound');

  const until = resolveDateWindow({ to: '2026-08-31', now: NOW });
  assert.ok(until.clause.createdAt.$lte, 'a to-only range has no upper bound');
  assert.equal(until.clause.createdAt.$gte, undefined, 'a to-only range invented a lower bound');
});

test('`to` is INCLUSIVE — a range ending on the 13th includes the 13th', () => {
  const w = resolveDateWindow({ to: '2026-08-13', now: NOW });
  const end = w.clause.createdAt.$lte;
  assert.equal(end.getDate(), 13, 'the upper bound moved to another day');
  assert.equal(end.getHours(), 23);
  assert.equal(end.getMinutes(), 59);
  assert.equal(end.getSeconds(), 59);
  assert.equal(end.getMilliseconds(), 999);
  // A registration made at 15:30 on the 13th — like NOW — is inside it.
  assert.ok(NOW.getTime() <= end.getTime(), 'an afternoon on the final day falls outside the range');
});

test('a REVERSED range is swapped, and says that it was', () => {
  /**
   * Honouring it returns an empty table, which is indistinguishable from "there
   * are no records" — the exact failure the degrade rules exist to prevent.
   * Ignoring it silently drops the reader's input with no sign.
   *
   * So it is swapped, and `swapped` is returned so the UI can say so. A
   * correction the reader cannot see is still the screen deciding for them.
   */
  const w = resolveDateWindow({ from: '2026-08-31', to: '2026-08-01', now: NOW });
  assert.equal(w.swapped, true, 'the swap is not reported');
  assert.equal(w.clause.createdAt.$gte.getDate(), 1, 'the bounds were not swapped');
  assert.equal(w.clause.createdAt.$lte.getDate(), 31);
  assert.ok(w.clause.createdAt.$gte.getTime() < w.clause.createdAt.$lte.getTime(),
    'the range is still empty after the swap');

  // A correctly-ordered range is NOT reported as swapped.
  assert.equal(resolveDateWindow({ from: '2026-08-01', to: '2026-08-31', now: NOW }).swapped, false);
  // …nor is a single-day range, where the two bounds are the same date.
  const oneDay = resolveDateWindow({ from: '2026-08-13', to: '2026-08-13', now: NOW });
  assert.equal(oneDay.swapped, false, 'a single-day range was reported as swapped');
  assert.ok(oneDay.clause.createdAt.$gte.getTime() < oneDay.clause.createdAt.$lte.getTime());
});

// ════════════════════════════════════════════════════════════════════════════
// 3. DEGRADE — AT THE BUILDER, INDEPENDENTLY OF THE PAGE
// ════════════════════════════════════════════════════════════════════════════

test('an UNPARSEABLE date degrades to unfiltered, never to an empty table', () => {
  /**
   * ── THE DEGRADE THAT MATTERS, AND THE SHAPE IT MUST NOT TAKE ─────────────
   * A clause built from an invalid date is either `{ $gte: Invalid Date }` —
   * which matches NOTHING — or it throws. Both render an empty list, and an
   * empty list is indistinguishable from "all your records are gone".
   */
  for (const bad of ['nonsense', '2026-13-45', '2026-02-31', 'DROP TABLE', '../../etc', '2026']) {
    const w = resolveDateWindow({ from: bad, to: bad, now: NOW });
    assert.deepEqual(w.clause, {}, `${bad} produced a date clause`);
    assert.equal(w.custom, false, `${bad} was treated as a custom range`);

    const filter = buildRegistrationFilter({ from: bad, to: bad, now: NOW });
    assert.equal('createdAt' in filter, false, `${bad} reached the query as a createdAt clause`);
  }
});

test('ONE unparseable bound does not discard the other', () => {
  // Half a range is still a range. Dropping both because one is malformed would
  // silently widen the query past what the reader asked for.
  const w = resolveDateWindow({ from: '2026-08-01', to: 'nonsense', now: NOW });
  assert.ok(w.clause.createdAt.$gte, 'a valid FROM was discarded because TO was invalid');
  assert.equal(w.clause.createdAt.$lte, undefined);
  assert.equal(w.custom, true);
});

test('an UNKNOWN course degrades to unfiltered', () => {
  for (const bad of ['', '   ', 'all', null, undefined]) {
    assert.deepEqual(courseClause(bad, 'public'), {}, `${JSON.stringify(bad)} produced a clause`);
    assert.deepEqual(courseClause(bad, 'inhouse'), {});
    const filter = buildRegistrationFilter({ course: bad, now: NOW });
    assert.equal('$and' in filter, false, `${JSON.stringify(bad)} reached the query`);
  }
});

test('a course NOT IN THE DATA still filters — it is not silently ignored', () => {
  /**
   * The other direction, and it is deliberate. A code no registration holds
   * produces an EMPTY list, and that is correct: the reader asked "which of
   * these records are for course X" and the answer is none.
   *
   * That is not the same as the degrade above. `all`/empty means "no opinion";
   * a real-looking code means "this one", and answering a specific question with
   * the unfiltered list would be worse than answering it with nothing.
   */
  const filter = buildRegistrationFilter({ course: 'NO-SUCH-COURSE', now: NOW });
  assert.deepEqual(filter.$and, [{ $or: [{ courseCode: 'NO-SUCH-COURSE' }, { courseId: 'NO-SUCH-COURSE' }] }]);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE TWO SOURCES REFERENCE COURSES DIFFERENTLY
// ════════════════════════════════════════════════════════════════════════════

test('public matches the scalar pair; in-house matches the ARRAY', () => {
  assert.deepEqual(courseClause('MSE-L2', 'public'),
    { $or: [{ courseCode: 'MSE-L2' }, { courseId: 'MSE-L2' }] });
  // Mongo matches an array field against a scalar by element, which is the
  // intended meaning: an enquiry listing several courses including this one.
  assert.deepEqual(courseClause('MSE-L2', 'inhouse'), { coursesInterested: 'MSE-L2' });
});

test('CONTROL: the two clauses are not interchangeable', () => {
  // If one were used for both sources it would match nothing on the other, and
  // the filter would hide every row while looking correct.
  const pub = JSON.stringify(courseClause('MSE-L2', 'public'));
  const inh = JSON.stringify(courseClause('MSE-L2', 'inhouse'));
  assert.notEqual(pub, inh, 'the two sources produce the same course clause');
  assert.ok(!pub.includes('coursesInterested'), 'the public clause names the in-house field');
  assert.ok(!inh.includes('courseCode'), 'the in-house clause names a public field');
});

// ════════════════════════════════════════════════════════════════════════════
// 5. THE COURSE CLAUSE COMPOSES WITH THE SEARCH RATHER THAN REPLACING IT
// ════════════════════════════════════════════════════════════════════════════

test('a search AND a course both apply — neither silently drops the other', () => {
  /**
   * ── THE BUG THIS PINS, AND IT IS ONE LINE AWAY ──────────────────────────
   * The public course clause is itself an `$or`, and the search sets
   * `filter.$or`. Assigning the second would REPLACE the first — a screen where
   * typing a name and picking a course quietly ignores the name — and an object
   * literal cannot hold two `$or` keys anyway.
   */
  const filter = buildRegistrationFilter({ q: 'สมชาย', course: 'MSE-L2', source: 'public', now: NOW });
  assert.ok(Array.isArray(filter.$or), 'the search clause was lost');
  assert.ok(filter.$or.some((c) => c.courseName), 'the $or is not the search clause');
  assert.ok(Array.isArray(filter.$and), 'the course clause was lost');
  assert.deepEqual(filter.$and, [{ $or: [{ courseCode: 'MSE-L2' }, { courseId: 'MSE-L2' }] }]);
});

// ════════════════════════════════════════════════════════════════════════════
// 6. ONE SET — THE CARDS, THE BADGES, THE HEADER AND THE PAGER
// ════════════════════════════════════════════════════════════════════════════

test('the SCOPE is what every number on the screen counts inside', () => {
  /**
   * ══ THE `q` DEFECT, AS A BEHAVIOUR ASSERTION ══════════════════════════════
   *
   * The stat cards, the toggle badges, the "N รายการ" header and the pager must
   * all count the SAME SET. Three of the four read `buildRegistrationScope`
   * directly; the header and the pager derive from the list query's own `total`,
   * which is `buildRegistrationFilter` — the scope PLUS a status clause.
   *
   * So the claim reduces to: the filter is the scope plus status, and NOTHING
   * ELSE. If a dimension reached one and not the other, the table and the cards
   * would answer differently — which is exactly what `q` did until this commit,
   * and `range` did before it.
   *
   * Asserted against BEHAVIOUR (the objects the builders return) rather than
   * against the shape of the call sites, which is what fs/registrationsFilterWiring
   * covers. The two together are the seam.
   */
  const dims = { q: 'สมชาย', range: 'all', from: '2026-08-01', to: '2026-08-31', course: 'MSE-L2' };
  const scope = buildRegistrationScope({ ...dims, source: 'public', now: NOW });
  const filter = buildRegistrationFilter({ ...dims, status: 'all', source: 'public', now: NOW });

  assert.deepEqual(filter, scope,
    'with no status, the list filter and the shared scope are not the same query — '
    + 'a dimension reaches one and not the other');

  // …and with a status, the filter is the scope plus exactly that one key.
  const withStatus = buildRegistrationFilter({ ...dims, status: 'pending', source: 'public', now: NOW });
  const extra = Object.keys(withStatus).filter((k) => !(k in scope));
  assert.deepEqual(extra, ['status'], `the filter adds ${extra.join(', ')} beyond the scope and a status`);
});

test('EVERY dimension moves the scope — none is silently ignored', () => {
  /**
   * The set check in fs/registrationsFilterWiring proves each dimension is
   * PASSED. This proves each one DOES something: a parameter threaded through
   * four call sites and then dropped by the builder would satisfy every source
   * assertion and change no number at all.
   *
   * `q` is the reason this exists. It was in the builder's signature and in the
   * scope the whole time — page.jsx simply never sent it — so a test that only
   * read the builder would have called the screen correct.
   */
  const base = buildRegistrationScope({ source: 'public', now: NOW });
  assert.deepEqual(base, {}, 'the empty scope is not empty — something filters by default');

  const moves = {
    q:      { q: 'สมชาย' },
    range:  { range: 'today' },
    from:   { from: '2026-08-01' },
    to:     { to: '2026-08-31' },
    course: { course: 'MSE-L2' },
  };
  for (const [dim, input] of Object.entries(moves)) {
    const scope = buildRegistrationScope({ ...input, source: 'public', now: NOW });
    assert.notDeepEqual(scope, base, `\`${dim}\` changed nothing — it is threaded but ignored`);
  }
});

test('CONTROL: the search dimension really differs BY SOURCE', () => {
  // The badge for the other source counts what ITS table would show. If the
  // search clause ignored `source`, a public search term would be matched
  // against public field names on the in-house collection and the badge would
  // read 0 for every search.
  const pub = buildRegistrationScope({ q: 'สมชาย', source: 'public', now: NOW });
  const inh = buildRegistrationScope({ q: 'สมชาย', source: 'inhouse', now: NOW });
  assert.notDeepEqual(pub.$or, inh.$or, 'both sources search the same fields');
  assert.ok(pub.$or.some((c) => c.courseName), 'the public search does not name a public field');
  assert.ok(inh.$or.some((c) => c.companyName), 'the in-house search does not name an in-house field');
});

test('every filter dimension composes into ONE query', () => {
  // status + search + date + course, all at once — the shape a real screen
  // produces once the panel exists. Each must survive the others.
  const filter = buildRegistrationFilter({
    status: 'pending', q: 'สมชาย', course: 'MSE-L2',
    from: '2026-08-01', to: '2026-08-31', source: 'public', now: NOW,
  });
  assert.ok(filter.status?.$in?.includes('pending'), 'the status was lost');
  assert.ok(filter.$or, 'the search was lost');
  assert.ok(filter.createdAt?.$gte && filter.createdAt?.$lte, 'the date range was lost');
  assert.ok(filter.$and, 'the course was lost');
});
