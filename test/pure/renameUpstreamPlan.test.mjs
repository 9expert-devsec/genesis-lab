import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUpstreamWrite,
  proveSelfUpstream,
  isTimeoutError,
  UPSTREAM_OUTCOME,
  UPSTREAM_REASON,
  SELF_UPSTREAM,
} from '@/lib/courses/renameUpstreamPlan';

/**
 * THE UPSTREAM HALF, DECIDED FROM A READ-BACK.
 *
 * Every case here is one the live system cannot be asked to produce: MSDB
 * cannot be made to time out, to answer 2xx without applying, or to lose a row
 * mid-rename. They are the outcomes that decide whether genesis is touched at
 * all, so they are built as fixtures rather than waited for.
 *
 * The one that matters most is the TIMEOUT. `fetchWithTimeout` aborts the
 * CLIENT and never the server, so a timed-out write may have applied, may be
 * applying, or may never have been read. Calling that "failed" is how a rename
 * that actually landed becomes an upstream-only divergence nobody looks for.
 */

const OLD = 'ZZTEST-EXCEL-01';
const NEW = 'EXCEL-HR-01';
const ANCHOR = '6a7a97f0b830e289fc383406';

const row = (course_id, _id = ANCHOR) => ({ course_id, _id });
const timeout = { message: '[msdb-write] PUT /public-course/x timed out after 10000ms', timeout: true };
const refusal = { message: '[msdb-write] PUT /public-course/x → 400 Bad Request', timeout: false };

const classify = (over = {}) =>
  classifyUpstreamWrite({ oldCode: OLD, newCode: NEW, ...over });

// ══ SUCCESS IS A READ-BACK, NOT A RESPONSE CODE ═══════════════════════════

test('a clean call whose read-back shows the NEW code is APPLIED', () => {
  const v = classify({ row: row(NEW) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.APPLIED);
  assert.equal(v.reason, UPSTREAM_REASON.READ_CONFIRMS_NEW);
  assert.equal(v.wroteUpstream, true);
});

test('A 2xx WHOSE READ-BACK STILL SHOWS THE OLD CODE IS NOT SUCCESS', () => {
  /**
   * The whole reason the response is not the evidence. The write returned
   * cleanly — no error at all — and the field did not move.
   */
  const v = classify({ row: row(OLD) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.NOT_APPLIED);
  assert.equal(v.reason, UPSTREAM_REASON.READ_STILL_OLD);
  assert.equal(v.wroteUpstream, false);
});

test('a REFUSED call whose row is untouched is a clean refusal', () => {
  const v = classify({ error: refusal, row: row(OLD) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.REFUSED);
  assert.equal(v.wroteUpstream, false, 'a refusal must be able to claim nothing moved');
});

test('THE READ-BACK OUTRANKS THE RESPONSE, even when the call reported failure', () => {
  /**
   * A wrapper that reported an error over a write that landed is exactly the
   * case where believing the response loses the row: the action would report
   * failure, skip genesis, and leave an upstream-only divergence it never
   * mentioned.
   */
  const v = classify({ error: refusal, row: row(NEW) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.APPLIED);
  assert.equal(v.reason, UPSTREAM_REASON.CONTRADICTION, 'the contradiction is not surfaced');
});

// ══ A TIMEOUT IS UNKNOWN, NEVER FAILURE ═══════════════════════════════════

test('A TIMEOUT WHOSE READ-BACK STILL SHOWS THE OLD CODE IS UNKNOWN, NOT FAILURE', () => {
  /**
   * The read tells us it had not applied AT THE MOMENT WE LOOKED. The request
   * was abandoned client-side and was never withdrawn from the server, so that
   * is not the same as "it will not". The only available conclusion is that we
   * do not know.
   */
  const v = classify({ error: timeout, row: row(OLD) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.UNKNOWN);
  assert.equal(v.reason, UPSTREAM_REASON.TIMEOUT_UNCONFIRMED);
  assert.equal(v.wroteUpstream, null, 'unknown must be tri-state — null, never false');
});

test('a timeout whose read-back shows the NEW code IS applied', () => {
  // Branching on which code comes back is the whole point of re-reading.
  const v = classify({ error: timeout, row: row(NEW) });
  assert.equal(v.outcome, UPSTREAM_OUTCOME.APPLIED);
  assert.equal(v.wroteUpstream, true);
});

test('a FAILED read-back is UNKNOWN whatever the write said', () => {
  for (const error of [null, timeout, refusal]) {
    const v = classify({ error, readFailed: true, row: null });
    assert.equal(v.outcome, UPSTREAM_OUTCOME.UNKNOWN, `error=${error?.timeout}`);
    assert.equal(v.reason, UPSTREAM_REASON.READ_FAILED);
  }
});

test('a row that vanished, or carries a third code, is UNKNOWN rather than guessed', () => {
  assert.equal(classify({ row: null }).outcome, UPSTREAM_OUTCOME.UNKNOWN);
  assert.equal(classify({ row: null }).reason, UPSTREAM_REASON.ROW_GONE);
  const third = classify({ row: row('SOMETHING-ELSE') });
  assert.equal(third.outcome, UPSTREAM_OUTCOME.UNKNOWN);
  assert.equal(third.reason, UPSTREAM_REASON.ROW_THIRD_CODE);
});

test('the timeout detector reads the wrapper message AND the abort name', () => {
  assert.equal(isTimeoutError(new Error('[msdb-write] PUT /x timed out after 10000ms')), true);
  assert.equal(isTimeoutError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isTimeoutError(new Error('400 Bad Request')), false);
  assert.equal(isTimeoutError(null), false);
});

// ══ THE ANCHOR IS A PROOF, AND ITS ABSENCE IS A REFUSAL ═══════════════════

test('a matching anchor PROVES the upstream row is this same course', () => {
  const v = proveSelfUpstream({ anchor: ANCHOR, upstreamRow: row(NEW) });
  assert.equal(v.proven, true);
  assert.equal(v.reason, SELF_UPSTREAM.PROVEN);
});

test('anchor casing is not a difference — hex is hex', () => {
  assert.equal(proveSelfUpstream({ anchor: ANCHOR.toUpperCase(), upstreamRow: row(NEW) }).proven, true);
});

test('NO ANCHOR IS A REFUSAL, and never falls back to comparing codes', () => {
  /**
   * An empty anchor is "identity unknown", not "no objection". The reason is
   * distinct from a mismatch so a caller can tell the operator what to DO —
   * run the backfill — rather than telling them the courses differ, which is
   * not something an absent anchor establishes.
   */
  for (const anchor of ['', '   ', null, undefined]) {
    const v = proveSelfUpstream({ anchor, upstreamRow: row(NEW) });
    assert.equal(v.proven, false, `anchor=${JSON.stringify(anchor)} was accepted`);
    assert.equal(v.reason, SELF_UPSTREAM.NO_ANCHOR);
  }
});

test('a DIFFERENT _id disproves it, and both ids are carried for the message', () => {
  const v = proveSelfUpstream({ anchor: ANCHOR, upstreamRow: row(NEW, 'aa11bb22cc33dd44ee55ff66') });
  assert.equal(v.proven, false);
  assert.equal(v.reason, SELF_UPSTREAM.DIFFERENT_COURSE);
  assert.equal(v.anchor, ANCHOR);
  assert.equal(v.upstreamId, 'aa11bb22cc33dd44ee55ff66');
});

test('no upstream row at all is its own reason, not a mismatch', () => {
  const v = proveSelfUpstream({ anchor: ANCHOR, upstreamRow: null });
  assert.equal(v.proven, false);
  assert.equal(v.reason, SELF_UPSTREAM.NO_UPSTREAM_ROW);
});

// ── Controls ────────────────────────────────────────────────────────────────

test('CONTROL: the outcome varies with input and is not a constant', () => {
  const seen = new Set([
    classify({ row: row(NEW) }).outcome,
    classify({ row: row(OLD) }).outcome,
    classify({ error: refusal, row: row(OLD) }).outcome,
    classify({ error: timeout, row: row(OLD) }).outcome,
  ]);
  assert.equal(seen.size, 4, `expected four distinct outcomes, got ${[...seen].join(', ')}`);
});

test('CONTROL: only APPLIED ever reports wroteUpstream true', () => {
  // The flag the action gates genesis on. If it were true anywhere else, a
  // failed upstream write would still write genesis.
  const cases = [
    classify({ row: row(NEW) }),
    classify({ row: row(OLD) }),
    classify({ error: refusal, row: row(OLD) }),
    classify({ error: timeout, row: row(OLD) }),
    classify({ readFailed: true }),
  ];
  for (const c of cases) {
    assert.equal(
      c.wroteUpstream === true, c.outcome === UPSTREAM_OUTCOME.APPLIED,
      `${c.outcome} reported wroteUpstream=${c.wroteUpstream}`
    );
  }
});
