/**
 * THE "not specified" display placeholder. One definition, so a blank
 * attendee email/phone reads the same word everywhere it is shown — the
 * customer email model and every admin screen alike.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * A repo-wide grep before this module was added found no shared constant for
 * this at all: every "not specified" sentence in this codebase (course,
 * instructor, round, roster, venue…) is a bespoke, one-off literal paired
 * with its own noun, written at its own call site. None of them answer the
 * generic "this specific value is blank" case an attendee's optional email
 * or phone now needs. This module is new, not a rename — modelled on
 * src/lib/coursePriceLabel.js's shape (a constant, a predicate, a formatter).
 *
 * ── RENDER-TIME ONLY — SEE R3 ────────────────────────────────────────────
 * This is a display substitution, never a value. It must never reach a
 * database write, an API route, a server action, or a Mongoose default, and
 * it must never sit in the `value`/`defaultValue` of an editable input — an
 * HTML `placeholder` attribute is fine (nothing to save back), a value is
 * not. See test/fs/ for the guard that keeps write paths clean of it.
 *
 * ── WHAT COUNTS AS BLANK ─────────────────────────────────────────────────
 * null, undefined, '', and whitespace-only. A real value — including one
 * with meaningful leading/trailing whitespace typed by the customer — is
 * returned BYTE-IDENTICALLY, never trimmed: silently rewriting what someone
 * typed is exactly the class of bug this repo has been burned by before
 * (TrainingFormatChip, the ScheduleBadge `!type -> "Classroom"` fallback).
 * "ไม่ได้ระบุ" is an explicit ABSENCE marker, not a plausible substitute
 * value, which is what keeps it outside that rule rather than a violation
 * of it.
 */

export const NOT_SPECIFIED_LABEL = 'ไม่ได้ระบุ';

/** @param {*} value @returns {boolean} */
export function isBlankValue(value) {
  return value == null || String(value).trim() === '';
}

/**
 * @param {string} [value]
 * @returns {string} NOT_SPECIFIED_LABEL when blank, else `value` unchanged.
 */
export function orNotSpecified(value) {
  return isBlankValue(value) ? NOT_SPECIFIED_LABEL : value;
}
