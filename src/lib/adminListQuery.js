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

/**
 * A reader for one list's URL state: `params` in, a function from a set of
 * search params to the query string that reproduces them.
 *
 * ── ONE MECHANISM, PER-LIST PARAMS ──────────────────────────────────────────
 * This is courseListQuery with the param list lifted out. It was lifted when
 * the same defect — open a row, come back, land on page 1 with the filters
 * gone — was found on four more lists (public /articles, /admin/registrations,
 * /admin/masterclass/registrations, and the courses → rename hop), and the
 * choice was between four copies of one loop and one loop over four lists.
 * Each list still owns WHICH params are its state, beside the list, because
 * that is the part that differs.
 *
 * ── THE RULES, SAME AS courseListQuery ALWAYS HAD ───────────────────────────
 * Accepts a URLSearchParams, a plain object (Next's `searchParams` prop), or
 * null. Order is FIXED by `params`, not by insertion, so the same state always
 * produces the same string. Empty and whitespace-only values are dropped, so a
 * list arrived at bare produces '' and every link out of it stays bare — the
 * guard against the fix inventing state. Repeated params take the first value.
 * Values are carried AS TYPED: this function does not know a page from a
 * filter and does not try to; the list that reads the URL already validates
 * each one, and a link that reproduces the list's own URL cannot disagree with
 * it.
 *
 * ── THE NAMESPACED CASE ─────────────────────────────────────────────────────
 * A param name is a URL key, nothing more. `inhouse.page` is as much a param as
 * `page`, so the registrations list's per-source namespace is carried by
 * listing both spellings — see lib/registrations/listQuery.
 */
export function listQueryReader(params) {
  const names = Object.freeze([...params]);
  return function listQuery(searchParams) {
    if (!searchParams) return '';
    const read = (key) => {
      if (typeof searchParams.get === 'function') return searchParams.get(key);
      const raw = searchParams[key];
      return Array.isArray(raw) ? raw[0] : raw;
    };

    const out = new URLSearchParams();
    for (const key of names) {
      const value = read(key);
      if (value == null) continue;
      const trimmed = String(value).trim();
      if (trimmed) out.set(key, trimmed);
    }
    return out.toString();
  };
}

/**
 * Where a list should send a request for a page that no longer exists — or
 * null when the requested page is fine.
 *
 * ── THE CASE ────────────────────────────────────────────────────────────────
 * The admin is on page 29, opens its only row, deletes it, and is sent back to
 * page 29 with every filter intact — the whole point of carrying the query.
 * But page 29 has no rows now. Landing there shows an empty table under a
 * pager that says 28 pages, which reads as "the filter lost everything".
 *
 * ── CLAMP, IN THE READER, BY REDIRECT ───────────────────────────────────────
 * The list page — which already knows the page count — redirects to the LAST
 * PAGE THAT HAS ROWS with the rest of the query untouched. In the reader rather
 * than in the delete handler, because a stale bookmark and a pasted link hit
 * the same condition and deserve the same answer. By redirect rather than by
 * silently rendering page 28 under a URL that says 29, because the query
 * string is the state and the address bar has to tell the truth.
 *
 * Only an OVER-RANGE page is touched. Page 1, a page within range, and a page
 * that the list already normalised are all null here — nothing is invented for
 * a bare arrival. When no page has rows the target is page 1, spelled as an
 * ABSENT param because that is how every list spells its first page.
 *
 * @param {object} args
 * @param {string} args.path      the list's pathname
 * @param {string} args.query     the list's current query string
 * @param {string} args.pageKey   the URL key the page lives under ('page', 'inhouse.page')
 * @param {number} args.page      the page the URL asked for, already parsed
 * @param {number} args.pageCount the number of pages that have rows
 * @returns {string|null}
 */
export function pageClampTarget({ path, query, pageKey, page, pageCount }) {
  const asked = Number(page);
  const last = Math.max(1, Number.isInteger(Number(pageCount)) ? Number(pageCount) : 1);
  if (!Number.isInteger(asked) || asked <= last) return null;
  const params = new URLSearchParams(String(query ?? '').replace(/^\?/, ''));
  if (last > 1) params.set(pageKey, String(last));
  else params.delete(pageKey);
  return withListQuery(path, params.toString());
}
