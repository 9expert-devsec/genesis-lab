import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSchedulePublicVisibility } from '@/lib/webhooks/schedulePublicVisibility';

// Upstream's /schedules read endpoint silently drops rows that fail any of three
// criteria (docs/api-domains.md:276-278). This predicate re-evaluates them at
// webhook receive time so the audit trail says WHY a row will be invisible,
// instead of logging "ok" and nothing else.
//
// The incident: PYTHON-L1 (course 69267e3bbbad44df87120492) vanished from
// /schedule. Its schedule 6931505831d45afebddb77d7 was `status: "open"` with
// three future dates — and `signup_url: ""`, which is all upstream needed to
// exclude it. That empty string was in webhook_logs.payload.data from the moment
// it arrived and nothing read it.

const REF = new Date('2026-07-27T00:00:00.000Z'); // "today" during the incident

const VALID = {
  _id: '6a101561ef482973a440eef9',
  status: 'open',
  type: 'classroom',
  signup_url: 'https://www.9experttraining.com/registration/public?class=6a10',
  dates: [
    '2026-08-17T00:00:00.000Z',
    '2026-08-18T00:00:00.000Z',
    '2026-08-19T00:00:00.000Z',
  ],
};

const criteria = (r) => r.failures.map((f) => f.criterion).sort();
const doubts = (r) => r.uncertainties.map((f) => f.criterion).sort();

test('a fully valid row is visible with no failures', () => {
  const r = assessSchedulePublicVisibility(VALID, REF);
  assert.equal(r.visible, true);
  assert.equal(r.certain, true);
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.uncertainties, []);
});

test('THE INCIDENT: schedule 6931505831d45afebddb77d7 fails on signup_url alone', () => {
  // Verbatim from webhook_logs.payload.data — the real row, the real values.
  const incident = {
    _id: '6931505831d45afebddb77d7',
    status: 'open',
    type: 'classroom',
    signup_url: '',
    dates: [
      '2026-09-14T00:00:00.000Z',
      '2026-09-15T00:00:00.000Z',
      '2026-09-16T00:00:00.000Z',
    ],
  };

  const r = assessSchedulePublicVisibility(incident, REF);

  assert.equal(r.visible, false, 'the row upstream refuses to return is not "visible"');
  assert.equal(r.certain, true, 'and we KNOW why — nothing about this row was undecidable');
  assert.deepEqual(r.uncertainties, [], 'status "open" is exact-cased, so no doubt is raised');
  assert.equal(r.failures.length, 1, 'EXACTLY one criterion failed — status and dates were fine');
  assert.equal(r.failures[0].criterion, 'signup_url');
  assert.equal(r.failures[0].value, '', 'the raw value is preserved for the audit entry');
  assert.match(
    r.failures[0].reason,
    /signup_url is empty → row will not appear in \/schedules responses/
  );
});

// ── status: three outcomes, not two ─────────────────────────────────────────
// A lenient (trim/case-folded) match is NOT a pass. We cannot verify whether
// upstream's filter compares case-sensitively, and resolving that unknown as
// "visible" produces no warning — so if upstream IS case-sensitive the row
// disappears in exactly the silence this module exists to break. See the
// VISIBLE_STATUSES note in schedulePublicVisibility.js.

test('EXACT-case status passes cleanly — no failure, no doubt', () => {
  for (const status of ['open', 'nearly_full']) {
    const r = assessSchedulePublicVisibility({ ...VALID, status }, REF);
    assert.equal(r.visible, true, `${status} is an exact upstream status`);
    assert.equal(r.certain, true);
    assert.deepEqual(r.failures, [], `${status} raises no failure`);
    assert.deepEqual(r.uncertainties, [], `${status} raises no doubt either`);
  }
});

test('status "Open" is AMBIGUOUS — not a pass, not a hard failure, and it names the raw value', () => {
  const r = assessSchedulePublicVisibility({ ...VALID, status: 'Open' }, REF);

  assert.equal(r.visible, false, 'an unresolved question is not a pass');
  assert.equal(r.certain, false, 'and it is flagged as undecided, not as fact');
  assert.deepEqual(r.failures, [], 'NOT a hard failure — we do not know that upstream drops it');
  assert.deepEqual(doubts(r), ['status']);
  assert.equal(r.uncertainties[0].value, 'Open', 'the RAW value is preserved, un-folded');
  assert.match(
    r.uncertainties[0].reason,
    /status is "Open" — matches "open" only after trimming\/case-folding, and upstream's own comparison is UNVERIFIED → row MAY not appear in \/schedules responses/
  );
});

test('status " open " is AMBIGUOUS on whitespace alone, raw value preserved', () => {
  const r = assessSchedulePublicVisibility({ ...VALID, status: ' open ' }, REF);
  assert.equal(r.visible, false);
  assert.equal(r.certain, false);
  assert.deepEqual(r.failures, []);
  assert.deepEqual(doubts(r), ['status']);
  assert.equal(r.uncertainties[0].value, ' open ', 'raw value keeps its whitespace');
  assert.match(r.uncertainties[0].reason, /matches "open" only after trimming\/case-folding/);
});

test('status "NEARLY_FULL" is AMBIGUOUS — case-folding applies to both accepted statuses', () => {
  const r = assessSchedulePublicVisibility({ ...VALID, status: 'NEARLY_FULL' }, REF);
  assert.equal(r.visible, false);
  assert.equal(r.certain, false);
  assert.deepEqual(r.failures, []);
  assert.deepEqual(doubts(r), ['status']);
  assert.equal(r.uncertainties[0].value, 'NEARLY_FULL');
  assert.match(r.uncertainties[0].reason, /matches "nearly_full" only after trimming\/case-folding/);
});

test('CATEGORY CONTROL: status "full" is a HARD failure and never ambiguous', () => {
  // The control that stops the two categories collapsing into one. "full" does
  // not match upstream's list under ANY normalisation, so there is nothing
  // uncertain about it — treating it as a doubt would dilute a known fact.
  const r = assessSchedulePublicVisibility({ ...VALID, status: 'full' }, REF);

  assert.equal(r.visible, false);
  assert.equal(r.certain, true, 'a definite failure leaves NOTHING uncertain');
  assert.deepEqual(criteria(r), ['status']);
  assert.deepEqual(r.uncertainties, [], 'a hard failure must not leak into uncertainties');
  assert.equal(r.failures[0].value, 'full', 'raw status echoed back');
  assert.match(r.failures[0].reason, /status is "full" — not open\/nearly_full/);
  assert.match(r.failures[0].reason, /→ row will not appear in \/schedules responses/,
    'definite consequence wording — "will", not "MAY"');
});

test('ambiguous status AND empty signup_url: both reported, and the fact stays distinguishable from the doubt', () => {
  const r = assessSchedulePublicVisibility(
    { ...VALID, status: 'Open', signup_url: '' },
    REF
  );

  assert.equal(r.visible, false);
  assert.equal(r.certain, false);
  // The known reason upstream drops it...
  assert.deepEqual(criteria(r), ['signup_url']);
  assert.match(r.failures[0].reason, /signup_url is empty → row will not appear/);
  // ...and the separate open question. Two arrays, so a caller can never count
  // the guess as a second fact.
  assert.deepEqual(doubts(r), ['status']);
  assert.match(r.uncertainties[0].reason, /UNVERIFIED → row MAY not appear/);
  assert.equal(r.failures.length + r.uncertainties.length, 2);
});

test('all dates in the past fail the dates criterion', () => {
  const past = {
    ...VALID,
    dates: ['2026-07-20T00:00:00.000Z', '2026-07-21T00:00:00.000Z'],
  };
  const r = assessSchedulePublicVisibility(past, REF);
  assert.equal(r.visible, false);
  assert.deepEqual(criteria(r), ['dates']);
  assert.deepEqual(r.failures[0].value, past.dates, 'raw dates echoed back');
  assert.match(r.failures[0].reason, /no date is on or after 2026-07-27 \(latest is 2026-07-21\)/);
});

test('all three criteria failing at once are ALL reported, not just the first', () => {
  const doomed = {
    _id: 'x',
    status: 'full',
    signup_url: '',
    dates: ['2026-01-05T00:00:00.000Z'],
  };
  const r = assessSchedulePublicVisibility(doomed, REF);
  assert.equal(r.visible, false);
  assert.deepEqual(criteria(r), ['dates', 'signup_url', 'status'],
    'a row can be invisible for more than one reason and the log must say all of them');
  assert.equal(r.failures.length, 3);
});

test('BOUNDARY: a row whose only date IS the reference date is still visible (>=, not >)', () => {
  // Pins the comparison as ">= today". A session running TODAY is still open for
  // business; flipping this to ">" would silently warn on every same-day row.
  const today = {
    ...VALID,
    dates: ['2026-07-27T00:00:00.000Z'], // exactly REF
  };
  const r = assessSchedulePublicVisibility(today, REF);
  assert.equal(r.visible, true, 'same-day session counts as future');
  assert.deepEqual(r.failures, []);

  // ...and one day earlier does NOT — proving the boundary is where it claims.
  const yesterday = { ...VALID, dates: ['2026-07-26T00:00:00.000Z'] };
  assert.equal(assessSchedulePublicVisibility(yesterday, REF).visible, false,
    'the day before the reference date is excluded — the boundary is real');
});

test('degenerate payloads (missing fields, empty dates) fail loudly rather than throwing', () => {
  const r = assessSchedulePublicVisibility({}, REF);
  assert.equal(r.visible, false);
  assert.deepEqual(criteria(r), ['dates', 'signup_url', 'status']);
  assert.match(r.failures.find((f) => f.criterion === 'status').reason, /status is missing/);
  assert.match(r.failures.find((f) => f.criterion === 'dates').reason, /no usable date on the row/);
  // null/undefined input must not throw either — a webhook handler cannot crash.
  assert.equal(assessSchedulePublicVisibility(null, REF).visible, false);
  assert.equal(assessSchedulePublicVisibility(undefined, REF).visible, false);
});

// META-CONTROL #1 — proves `failures` is MEASURED, not a constant. Stub
// `failures` to always return [] in schedulePublicVisibility.js and this goes
// red: the invisible row stops reporting a reason. Verified by hand, reverted.
// Without this, a predicate that never explains itself passes every "is it
// visible" assertion that only checks the boolean.
test('CONTROL: failures is measured — an invisible row names its criterion, a visible one names nothing', () => {
  const bad = assessSchedulePublicVisibility({ ...VALID, signup_url: '' }, REF);
  const good = assessSchedulePublicVisibility(VALID, REF);

  assert.equal(bad.failures.length, 1, 'a failing row MUST produce a failure entry');
  assert.equal(bad.failures[0].criterion, 'signup_url', 'and it must name the right criterion');
  assert.ok(bad.failures[0].reason.length > 0, 'with a non-empty human reason');
  assert.equal(good.failures.length, 0, 'a passing row must produce NONE');
});

// META-CONTROL #2 — proves `visible` is DERIVED, not a constant. Stub `visible`
// to always return true and this goes red. Separate from #1 on purpose: the two
// halves of the return value can rot independently, and a hardcoded `visible`
// survives every failures-only assertion in this file.
test('CONTROL: visible is derived — it flips with the criteria, and tracks BOTH arrays exactly', () => {
  const rows = [
    [VALID, true],
    [{ ...VALID, signup_url: '' }, false],
    [{ ...VALID, status: 'full' }, false],
    [{ ...VALID, dates: ['2026-01-01T00:00:00.000Z'] }, false],
    [{ ...VALID, status: 'nearly_full' }, true],
    [{ ...VALID, status: 'Open' }, false], // ambiguity must ALSO drive visible
  ];
  const seen = new Set();
  for (const [row, expected] of rows) {
    const r = assessSchedulePublicVisibility(row, REF);
    assert.equal(r.visible, expected, `visible should be ${expected} for ${JSON.stringify(row.status)}/${JSON.stringify(row.signup_url)}`);
    // the invariant that binds the halves together — an open question is not a pass
    assert.equal(
      r.visible,
      r.failures.length === 0 && r.uncertainties.length === 0,
      'visible must equal "no failures AND no uncertainties"'
    );
    assert.equal(r.certain, r.uncertainties.length === 0, 'certain must equal "no uncertainties"');
    seen.add(r.visible);
  }
  assert.equal(seen.size, 2, 'the predicate must return BOTH values — a constant cannot');
});

// META-CONTROL #3 — proves the AMBIGUITY BRANCH is real. Stub it to fall through
// to the exact-match pass (i.e. treat a case-folded match as visible) and this
// goes red naming the raw value. Verified by hand, reverted.
//
// Without it, the three-way status logic could silently collapse back to the
// two-way case-insensitive compare it replaced, and every other test in this
// file that only checks `visible` on exact-cased rows would still pass.
test('CONTROL: the ambiguity branch is real — odd casing is neither a pass nor a hard failure', () => {
  const exact = assessSchedulePublicVisibility({ ...VALID, status: 'open' }, REF);
  const odd = assessSchedulePublicVisibility({ ...VALID, status: 'Open' }, REF);
  const bad = assessSchedulePublicVisibility({ ...VALID, status: 'full' }, REF);

  // All three outcomes must be genuinely distinct — collapse any pair and this fails.
  assert.equal(exact.visible, true, 'exact casing passes');
  assert.equal(odd.visible, false, 'odd casing does NOT pass — this is the whole point');
  assert.equal(bad.visible, false, 'an unmatched status does not pass either');

  assert.equal(odd.certain, false, 'odd casing is undecided...');
  assert.equal(bad.certain, true, '...whereas an unmatched status is decided');

  assert.equal(odd.uncertainties.length, 1, 'odd casing produces a doubt entry');
  assert.equal(odd.failures.length, 0, 'and NOT a failure entry');
  assert.equal(bad.uncertainties.length, 0, 'an unmatched status produces no doubt');
  assert.equal(bad.failures.length, 1, 'it produces a failure');

  // The entry must carry the raw value — a folded value would hide what arrived.
  assert.equal(odd.uncertainties[0].value, 'Open');
  assert.match(odd.uncertainties[0].reason, /"Open"/, 'the reason quotes the RAW status');
});
