/**
 * `href` with an admin list's URL state appended.
 *
 * ── WHY THIS IS HERE AND NOT IN lib/courses ─────────────────────────────────
 * It was defined in lib/courses/adminListQuery, which is where the pattern was
 * invented. /admin/articles then needed the same function for a value that is
 * not a filter at all — a page index — and the choice was between importing
 * articles code out of a `courses` module or writing the five lines twice.
 * Both are worse than moving it: a second copy is a second thing to fix when
 * the "never double an existing `?`" rule turns out to be wrong somewhere.
 *
 * The courses module goes on exporting it, so every existing import and
 * test/pure/adminListQuery keep working against one definition.
 *
 * ── WHAT DELIBERATELY DID *NOT* MOVE ────────────────────────────────────────
 * WHICH params a list carries. That is per-list and stays beside the list that
 * owns them — COURSE_LIST_PARAMS for the course filters, ARTICLE_LIST_PARAMS
 * for the article list's page index — because the two do not validate the same
 * way: a filter is any non-empty string, a page index is a positive integer and
 * `page=0`, `page=abc` and `page=1` must all serialise to nothing.
 *
 * Never produces a bare trailing `?`, and never doubles an existing one.
 */
export function withListQuery(href, query) {
  const base = String(href ?? '');
  const qs = String(query ?? '').replace(/^\?/, '');
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}
