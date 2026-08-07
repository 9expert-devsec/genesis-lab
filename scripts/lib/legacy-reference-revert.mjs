/**
 * THE REVERT PATH.
 *
 * ══ WHY THIS IS A SEPARATE MODULE AND WHY IT LOOKS AT NOTHING ELSE ══════════
 *
 * A revert has to work on the worst day, not the best one. On that day the
 * legacy server is switched off, Cloudinary may be suspended, and the person
 * running this may not be the person who ran the apply.
 *
 * So the revert consults `legacy_reference_rewrites` AND NOTHING ELSE. No
 * liveness file, no migration manifest, no re-derivation, no classifier. It
 * does not recompute what the original *should* have been — it reads what the
 * original *was*, byte for byte, from a record written before the value was
 * touched. Re-deriving would just re-run the logic whose output we are trying
 * to undo, which is the one thing that cannot be trusted at that moment.
 *
 * ══ THE RULE THAT MATTERS MOST ══════════════════════════════════════════════
 *
 * A revert that silently overwrites later human edits is WORSE THAN NO REVERT.
 *
 * Between the apply and the revert, someone may have edited that article in
 * the admin. Their edit is newer and more valuable than our rollback. So
 * before writing, the current value must still equal EXACTLY the `newValue`
 * this run wrote. If it differs by one byte, the field is skipped and reported
 * as `conflict` — never clobbered, never merged, never guessed at.
 *
 * That check is also what makes the revert idempotent for free: after a
 * successful revert the field holds `originalValue`, which no longer equals
 * `newValue`, so a second pass classifies it as `already-reverted` and writes
 * nothing.
 *
 * Pure decision logic. The driver does the I/O.
 */

/** What the revert decided about one recorded field. */
export const REVERT = {
  /** Current value matches what we wrote — safe to restore. */
  RESTORE: 'restore',
  /** Current value already equals the original — nothing to do. Idempotence. */
  ALREADY_REVERTED: 'already-reverted',
  /** Someone changed this field after we wrote it. Hands off. */
  CONFLICT: 'conflict',
  /** The document or field is gone. Reported, not invented. */
  MISSING: 'missing',
};

/**
 * Read a dotted field path out of a document.
 *
 * Returns `{ found, value }` rather than throwing or returning undefined,
 * because "the field holds undefined" and "the field does not exist" lead to
 * different report lines and only one of them is alarming.
 */
export function readFieldPath(doc, fieldPath) {
  let cur = doc;
  for (const seg of fieldPath.split('.')) {
    if (cur === null || typeof cur !== 'object') return { found: false, value: undefined };
    if (!(seg in cur)) return { found: false, value: undefined };
    cur = cur[seg];
  }
  return { found: true, value: cur };
}

/**
 * Decide what to do with one backup record, given the document as it is NOW.
 *
 * `doc === null` means the document was deleted since the apply.
 */
export function decideRevert(record, doc) {
  if (!doc) {
    return { action: REVERT.MISSING, reason: 'document no longer exists' };
  }
  const { found, value } = readFieldPath(doc, record.fieldPath);
  if (!found) {
    return { action: REVERT.MISSING, reason: `field ${record.fieldPath} no longer exists` };
  }
  if (typeof value !== 'string') {
    return { action: REVERT.CONFLICT, reason: `field is no longer a string (${typeof value})` };
  }

  // Idempotence is checked BEFORE the conflict test on purpose: a field that
  // already holds the original is a success, not a disagreement, and a second
  // revert run must say so rather than reporting hundreds of conflicts.
  if (value === record.originalValue) {
    return { action: REVERT.ALREADY_REVERTED, reason: 'field already holds the original value' };
  }
  if (value !== record.newValue) {
    return {
      action: REVERT.CONFLICT,
      reason: 'field was edited after this run wrote it — refusing to clobber a newer change',
      currentLength: value.length,
      expectedLength: record.newValue.length,
    };
  }
  return { action: REVERT.RESTORE, reason: 'current value matches what this run wrote' };
}

/**
 * Verify a completed revert: every record's field must now be byte-identical
 * to `originalValue`.
 *
 * Deliberately a separate pass over freshly-read documents rather than a flag
 * set during the write. Trusting the writer to report on its own success is
 * how a revert comes to be believed without being true.
 */
export function verifyReverted(record, doc) {
  if (!doc) return { ok: false, reason: 'document missing' };
  const { found, value } = readFieldPath(doc, record.fieldPath);
  if (!found) return { ok: false, reason: 'field missing' };
  if (value === record.originalValue) return { ok: true };
  return {
    ok: false,
    reason: 'field does NOT match the original',
    firstDifferenceAt: firstDifference(String(value), record.originalValue),
  };
}

/** Byte offset of the first difference, for a diff that is otherwise unreadable. */
export function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
