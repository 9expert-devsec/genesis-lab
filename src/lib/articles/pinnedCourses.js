/**
 * Resolve the course codes an admin pinned on an article against the public
 * catalogue — IN THE ORDER THEY PINNED THEM.
 *
 * ── TWO DEFECTS, ONE LINE ──────────────────────────────────────────────────
 * The article page did this:
 *
 *   const wanted = new Set(article.relatedCourses);
 *   relatedCoursesData = items.filter((c) => wanted.has(c.course_id));
 *
 * `.filter` walks the CATALOGUE, so the output came back in the catalogue's
 * order — upstream's global `sort_order` — and the sequence the admin chose was
 * discarded. The same feature already gets this right for related ARTICLES:
 * `getArticlesByIds` (lib/actions/articles.js:315-318) rebuilds a Map and
 * re-emits in the caller's order, with a comment saying so. The courses beside
 * them were the half that never got it.
 *
 * `Set.has(c.course_id)` is also EXACT-CASE, and `course_id` has no canonical
 * casing upstream (lib/api/public-courses.js:117). Four live courses are not
 * fully uppercase — SQL-PG-Query, SQL-ADM-Tuning, MS-SQL-19-Prov,
 * SQL-ADM-Secure — so an article pinning `sql-pg-query` rendered nothing at
 * all, silently, with no error and no empty-state.
 *
 * ── WHY FIRST-OCCURRENCE WINS, RATHER THAN "THIS CANNOT HAPPEN" ────────────
 * Normalising case merges two codes that differ only by case. Measured against
 * the live catalogue: 79 courses, 4 not fully uppercase, and ZERO pairs
 * differing only by case — so the merge cannot lose anything today.
 *
 * That is a fact about today's data, not a property of the code, and upstream
 * is free to add `MSE-L1` beside `mse-l1` tomorrow. So the rule is written down
 * and asserted instead of assumed: the FIRST catalogue entry for a normalised
 * code wins, deterministically. A future collision then resolves the same way
 * on every render rather than by whichever entry the Map happened to see last.
 *
 * Pure: no db, no fetch, no clock. The page is a server component that awaits
 * both, which is why this is a module and not four lines inside it.
 */

/** Upper-case and trimmed. The one normalisation, used on both sides. */
function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * @param {string[]} pinnedIds course codes in the order the admin arranged them
 * @param {Array<{course_id?: string}>} catalogue the public-course list
 * @returns {Array<object>} the pinned courses, in PINNED order; misses dropped
 */
export function pickPinnedCourses(pinnedIds, catalogue) {
  if (!Array.isArray(pinnedIds) || pinnedIds.length === 0) return [];
  if (!Array.isArray(catalogue) || catalogue.length === 0) return [];

  const byCode = new Map();
  for (const course of catalogue) {
    const code = normalizeCode(course?.course_id);
    // First wins — see the note above. `has` rather than overwrite is the whole
    // of that rule, and it is the line a collision would otherwise turn into a
    // coin toss decided by catalogue order.
    if (code && !byCode.has(code)) byCode.set(code, course);
  }

  const out = [];
  const emitted = new Set();
  for (const pinned of pinnedIds) {
    const code = normalizeCode(pinned);
    if (!code || emitted.has(code)) continue; // a code pinned twice renders once
    const course = byCode.get(code);
    if (course) {
      out.push(course);
      emitted.add(code);
    }
  }
  return out;
}
