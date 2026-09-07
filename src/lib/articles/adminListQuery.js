/**
 * The /admin/articles list's page position, carried in the URL.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * The pager was `useState(1)` and the page index reached the address bar
 * nowhere: on page 2 the URL was a bare /admin/articles. Opening a row and
 * coming back — by the ← link or by the create redirect — unmounts the list, so
 * React reseeds the state and the admin lands on page 1, having lost their
 * place in a 486-row list. Reported against the บทความ screen; the identical
 * complaint against /admin/courses' filters is what produced the sibling module
 * lib/courses/adminListQuery, and this is the same pattern applied to the value
 * this screen has.
 *
 * The URL survives everything component state does not: a client navigation, a
 * reload, a browser Back, and a link pasted to a colleague.
 *
 * ── AND THE WAY BACK HAS TO CARRY IT ────────────────────────────────────────
 * A page index in the URL only survives the round trip if every outbound link
 * reproduces it. So the list's แก้ไข links append it, the edit page reads it off
 * its own URL and puts it on its ← control, and the create screen's redirect
 * does the same. Miss one hop and the position is lost at exactly that step —
 * which is indistinguishable from the bug this replaces.
 *
 * ── WHY THIS IS NOT courseListQuery WITH A DIFFERENT PARAMS LIST ────────────
 * A course filter is any non-empty string and serialises as typed. A page index
 * is a positive integer, and three separate values must serialise to NOTHING:
 * `page=1` (the default — writing it makes an unpaged list look paged), `page=0`
 * and `page=abc` (a hand-typed or truncated URL). That is a different function,
 * not the same one over different keys, so the two live apart and share only
 * `withListQuery` — see lib/adminListQuery.
 */

// Bound then re-exported, not `export { x } from '…'` — see the note on the
// same line in lib/courses/adminListQuery for why the two forms are not
// interchangeable as far as test/fs/libImportsResolved is concerned.
import { withListQuery } from '@/lib/adminListQuery';

export { withListQuery };

/** The only param that belongs to the article list's URL state. */
export const ARTICLE_LIST_PARAMS = ['page'];

/**
 * The page index named by a set of search params — always a positive integer,
 * defaulting to 1.
 *
 * Accepts a URLSearchParams, a plain object (Next's `searchParams` prop), or
 * null, exactly as courseListQuery does. Anything that is not a positive
 * integer reads as page 1 rather than as an error: this value arrives from the
 * address bar, so a person can type it, and a truncated paste should land the
 * admin on the list rather than on a blank table.
 */
export function readListPage(searchParams) {
  if (!searchParams) return 1;
  const raw = typeof searchParams.get === 'function'
    ? searchParams.get('page')
    : (Array.isArray(searchParams.page) ? searchParams.page[0] : searchParams.page);

  // Number(), not parseInt(): parseInt('2abc') is 2, so a corrupt param would
  // silently become a real page instead of falling back to the first one.
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/**
 * The query string for a page index, or '' for page 1 and for anything invalid.
 *
 * Takes the NUMBER rather than a searchParams bag, because the list serialises
 * from the page it is actually rendering — which is the URL's value clamped to
 * the pages that exist — and not from the raw param it was handed.
 */
export function pageQuery(page) {
  const n = Number(page);
  return Number.isInteger(n) && n > 1 ? `page=${n}` : '';
}

/** The list's URL state as read off a set of search params. */
export function articleListQuery(searchParams) {
  return pageQuery(readListPage(searchParams));
}
