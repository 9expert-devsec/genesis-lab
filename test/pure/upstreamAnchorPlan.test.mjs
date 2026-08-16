import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planAnchorBackfill,
  resolveAnchorWrite,
  isAnchorShaped,
  indexUpstreamByCode,
  ANCHOR,
  UNANCHORABLE,
} from '@/lib/courses/upstreamAnchorPlan';

/**
 * THE TWO DECISIONS A BACKFILL OF AN IDENTITY FIELD MUST GET RIGHT.
 *
 * Both are driven from fixtures because neither has a live instance. Measured
 * 2026-08-16 (scripts/audit-extension-upstream-id): 79 extension rows, 79
 * upstream courses, all 79 resolving to exactly one `_id`, no duplicate codes,
 * no duplicate ids. So today there is nothing ambiguous to observe and nothing
 * conflicting to observe — and the second one must NEVER be observable,
 * because observing it would mean a wrong anchor had already been written.
 *
 * A wrong anchor is the failure mode worth the fixtures: after it is written it
 * is indistinguishable from a right one, and it would be believed by exactly
 * the guard that exists to stop two courses' genesis rows being merged.
 */

const OID_A = '6512ab34cd56ef7890123456';
const OID_B = 'aa11bb22cc33dd44ee55ff66';

const up = (course_id, _id) => ({ course_id, _id });
const row = (courseId, upstreamId = '') => ({ courseId, upstreamId });

// ── The shape gate ──────────────────────────────────────────────────────────

test('an anchor must look like an ObjectId', () => {
  assert.equal(isAnchorShaped(OID_A), true);
  assert.equal(isAnchorShaped(OID_A.toUpperCase()), true);
  for (const bad of ['', '   ', null, undefined, 'not-an-id', OID_A.slice(0, 23), `${OID_A}0`, '[object Object]', 123]) {
    assert.equal(isAnchorShaped(bad), false, `${JSON.stringify(bad)} was accepted as an anchor`);
  }
});

// ══ ASSERTION: A CONFLICTING ANCHOR IS REPORTED AND NOT OVERWRITTEN ════════

test('a stored anchor that DISAGREES is never overwritten', () => {
  const v = resolveAnchorWrite({ stored: OID_A, supplied: OID_B });
  assert.equal(v.action, ANCHOR.CONFLICT);
  assert.equal(v.stored, OID_A, 'the conflict verdict drops the value it must preserve');
});

test('a conflicting row is REPORTED, and is not in the write set', () => {
  const plan = planAnchorBackfill({
    rows: [row('MSE-L1', OID_A)],
    upstream: [up('MSE-L1', OID_B)],
  });
  assert.deepEqual(plan.write, [], 'a conflicting row was queued for writing');
  assert.equal(plan.conflicts.length, 1, 'the disagreement was not reported');
  assert.equal(plan.conflicts[0].stored, OID_A, 'the report does not carry the stored anchor');
  assert.equal(plan.conflicts[0].upstreamId, OID_B, 'the report does not carry what the code now resolves to');
  assert.equal(plan.clean, false, 'a run with a conflict reported itself as clean');
});

test('an anchor that already AGREES is a no-op, so a re-run writes nothing', () => {
  const plan = planAnchorBackfill({
    rows: [row('MSE-L1', OID_A)],
    upstream: [up('MSE-L1', OID_A)],
  });
  assert.deepEqual(plan.write, []);
  assert.equal(plan.alreadyAnchored.length, 1);
  assert.equal(plan.conflicts.length, 0, 'agreement was reported as a conflict');
  assert.equal(plan.clean, true);
});

test('casing in the stored anchor is agreement, not conflict', () => {
  // Hex is hex. A row whose anchor was stored uppercase is the same anchor, and
  // calling that a conflict would manufacture a finding out of nothing.
  const plan = planAnchorBackfill({
    rows: [row('MSE-L1', OID_A.toUpperCase())],
    upstream: [up('MSE-L1', OID_A)],
  });
  assert.equal(plan.conflicts.length, 0, plan.conflicts.map((c) => c.courseId).join(','));
  assert.equal(plan.alreadyAnchored.length, 1);
});

// ══ ASSERTION: AN AMBIGUOUS ROW IS LEFT EMPTY, NOT FILLED ═════════════════

test('a code held by TWO upstream courses is left empty, and both candidates are named', () => {
  const plan = planAnchorBackfill({
    rows: [row('MSE-L1')],
    upstream: [up('MSE-L1', OID_A), up('mse-l1', OID_B)],
  });
  assert.deepEqual(plan.write, [], 'an ambiguous row was given a guessed anchor');
  assert.equal(plan.unanchorable.length, 1);
  assert.equal(plan.unanchorable[0].reason, UNANCHORABLE.AMBIGUOUS_UPSTREAM);
  assert.deepEqual(
    plan.unanchorable[0].candidates.map((c) => c._id).sort(),
    [OID_A, OID_B].sort(),
    'the report does not name what it refused to choose between'
  );
});

test('a code no upstream course carries is left empty, with that reason', () => {
  const plan = planAnchorBackfill({
    rows: [row('ZZTEST-EXCEL-01')],
    upstream: [up('EXCEL-HR-01', OID_A)],
  });
  assert.deepEqual(plan.write, []);
  assert.equal(plan.unanchorable.length, 1);
  assert.equal(plan.unanchorable[0].reason, UNANCHORABLE.NO_UPSTREAM_MATCH);
  assert.equal(plan.unanchorable[0].stored, null);
});

test('a resolved course whose upstream _id is unusable is left empty, and says so', () => {
  // Distinct from "no match": the row is fine and upstream is the problem.
  for (const bad of [null, '', 'not-an-id']) {
    const plan = planAnchorBackfill({ rows: [row('MSE-L1')], upstream: [up('MSE-L1', bad)] });
    assert.deepEqual(plan.write, [], `_id=${JSON.stringify(bad)} was written as an anchor`);
    assert.equal(plan.unanchorable[0].reason, UNANCHORABLE.UPSTREAM_HAS_NO_ID);
  }
});

test('AN UNRESOLVABLE ROW KEEPS AN ANCHOR IT ALREADY HAS', () => {
  /**
   * This is the upstream-only state — genesis holds a code MSDB no longer has —
   * and the anchor is precisely the thing that survives it. Clearing it because
   * the CODE stopped resolving would destroy the signal at the one moment it
   * becomes load-bearing.
   */
  const plan = planAnchorBackfill({
    rows: [row('ZZTEST-EXCEL-01', OID_A)],
    upstream: [up('EXCEL-HR-01', OID_A)],
  });
  assert.deepEqual(plan.write, []);
  assert.equal(plan.unanchorable[0].stored, OID_A, 'the existing anchor was dropped from the report');
  assert.equal(plan.unanchorable[0].reason, UNANCHORABLE.NO_UPSTREAM_MATCH);
});

// ── The ordinary path ───────────────────────────────────────────────────────

test('an empty row that resolves to exactly one course is written', () => {
  const plan = planAnchorBackfill({
    rows: [row('MSE-L1')],
    upstream: [up('MSE-L1', OID_A), up('POWER-BI', OID_B)],
  });
  assert.equal(plan.write.length, 1);
  assert.equal(plan.write[0].upstreamId, OID_A);
  assert.equal(plan.write[0].courseId, 'MSE-L1');
  assert.equal(plan.clean, true);
});

test('matching is case-insensitive, so the mixed-case codes are anchored too', () => {
  // Five live courses are not fully uppercase (audit-course-id-casing). An
  // exact-only match would leave them empty for a reason that is not a reason.
  const plan = planAnchorBackfill({
    rows: [row('POWER-APPS')],
    upstream: [up('Power-Apps', OID_A)],
  });
  assert.equal(plan.write.length, 1, 'a case difference was treated as a detachment');
  assert.equal(plan.write[0].upstreamId, OID_A);
});

test('nothing supplied never clears what is stored', () => {
  for (const bad of ['', null, undefined, 'garbage']) {
    const v = resolveAnchorWrite({ stored: OID_A, supplied: bad });
    assert.equal(v.action, ANCHOR.NONE, `supplied=${JSON.stringify(bad)} produced ${v.action}`);
    assert.equal(v.value, null, 'a no-op verdict carries a value a caller could write');
  }
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: every row lands in exactly one bucket — none is silently dropped', () => {
  /**
   * A row that fell out of the plan would be a row nobody knows was skipped,
   * which is the same failure as guessing: the report would read clean over it.
   */
  const rows = [
    row('MSE-L1'), row('POWER-BI', OID_A), row('CONFLICTED', OID_A),
    row('GONE'), row('DOUBLED'), row('NOIDUP'),
  ];
  const plan = planAnchorBackfill({
    rows,
    upstream: [
      up('MSE-L1', OID_A), up('POWER-BI', OID_A), up('CONFLICTED', OID_B),
      up('DOUBLED', OID_A), up('doubled', OID_B), up('NOIDUP', null),
    ],
  });
  const seen = [
    ...plan.write, ...plan.alreadyAnchored, ...plan.conflicts, ...plan.unanchorable,
  ].map((e) => e.courseId).sort();
  assert.deepEqual(seen, rows.map((r) => r.courseId).sort());
  assert.equal(
    plan.counts.write + plan.counts.alreadyAnchored + plan.counts.conflicts + plan.counts.unanchorable,
    rows.length
  );
  // and the buckets are actually populated — not all six in one pile
  assert.equal(plan.counts.write, 1);
  assert.equal(plan.counts.alreadyAnchored, 1);
  assert.equal(plan.counts.conflicts, 1);
  assert.equal(plan.counts.unanchorable, 3);
});

test('CONTROL: the index keeps duplicates rather than collapsing them', () => {
  // A last-one-wins map would turn the ambiguity this module refuses into a
  // silent single match, and the assertions above would pass forever.
  const idx = indexUpstreamByCode([up('MSE-L1', OID_A), up('mse-l1', OID_B)]);
  assert.equal(idx.get('mse-l1').length, 2);
  assert.equal(idx.size, 1);
});

test('CONTROL: the plan varies with its input and is not a constant', () => {
  const empty = planAnchorBackfill({});
  assert.deepEqual(empty.write, []);
  assert.equal(empty.counts.rows, 0);
  assert.equal(empty.clean, true);
  const one = planAnchorBackfill({ rows: [row('X')], upstream: [up('X', OID_A)] });
  assert.notDeepEqual(one.write, empty.write);
});
