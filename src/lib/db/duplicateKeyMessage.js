/**
 * Turn a Mongo duplicate-key error into the message for the constraint that
 * ACTUALLY failed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * `course_extensions` now has TWO unique indexes — `courseId_1` and
 * `urlAlias_1`. Before that, `saveCourseExtension` treated every E11000 as an
 * alias collision and returned "URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น". That
 * branch was unreachable for the case it named (urlAlias had no unique index, so
 * only courseId could raise 11000) — meaning the ONE error it could actually
 * receive was the one it described wrongly. Making urlAlias unique does not fix
 * that; it makes both errors reachable and the mislabelling live.
 *
 * ── HOW THE FAILING INDEX IS IDENTIFIED, IN PRIORITY ORDER ──────────────────
 *   1. `keyPattern` — the driver's structured answer, e.g. `{ urlAlias: 1 }`.
 *   2. `keyValue`   — same shape, present on some driver versions when
 *                     keyPattern is not.
 *   3. the message  — `... index: urlAlias_1 dup key: ...`. A last resort,
 *                     because it is a human string, but it is the only thing
 *                     available on older drivers and costs one regex.
 *
 * Falling through all three yields the generic message rather than a guess: a
 * wrong specific message is worse than an honest vague one, which is the whole
 * lesson of the branch this replaces.
 *
 * PURE — no db, no env, no imports. The index→message map is data, so a new
 * unique index is one line here and one test, not a new `if` in a catch block.
 */

/** Field name → what to tell the admin when that constraint rejects a write. */
const MESSAGE_BY_FIELD = Object.freeze({
  urlAlias: 'URL Alias นี้ถูกใช้แล้วโดยหลักสูตรอื่น',
  courseId: 'หลักสูตรนี้มีข้อมูลส่วนขยายอยู่แล้ว',
});

/** Every field this module can name, for the guard test. */
export const DUPLICATE_KEY_FIELDS = Object.freeze(Object.keys(MESSAGE_BY_FIELD));

export const GENERIC_DUPLICATE_MESSAGE = 'ข้อมูลนี้ซ้ำกับที่มีอยู่แล้ว';

/**
 * The field whose unique index rejected the write, or null when it cannot be
 * determined. Exported for tests and for callers that need the field itself
 * rather than a message.
 */
export function duplicateKeyField(err) {
  if (!err || err.code !== 11000) return null;

  for (const source of [err.keyPattern, err.keyValue]) {
    if (source && typeof source === 'object') {
      const [field] = Object.keys(source);
      // `_id` is a duplicate-key too, but never one an admin caused or can act
      // on, so it is not named here and falls through to the generic message.
      if (field && field !== '_id') return field;
    }
  }

  // `index: urlAlias_1 dup key` — the index NAME, from which Mongo's default
  // `<field>_<direction>` convention gives the field back. Anchored on the
  // trailing `_1`/`_-1` so a field whose own name ends in a digit survives.
  const named = /index:\s*([A-Za-z0-9_.$]+?)_-?\d+\s+dup key/.exec(String(err.message ?? ''));
  if (named?.[1] && named[1] !== '_id') return named[1];

  return null;
}

/**
 * The admin-facing message for a duplicate-key error, or null when `err` is not
 * one — so a caller can keep its existing handling for everything else.
 */
export function duplicateKeyMessage(err) {
  if (!err || err.code !== 11000) return null;
  const field = duplicateKeyField(err);
  return MESSAGE_BY_FIELD[field] ?? GENERIC_DUPLICATE_MESSAGE;
}
