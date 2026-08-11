/**
 * The /admin/courses list's filter state, carried in the URL.
 *
 * ── WHY THE URL AND NOT COMPONENT STATE ─────────────────────────────────────
 * The filters were `useState` in CoursesAdminClient, so opening a course and
 * coming back reset them — the admin re-typed the search every time they edited
 * a course in a filtered set. Component state cannot survive a navigation, and
 * the App Router unmounts the list when you leave it.
 *
 * The URL survives everything the state does not: a client navigation, a real
 * page load, a bookmark, a browser back, and a link someone pastes to a
 * colleague. That last one is a genuine gain rather than a side effect.
 *
 * ── AND WHY THE BACK LINKS HAVE TO CARRY IT ─────────────────────────────────
 * A filter in the URL only survives the round trip if the way BACK reproduces
 * it. So the list's row links append the current query, the edit page reads it
 * and puts it on its own ← control, and the promos/FAQ page does the same one
 * hop further out. Miss a link in that chain and the filter is silently lost at
 * exactly that step, which is indistinguishable from the bug this replaces.
 */

/** The only params that belong to the list's filter state. */
export const COURSE_LIST_PARAMS = ['q', 'program', 'type'];

/**
 * The filter query string for a set of search params, or '' when nothing is set.
 *
 * Accepts a URLSearchParams, a plain object (Next's `searchParams` prop), or
 * null. Order is FIXED by COURSE_LIST_PARAMS rather than by insertion, so the
 * same filters always produce the same string — otherwise two links to the same
 * filtered list compare as different and the tests would be order-dependent.
 *
 * Empty values are dropped: `?q=` is noise that survives into every link and
 * makes a "no filters" URL look filtered.
 */
export function courseListQuery(searchParams) {
  if (!searchParams) return '';
  const read = (key) => {
    if (typeof searchParams.get === 'function') return searchParams.get(key);
    const raw = searchParams[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  const out = new URLSearchParams();
  for (const key of COURSE_LIST_PARAMS) {
    const value = read(key);
    if (value == null) continue;
    const trimmed = String(value).trim();
    if (trimmed) out.set(key, trimmed);
  }
  return out.toString();
}

/**
 * `href` with the list filters appended, or unchanged when there are none.
 *
 * Never produces a bare trailing `?`, and never doubles an existing one.
 */
export function withListQuery(href, query) {
  const base = String(href ?? '');
  const qs = String(query ?? '').replace(/^\?/, '');
  if (!qs) return base;
  return base + (base.includes('?') ? '&' : '?') + qs;
}
