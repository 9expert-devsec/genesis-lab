/**
 * THE UPSTREAM HALF OF A RENAME, DECIDED — with no network attached.
 *
 * ── WHY UPSTREAM GOES FIRST NOW ────────────────────────────────────────────
 * The two-phase rename is retired: an admin changes the code in genesis and is
 * done. That makes the ORDER of the two writes the safety property, and the
 * order is UPSTREAM FIRST.
 *
 * A non-2xx from MSDB before any genesis mutation is a CLEAN REFUSAL — nothing
 * anywhere has moved, and the admin can retry or walk away. The reverse order
 * has no such state: genesis-done-upstream-pending was measured (2026-08-16) to
 * be NOT reversible, because genesis has written `formerCodes` and its own
 * collision guard then refuses the undo. Upstream-only, the state this order
 * risks instead, was measured on the same day to be FULLY reversible while
 * genesis is untouched — and, since the `upstreamId` backfill, it is also
 * resumable with proof rather than suspicion.
 *
 * So the order trades an unrecoverable failure state for a recoverable one.
 *
 * ── AND WHY SUCCESS IS A READ-BACK ─────────────────────────────────────────
 * `PUT /public-course/<_id>` answers `{ok: true, item: {...}}` with a full
 * 36-key echo. That echo is the REQUEST's view, not the row's: the probe in
 * scripts/_probe-msdb-put-semantics deliberately re-read rather than trusting
 * it. A 2xx with `ok: true` is not evidence the field applied, so nothing here
 * treats it as such — every outcome below is decided by what came back from a
 * fresh read, and the response only distinguishes "the call errored" from "the
 * call returned".
 *
 * Pure: no client, no model, no cache API. Handed a read-back row and told
 * whether the call threw.
 */

const clean = (v) => String(v ?? '').trim();

/** What actually happened upstream. Decided from the READ-BACK, not the response. */
export const UPSTREAM_OUTCOME = Object.freeze({
  /** The row now carries the new code. The only outcome that may write genesis. */
  APPLIED: 'applied',
  /** The call returned and the row still carries the old code. Nothing moved. */
  NOT_APPLIED: 'not-applied',
  /** The call failed cleanly BEFORE anything moved. Safe to retry. */
  REFUSED: 'refused',
  /**
   * Cannot be determined. A timeout whose read-back does not show the new code,
   * or a read-back that itself failed. NEVER treated as failure, and never
   * rolled back on — see `UNKNOWN_ADVICE`.
   */
  UNKNOWN: 'unknown',
});

/** Why an outcome was reached. Rendered, so each is specific. */
export const UPSTREAM_REASON = Object.freeze({
  READ_CONFIRMS_NEW:     'read-back confirms the new code',
  READ_STILL_OLD:        'read-back still shows the old code',
  READ_FAILED:           'the read-back itself failed',
  ROW_GONE:              'no upstream row carries that _id any more',
  ROW_THIRD_CODE:        'the row carries neither the old nor the new code',
  TIMEOUT_UNCONFIRMED:   'the write timed out and the read-back does not show the new code',
  CALL_REFUSED:          'the write was refused before anything moved',
  CONTRADICTION:         'the write reported failure but the row carries the new code',
});

/**
 * Is this error a timeout — i.e. did we ABANDON the request rather than get an
 * answer?
 *
 * `msdb-write.js` translates an AbortError into a message naming the endpoint
 * and the ceiling, so the marker is that message shape. Matched on the phrase
 * it constructs rather than on `err.name`, because by the time it reaches here
 * it is a plain Error the wrapper threw.
 *
 * THE DISTINCTION IS THE WHOLE POINT. A refused call is a fact about the
 * server. A timeout is a fact about our patience: `fetchWithTimeout` aborts the
 * CLIENT, never the server, so the write may have been applied, may be being
 * applied right now, or may never have been read. Collapsing the two is how a
 * "failed" rename quietly becomes an upstream-only divergence nobody looked for.
 */
export function isTimeoutError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  return /timed out after/i.test(String(err.message ?? ''));
}

/**
 * What the upstream write did, from the read-back.
 *
 * @param {object} input
 * @param {string} input.oldCode
 * @param {string} input.newCode
 * @param {object|null} [input.error]  `{message, timeout}` if the call threw
 * @param {object|null} [input.row]    the row re-read BY `_id`, or null
 * @param {boolean} [input.readFailed] the read-back could not be performed
 * @returns {{outcome: string, reason: string, code: string|null, wroteUpstream: boolean|null}}
 */
export function classifyUpstreamWrite({
  oldCode,
  newCode,
  error = null,
  row = null,
  readFailed = false,
} = {}) {
  const want = clean(newCode);
  const had = clean(oldCode);
  const got = row ? clean(row.course_id) : null;

  const out = (outcome, reason) => ({
    outcome,
    reason,
    code: got,
    /**
     * Tri-state on purpose. `null` is NOT "no" — it is "nobody can say", and
     * every caller that decides whether to touch genesis has to handle it
     * distinctly from false.
     */
    wroteUpstream:
      outcome === UPSTREAM_OUTCOME.APPLIED ? true
        : outcome === UPSTREAM_OUTCOME.UNKNOWN ? null
          : false,
  });

  /**
   * THE READ-BACK IS THE AUTHORITY, and it outranks the response even when the
   * response said the call failed. If the row carries the new code, the rename
   * happened — a wrapper that reported an error over a write that landed is
   * exactly the case where believing the response loses the row.
   */
  if (!readFailed && got && got === want) {
    return out(
      UPSTREAM_OUTCOME.APPLIED,
      error ? UPSTREAM_REASON.CONTRADICTION : UPSTREAM_REASON.READ_CONFIRMS_NEW
    );
  }

  // Nothing else can be concluded without a read.
  if (readFailed) return out(UPSTREAM_OUTCOME.UNKNOWN, UPSTREAM_REASON.READ_FAILED);

  /**
   * A TIMEOUT NEVER YIELDS A FAILURE VERDICT. We aborted the client; the server
   * was never told to stop. Reading the old code back means it had not applied
   * AT THE MOMENT WE LOOKED, which is not the same as "it will not". The only
   * conclusion available is that we do not know.
   */
  if (error?.timeout) return out(UPSTREAM_OUTCOME.UNKNOWN, UPSTREAM_REASON.TIMEOUT_UNCONFIRMED);

  if (!row) return out(UPSTREAM_OUTCOME.UNKNOWN, UPSTREAM_REASON.ROW_GONE);

  if (got === had) {
    // A definite answer from the server, and the row is untouched.
    return out(
      error ? UPSTREAM_OUTCOME.REFUSED : UPSTREAM_OUTCOME.NOT_APPLIED,
      error ? UPSTREAM_REASON.CALL_REFUSED : UPSTREAM_REASON.READ_STILL_OLD
    );
  }

  // Neither code. Somebody else is editing this row, or it is not what we think.
  return out(UPSTREAM_OUTCOME.UNKNOWN, UPSTREAM_REASON.ROW_THIRD_CODE);
}

/** What an admin should do about an UNKNOWN. Never "press it again". */
export const UNKNOWN_ADVICE = Object.freeze({
  th:
    'ยังไม่ทราบผล — คำสั่งถูกส่งไปแล้วแต่ไม่ได้รับคำตอบยืนยัน '
    + 'ฝั่งระบบนี้ยังไม่ได้เขียนอะไรเลย ห้ามกดซ้ำ '
    + 'ให้กด "ตรวจสอบผลกระทบ" ใหม่เพื่ออ่านสถานะสองฝั่ง แล้วดูว่า MSDB เป็นรหัสใด',
});

/**
 * ── THE ANCHOR TURNS A SUSPICION INTO A PROOF ──────────────────────────────
 *
 * Until now the rename screen could see that upstream held the NEW code and not
 * the old, and that genesis still had rows on the old — and could not tell a
 * renamed course from a deleted-and-recreated pair. Acting on the wrong reading
 * merges two courses' genesis rows with no reverse, so it refused.
 *
 * `CourseExtension.upstreamId` is the MSDB `_id`, which SURVIVES a rename.
 * Comparing it against the `_id` of whatever now holds the new code answers
 * "is this the same course" without trusting the code at all.
 *
 * ── AND WHERE THERE IS NO ANCHOR, IT REFUSES ───────────────────────────────
 * An empty anchor is NOT "no objection" — it is "identity unknown". Falling
 * back to comparing codes would reinstate exactly the suspicion this replaces
 * while wearing the appearance of a proof, which is worse than the suspicion
 * was. So an unanchored row is refused and NAMED, and the operator is pointed
 * at the backfill.
 *
 * @param {object} input
 * @param {string} [input.anchor]  CourseExtension.upstreamId for the old code
 * @param {object|null} [input.upstreamRow] the upstream row holding the NEW code
 * @returns {{proven: boolean, reason: string, anchor: string|null, upstreamId: string|null}}
 */
export const SELF_UPSTREAM = Object.freeze({
  PROVEN:           'anchor-matches',
  NO_ANCHOR:        'no-anchor',
  NO_UPSTREAM_ROW:  'no-upstream-row',
  DIFFERENT_COURSE: 'different-course',
});

export function proveSelfUpstream({ anchor, upstreamRow } = {}) {
  const a = clean(anchor);
  const id = upstreamRow ? clean(upstreamRow._id) : '';
  const base = { anchor: a || null, upstreamId: id || null };

  if (!a) return { proven: false, reason: SELF_UPSTREAM.NO_ANCHOR, ...base };
  if (!id) return { proven: false, reason: SELF_UPSTREAM.NO_UPSTREAM_ROW, ...base };
  // Hex is hex — an anchor stored uppercase is the same anchor.
  if (a.toLowerCase() === id.toLowerCase()) {
    return { proven: true, reason: SELF_UPSTREAM.PROVEN, ...base };
  }
  return { proven: false, reason: SELF_UPSTREAM.DIFFERENT_COURSE, ...base };
}
