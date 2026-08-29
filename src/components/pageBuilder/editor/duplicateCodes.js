/**
 * Which course codes an authored list repeats.
 *
 * ── WHY THIS IS A MODULE AND NOT THREE LINES IN THE EDITOR ─────────────────
 * It is the whole content of a warning an author will act on, so it is worth
 * pinning on its own — and it is pure, so pinning it costs a pure-tier test
 * rather than a render. `SectionContentEditor.jsx` is a `'use client'` module
 * that reaches tiptap; the rule that decides whether an author sees "รหัสซ้ำ"
 * should not need any of that to be checked. Same shape, and the same reason,
 * as `lib/courses/courseOptionFilter.js`.
 *
 * ── WHY IT IS HERE AND NOT IN lib/pageBuilder/sectionLabels.js ─────────────
 * That file is the obvious home — it already holds `sectionRendersEmpty`, the
 * other "predicate about a section's content" — and it is INSIDE the public
 * import closure: 555 files reachable from the public entry points, measured by
 * `scripts/_verify-round31-public-path.mjs`. `SectionRenderer` imports it, so
 * the published page carries it.
 *
 * This predicate is editor-only. Nothing on a published page asks whether a
 * list repeats a code — the renderer maps positionally and draws the repeat, on
 * purpose (docs/course-picker-proposal.md §D.4). Putting it in the public
 * closure would move a decision about an editor warning onto the render path,
 * where every later edit to it needs a public-path verification it has no
 * reason to need. `src/components/pageBuilder/editor/` is outside the closure —
 * measured, not assumed — and it is where the editor's own plain-JS helpers
 * already live (`pagePath.js`, `editorReducer.js`).
 *
 * ── WHAT COUNTS AS A DUPLICATE ─────────────────────────────────────────────
 * Exact string equality after the trim `CourseIdsField` already applies. NOT
 * case-folded, and that is a decision rather than an omission:
 *
 *   · `course_id` has no canonical casing. Four of 79 are mixed-case (measured
 *     2026-08-29), and `getCourseByCodeInsensitive` exists precisely because
 *     upstream's `?course_id=` is exact-match — so `Power-Apps` and
 *     `POWER-APPS` are two lookups with two possible answers, not one code
 *     written twice.
 *   · A warning that folded case would fire on a list that resolves to two
 *     different courses, which is the "warns on correct input" failure the
 *     tri-state above `CourseIdsWarnings` exists to prevent.
 *
 * Empty strings are ignored. A trailing newline stores `''`
 * (docs/course-picker-proposal.md §D.5, §F.6) and two of them are not a
 * duplicate anyone can act on.
 */

/**
 * The codes appearing more than once, each named ONCE, in the order they first
 * appear in the array.
 *
 * First-appearance order rather than sorted: the warning sits under a control
 * that shows the list in its authored order, and array position is the only
 * ordering authority there is (§D.3). A sorted warning would name the codes in
 * an order that appears nowhere on screen.
 *
 * @param {unknown} ids the authored array, as stored
 * @returns {string[]} duplicated codes, deduplicated, in first-appearance order
 */
export function duplicateCourseCodes(ids) {
  const list = Array.isArray(ids) ? ids : [];
  const counts = new Map();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  // Counted first, then read back in list order. Collecting during the same
  // pass would emit each code at its SECOND appearance, so ['A','B','B','A']
  // would report B before A — an order that appears nowhere on screen.
  const out = [];
  const emitted = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const code = raw.trim();
    if (!code || emitted.has(code) || (counts.get(code) ?? 0) < 2) continue;
    emitted.add(code);
    out.push(code);
  }
  return out;
}
