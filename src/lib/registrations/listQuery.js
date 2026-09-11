/**
 * The /admin/registrations list's URL state, carried into a detail page and
 * back out of it.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 * On /admin/registrations?source=inhouse&inhouse.page=3 the admin opened a
 * request, deleted it, and was sent to /admin/registrations?source=inhouse —
 * page 1, filters gone. The row links were bare, the ← control was
 * `router.back()` (which has nothing to go back to in a new tab), and the
 * delete redirects were hard-coded. The mechanism is lib/adminListQuery's.
 *
 * ── BOTH NAMESPACES ARE STATE, AND SO IS `source` ───────────────────────────
 * This list keeps public's filters under the bare names and in-house's under
 * `inhouse.` — both sets live in the URL at once, and `source` says which is
 * on screen (lib/registrations/filterScope). A round trip that kept
 * `inhouse.page` and dropped `q` would silently empty public's search the
 * next time the admin toggled, so the param list is BOTH spellings of every
 * per-source param plus `source`, derived from the same enumeration the page
 * and the writer use. Adding a per-source param there adds it here.
 */
import { listQueryReader, withListQuery } from '@/lib/adminListQuery';
import { PER_SOURCE_PARAMS, SOURCE_VALUES, filterParamKey } from '@/lib/registrations/filterScope';

export { withListQuery };

/** `source` first, then every per-source param under each source's key. */
export const REGISTRATION_LIST_PARAMS = Object.freeze([
  'source',
  ...SOURCE_VALUES.flatMap((source) => PER_SOURCE_PARAMS.map((name) => filterParamKey(name, source))),
]);

/** The list's URL state as read off a set of search params, or '' when bare. */
export const registrationListQuery = listQueryReader(REGISTRATION_LIST_PARAMS);
