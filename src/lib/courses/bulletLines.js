/**
 * The newline-list round trip for the course form's bullet fields.
 *
 * Four fields ride on this — course_objectives, course_target_audience,
 * course_prerequisites, course_system_requirements — plus `bullets` and the
 * career-path and masterclass forms. MSDB stores each as an ARRAY OF STRINGS;
 * the editor shows one item per line in a <textarea>; `linesOf()` in
 * lib/actions/courses.js splits it back on submit.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM linesOf() ───────────────────────────────
 * `linesOf` lives in a `'use server'` module and cannot be imported by a test.
 * The round trip is the part that can silently destroy data — the training_topics
 * defect was exactly this: the editor emitted a shape MSDB did not store, so it
 * rendered blank against good data and the save overwrote it. Pulling the pair
 * out here lets a test start from the RAW API shape and assert the value that
 * comes back is byte-for-byte what went in.
 *
 * `parseBulletLines` MIRRORS `linesOf` deliberately — same split, same trim,
 * same drop-empties. If one changes the other must, and the test asserts they
 * agree on the real data. It is a mirror, not the implementation: making
 * actions/courses.js import this would be better, and is deliberately NOT done
 * in this round because that file is the payload contract for 78 live courses
 * and re-pointing it is a separate change with its own blast radius.
 *
 * ── MEASURED, SO THE "BYTE-FOR-BYTE" CLAIM IS EARNED ────────────────────────
 * Across all 78 courses and all four fields — 1118 items — there are:
 *   · 0 items with leading or trailing whitespace
 *   · 0 items containing a newline
 *   · 0 non-string items
 *   · 0 blank/whitespace-only items
 * So join('\n') → split('\n') + trim + drop-empties is lossless FOR THIS DATA.
 * It is not lossless in general: an item padded with spaces would come back
 * trimmed, and an item containing a newline would split into two. Both are
 * pre-existing properties of `linesOf`, not introduced here, and neither occurs.
 *
 * ── MARKERS ARE PRESENTATION AND NEVER STORED ───────────────────────────────
 * The public page adds its own marker at render time and reads none from the
 * text: CourseObjectives.jsx:12 prints `{i + 1}.` from the array index, and
 * CourseTarget / CoursePrerequisites / CourseRequirements each render a lucide
 * <CheckCircle>. Measured to match the data — ZERO of those 1118 stored items
 * begins with a number, bullet, check or Thai numeral.
 *
 * That is why the editor may DISPLAY a number or a check and must never write
 * one. If a marker ever reaches the stored value, the public page renders it on
 * top of its own and the list reads "1. 1. …" — and the next save persists the
 * damage.
 */

/**
 * Text from the textarea → the array the payload will carry.
 *
 * Mirrors `linesOf` (lib/actions/courses.js:184) exactly: split on \n, trim
 * each line, drop the empties. Non-strings become an empty list rather than
 * throwing — a missing key must submit `[]`, never crash the save.
 */
export function parseBulletLines(text) {
  if (typeof text !== 'string') return [];
  return text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The stored array → the text the textarea shows.
 *
 * Accepts the raw API value, which is an array of strings for every one of the
 * 78 courses. A bare string is tolerated because `toArray` on the public side
 * does the same, and a null/undefined field seeds an empty box rather than the
 * string "undefined".
 */
export function formatBulletLines(items) {
  if (Array.isArray(items)) {
    return items.filter((s) => typeof s === 'string').join('\n');
  }
  if (typeof items === 'string') return items;
  return '';
}

/**
 * The marker vocabulary the editor may DISPLAY, mirroring the public page.
 *
 *   number — วัตถุประสงค์, an <ol> numbered from the index
 *   check  — the other three, a check glyph per row
 *
 * `null`/absent means "no preview", which is what every other consumer of
 * BulletTextarea gets. Adding a kind here is additive; nothing switches on it
 * outside the editor's own rendering.
 */
export const BULLET_MARKER_KINDS = Object.freeze(['number', 'check']);

/** Is `kind` a marker this editor knows how to draw? */
export function isBulletMarkerKind(kind) {
  return BULLET_MARKER_KINDS.includes(kind);
}

/**
 * The label for the Nth row of a numbered list — "1.", "2.", …
 *
 * Matches CourseObjectives.jsx:12 (`{i + 1}.`) so the editor's preview and the
 * public page cannot drift apart. Presentation only: this string is never
 * written into the value.
 */
export function numberLabel(index) {
  return `${Number(index) + 1}.`;
}
