/**
 * What must be true before the rename button does anything.
 *
 * Pure, and separate from the panel, because these are the rules rather than
 * the markup — and the states that matter (a stale preview, a half-typed
 * confirmation, a blocked preview someone is trying to force) are all reachable
 * from a fixture and none of them needs a DOM.
 */

import { previewFingerprint, countsFromPreview } from './renameCoursePlan';

/** Why the button is not available. Rendered, so each is a sentence. */
export const GATE = Object.freeze({
  NO_PREVIEW:   'no-preview',
  BLOCKED:      'blocked',
  NOT_TYPED:    'not-typed',
  NOT_ACKED:    'not-acked',
});

/**
 * The token for a preview OBJECT — derived from what is on screen.
 *
 * The admin consents to a blast radius they can see, so the token sent with the
 * write is computed from the DISPLAYED preview, not from a fresh read. The
 * action recomputes it server-side and refuses on a mismatch; that refusal is
 * the mechanism, and this is the half that makes it mean "the thing you looked
 * at" rather than "whatever is true now".
 */
export function tokenForPreview(preview) {
  if (!preview) return '';
  return previewFingerprint({
    oldCode: preview.oldCode,
    newCode: preview.newCode,
    counts: countsFromPreview(preview),
  });
}

/**
 * May the rename run?
 *
 * ── WHY THE CONFIRMATION IS TYPED AND NOT A CHECKBOX ───────────────────────
 * A mistyped NEW code is caught by the collision check, or produces a preview
 * whose numbers look wrong. A MIS-SELECTED COURSE is caught by nothing: every
 * store lookup succeeds, the counts are plausible, and eleven rows move on the
 * wrong course. Typing the new code again is the cheapest thing that makes the
 * admin look at the row they are about to act on — a checkbox is satisfied
 * without reading anything.
 *
 * ── AND WHY THE ACKNOWLEDGEMENT IS SEPARATE ────────────────────────────────
 * Two different consents. One is to this write. The other is to an obligation
 * that lands on the admin AFTER it: MSDB still carries the old code, and until
 * they change it the ordering and enrichment stores are detached and a hidden
 * course can become publicly visible. Folding that into the same control would
 * let someone agree to the second by concentrating on the first.
 *
 * Comparison is EXACT, not case-insensitive: a rename that differs only by case
 * is a real and dangerous rename (see the case-only warning), so accepting
 * `excel-hr-01` for `EXCEL-HR-01` would defeat the confirmation precisely where
 * it matters most.
 *
 * @param {object} input
 * @param {object|null} input.preview the preview currently ON SCREEN
 * @param {string} input.typedCode    what the admin typed to confirm
 * @param {boolean} input.ackMsdb     the separate MSDB acknowledgement
 * @returns {{allowed: boolean, reasons: string[], token: string}}
 */
export function canExecuteRename({ preview, typedCode = '', ackMsdb = false } = {}) {
  const reasons = [];

  if (!preview) reasons.push(GATE.NO_PREVIEW);
  else if (preview.ok === false) reasons.push(GATE.BLOCKED);

  const expected = String(preview?.newCode ?? '');
  if (!expected || String(typedCode) !== expected) reasons.push(GATE.NOT_TYPED);

  if (!ackMsdb) reasons.push(GATE.NOT_ACKED);

  return {
    allowed: reasons.length === 0,
    reasons,
    token: tokenForPreview(preview),
  };
}

/**
 * Does the alias have to be created before anything else?
 *
 * Surfaced as a numbered STEP rather than a footnote: with no alias the public
 * URL is derived from the code, so the moment the code changes the old URL 404s
 * and nothing maps old to new. It is the one part of the sequence whose order
 * is load-bearing, and an admin who does not know it happened cannot tell
 * whether their URL survived.
 */
export function aliasStepFor(preview) {
  if (!preview?.url?.mustCreateAliasFirst) return null;
  return { path: preview.url.aliasToCreate, derivedFrom: preview.oldCode };
}
