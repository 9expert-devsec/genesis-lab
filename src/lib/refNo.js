/**
 * The short reference number an admin reads and quotes down the phone.
 *
 * `String(id).slice(-8).toUpperCase()` — the last eight characters of a Mongo
 * ObjectId, uppercased. It is NOT stored anywhere: every screen and every email
 * derives it from `_id` on the fly, which is why `recordId` in the audit trail
 * already carries it (§8.7 ruling (a)) and `recordLabel` for the registration
 * entities is deliberately empty.
 *
 * ── WHY THIS FILE EXISTS NOW AND NOT BEFORE ─────────────────────────────────
 * The one-liner was duplicated at six sites. §8.7 recorded the duplication
 * deliberately rather than extracting it: one line, copies that had never
 * diverged, and extraction would have been six edits in service of nothing.
 * The trigger written down at the time was "extract it when Phase 3's reading
 * surface becomes the seventh caller". That is this.
 *
 * Pure, no imports. Safe on both sides of the network boundary.
 */

/** Mongo ObjectIds are exactly 24 hex characters. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * The reference number for a Mongo `_id`.
 *
 * Behaviour is byte-for-byte what the six original call sites did, including
 * for short and empty input — `generateMetadata` can reach this with a missing
 * route param, and `String(undefined).slice(-8)` would otherwise render the
 * user a page titled "ใบสมัคร UNDEFINED".
 */
export function refNo(id) {
  if (id === null || id === undefined) return '';
  return String(id).slice(-8).toUpperCase();
}

/** Is this string shaped like a Mongo ObjectId? */
export function isObjectIdLike(value) {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

/**
 * How an audit `recordId` should be shown to a human.
 *
 * NOT the same function as `refNo`, and the difference is load-bearing.
 * `recordId` is polymorphic by design: a Mongo `_id`, an MSDB ObjectId, a
 * `course_id` CODE, a role key, a stable literal like `schedule_pdf`. Blindly
 * truncating would turn `COPILOT-STU` into `ILOT-STU` — a value that matches
 * nothing and looks like a typo.
 *
 * So: shorten only what is actually an ObjectId, and leave every
 * already-readable identifier exactly as it is.
 */
export function displayRecordId(recordId) {
  if (recordId === null || recordId === undefined) return '';
  const str = String(recordId);
  return isObjectIdLike(str) ? refNo(str) : str;
}
