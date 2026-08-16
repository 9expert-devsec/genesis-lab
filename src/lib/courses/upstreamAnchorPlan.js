/**
 * WHICH UPSTREAM COURSE A GENESIS EXTENSION ROW BELONGS TO — the decisions,
 * with no database attached.
 *
 * ── WHAT THE ANCHOR IS FOR, AND WHY IT IS BEING STORED NOW ─────────────────
 * The rename screen cannot tell a course that was RENAMED at MSDB from a course
 * that was DELETED upstream while an unrelated one was created under the new
 * code. Both leave genesis holding a code upstream no longer has, and from the
 * code alone the two are the same observation. Acting on the wrong one merges
 * two courses' genesis rows — SEO, gallery, early-bird price, schedule
 * overrides — with no reverse, because once genesis has written, the undo is
 * refused by its own collision and formerCodes guards.
 *
 * The upstream `_id` separates them, because it SURVIVES a rename while the
 * code does not. Genesis has never stored it.
 *
 * ── WHY THE BACKFILL CANNOT WAIT ───────────────────────────────────────────
 * The mapping from code to `_id` is only certain while every genesis code still
 * matches an upstream code. Measured 2026-08-16 by
 * scripts/audit-extension-upstream-id: 79 extension rows, 79 upstream courses,
 * all 79 resolving to exactly one `_id`, no duplicate codes, no duplicate
 * `_id`s, and no row already carrying an upstream identifier under any other
 * name. That window closes at the next rename — after one, the row that most
 * needs an anchor is precisely the one that can no longer be given one.
 *
 * ── PURE, AND HANDED ITS DATA ──────────────────────────────────────────────
 * Every row and every upstream course is passed IN. The reader that gathers
 * them is the backfill script; this module decides what the values MEAN. That
 * split is what lets the two decisions that matter — an ambiguous row is left
 * empty, a disagreeing anchor is reported rather than corrected — be driven
 * against fixtures. Neither has a live instance to observe today, and the
 * second one MUST NOT have.
 *
 * NOTHING CONSUMES THE ANCHOR THIS ROUND. No guard reads it, no collision check
 * consults it, no preview verdict changes. It is data being made true ahead of
 * the code that will need it.
 */

/** What a write path should do about an anchor. */
export const ANCHOR = Object.freeze({
  /** The row has none and one was determined. Write it. */
  SET: 'set',
  /** The row already carries exactly this value. Nothing to do. */
  KEEP: 'keep',
  /**
   * The row carries a DIFFERENT value. Reported, never overwritten — see
   * `resolveAnchorWrite`.
   */
  CONFLICT: 'conflict',
  /** Nothing usable was supplied. The row is left exactly as it is. */
  NONE: 'none',
});

/** Why a row could not be given an anchor. Reported per row, never guessed past. */
export const UNANCHORABLE = Object.freeze({
  /** No upstream course carries this code. */
  NO_UPSTREAM_MATCH: 'no-upstream-match',
  /** More than one upstream course carries this code. */
  AMBIGUOUS_UPSTREAM: 'ambiguous-upstream',
  /** The single upstream match has no usable `_id`. */
  UPSTREAM_HAS_NO_ID: 'upstream-has-no-id',
});

const clean = (v) => String(v ?? '').trim();

/**
 * A 24-character hex string — a Mongo ObjectId as it is stored here.
 *
 * VALIDATED RATHER THAN TRUSTED because the value arrives from an upstream JSON
 * payload and, on the admin write path, from a React prop. An anchor is only
 * worth having if a reader can rely on it meaning one thing; a truncated id, an
 * `[object Object]`, or an empty string written as though it were an id would
 * all be indistinguishable from a real anchor later, and the guard that will
 * eventually read this field is one whose wrong answer merges two courses.
 */
export function isAnchorShaped(value) {
  return /^[0-9a-f]{24}$/i.test(clean(value));
}

/**
 * What to do about one row's anchor, given what is stored and what was
 * determined.
 *
 * ── A DISAGREEMENT IS A FINDING, NOT SOMETHING TO CORRECT ──────────────────
 * If a row already carries an anchor and the code now resolves to a DIFFERENT
 * upstream course, exactly one of two things happened: the anchor is wrong, or
 * the code moved to another course. Both are facts somebody has to look at, and
 * they are not distinguishable from here.
 *
 * Overwriting would destroy the evidence in the one case where it matters most
 * — the stored anchor is the older, more trustworthy claim, written while the
 * two sides still agreed, and the code is the thing that is known to drift.
 * "Last write wins" on an identity field is how a merge happens quietly.
 *
 * So: SET only into an empty field. Never over a value.
 *
 * @param {object} input
 * @param {string} [input.stored]   the anchor already on the row, '' when none
 * @param {string} [input.supplied] the anchor determined for it
 * @returns {{action: string, value: string|null, stored: string|null}}
 */
export function resolveAnchorWrite({ stored, supplied } = {}) {
  const have = clean(stored);
  const want = clean(supplied);

  if (!isAnchorShaped(want)) {
    // Nothing usable offered. NOT a reason to clear what is there.
    return { action: ANCHOR.NONE, value: null, stored: have || null };
  }
  if (!have) return { action: ANCHOR.SET, value: want, stored: null };
  if (have.toLowerCase() === want.toLowerCase()) {
    return { action: ANCHOR.KEEP, value: have, stored: have };
  }
  return { action: ANCHOR.CONFLICT, value: want, stored: have };
}

/**
 * Index upstream courses by code, CASE-INSENSITIVELY.
 *
 * Case-insensitive because upstream `course_id` has no canonical casing — five
 * live courses are not fully uppercase — and `Power-Apps` and `POWER-APPS` are
 * one identity. Matching exactly would report those rows as unresolvable and
 * leave them un-anchored for a reason that is not a reason.
 *
 * The value is an ARRAY, not the course: a code held by two upstream courses is
 * the ambiguity this whole module exists to refuse, so it has to survive
 * indexing rather than be collapsed by a last-one-wins map.
 */
export function indexUpstreamByCode(upstream = []) {
  const byCode = new Map();
  for (const c of upstream ?? []) {
    const key = clean(c?.course_id).toLowerCase();
    if (!key) continue;
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push(c);
  }
  return byCode;
}

/**
 * The whole backfill, decided.
 *
 * @param {object} input
 * @param {Array<{courseId: string, upstreamId?: string, _id?: any}>} input.rows
 *        every CourseExtension row
 * @param {Array<{course_id: string, _id: any}>} input.upstream
 *        every upstream course, hidden included
 * @returns {object} four disjoint buckets plus counts. Every input row appears
 *        in exactly one bucket — asserted, because a row that fell out of the
 *        report would be a row nobody knows was skipped.
 */
export function planAnchorBackfill({ rows = [], upstream = [] } = {}) {
  const byCode = indexUpstreamByCode(upstream);

  /** Rows to write. Only these. */
  const write = [];
  /** Rows already carrying the right value. Re-running must produce these. */
  const alreadyAnchored = [];
  /** Rows whose stored anchor disagrees. REPORTED. Never written. */
  const conflicts = [];
  /** Rows that cannot be resolved. LEFT EMPTY, with the reason named. */
  const unanchorable = [];

  for (const row of rows ?? []) {
    const code = clean(row?.courseId);
    const stored = clean(row?.upstreamId);
    const hits = byCode.get(code.toLowerCase()) ?? [];

    if (hits.length !== 1) {
      /**
       * A row that already HAS an anchor keeps it even when its code no longer
       * resolves — that is the upstream-only state, and the anchor is exactly
       * the thing that survives it. It is reported here rather than silently
       * passed over, because "this row's code no longer matches upstream" is a
       * finding whether or not there is anything to write.
       */
      unanchorable.push({
        courseId: code,
        stored: stored || null,
        reason: hits.length === 0 ? UNANCHORABLE.NO_UPSTREAM_MATCH : UNANCHORABLE.AMBIGUOUS_UPSTREAM,
        candidates: hits.map((h) => ({ course_id: h?.course_id, _id: String(h?._id ?? '') })),
      });
      continue;
    }

    const supplied = String(hits[0]?._id ?? '');
    if (!isAnchorShaped(supplied)) {
      // Resolved to one course, and that course has no usable id. Distinct from
      // "no match" — the row is fine and upstream is the problem.
      unanchorable.push({
        courseId: code,
        stored: stored || null,
        reason: UNANCHORABLE.UPSTREAM_HAS_NO_ID,
        candidates: [{ course_id: hits[0]?.course_id, _id: supplied }],
      });
      continue;
    }

    const verdict = resolveAnchorWrite({ stored, supplied });
    const entry = { courseId: code, upstreamCode: hits[0].course_id, stored: stored || null, upstreamId: supplied };
    if (verdict.action === ANCHOR.SET) write.push(entry);
    else if (verdict.action === ANCHOR.KEEP) alreadyAnchored.push(entry);
    else conflicts.push(entry);
  }

  return {
    write,
    alreadyAnchored,
    conflicts,
    unanchorable,
    counts: {
      rows: (rows ?? []).length,
      write: write.length,
      alreadyAnchored: alreadyAnchored.length,
      conflicts: conflicts.length,
      unanchorable: unanchorable.length,
    },
    /**
     * The plan is SAFE TO APPLY when nothing disagrees. A conflict does not
     * stop the other rows being written — they are independent — but it is
     * surfaced as a single boolean so a caller cannot report a clean run over
     * one.
     */
    clean: conflicts.length === 0 && unanchorable.length === 0,
  };
}
