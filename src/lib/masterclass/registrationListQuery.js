/**
 * The /admin/masterclass/registrations list's URL state, carried into a
 * detail page and back out of it.
 *
 * Same defect and same mechanism as lib/registrations/listQuery: the row
 * link, the ← link and the delete redirect were all bare, so a filtered,
 * paged list came back as page 1 unfiltered. See lib/adminListQuery.
 *
 * `ppp` — the auto-fitted page size — is state too: a page index only means
 * something at the page size it was computed under, and the list re-fits it
 * on mount anyway, so carrying it costs nothing and dropping it would land the
 * admin on the wrong page.
 */
import { listQueryReader, withListQuery } from '@/lib/adminListQuery';

export { withListQuery };

/** Everything the list page reads out of its searchParams, in URL order. */
export const MASTERCLASS_REGISTRATION_LIST_PARAMS = [
  'status', 'q', 'range', 'courseId', 'batchId', 'licenseScope', 'page', 'ppp',
];

/** The list's URL state as read off a set of search params, or '' when bare. */
export const masterclassRegistrationListQuery = listQueryReader(MASTERCLASS_REGISTRATION_LIST_PARAMS);
