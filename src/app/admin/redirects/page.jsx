import { requirePage } from '@/lib/rbac/guard';
import { listRedirectRules, listNotFoundHits } from '@/lib/actions/redirects';
import { RedirectsAdminClient } from './_components/RedirectsAdminClient';

export const metadata = {
  title: 'Redirect & 404',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ── EVERY FILTER IS READ HERE AND PASSED DOWN AS A PROP ───────────────────
 *
 * The same shape as /admin/webhook-logs, and for the reason
 * test/fs/urlFilterNoState exists: a filter copied into `useState` goes STALE.
 * React keeps the component instance when you navigate to the same route with
 * different searchParams, so the state holds the old value while the props
 * carry the new one — the filter chip says one thing and the list shows
 * another. The pattern was found on six screens and comes back by habit.
 *
 * So the server reads the URL, the server runs the query, and the client
 * receives values it never owns. There is no filter state in the client at all.
 */
export default async function RedirectsAdminPage({ searchParams }) {
  await requirePage('redirects');

  const sp = (await searchParams) ?? {};
  const view = sp.view === 'log' ? 'log' : 'rules';
  const q = String(sp.q ?? '');
  const host = String(sp.host ?? '');
  const page = Number(sp.page) || 1;
  const includeResolved = sp.resolved === '1';

  // Only the visible tab is queried. The other tab's data arrives when the
  // admin navigates to it — this screen must not run two paginated queries on
  // every open to populate a panel nobody is looking at.
  const [rules, hits] = await Promise.all([
    view === 'rules' ? listRedirectRules({ q, host, page }) : Promise.resolve(null),
    view === 'log' ? listNotFoundHits({ q, page, includeResolved }) : Promise.resolve(null),
  ]);

  return (
    <RedirectsAdminClient
      view={view}
      q={q}
      hostFilter={host}
      page={page}
      includeResolved={includeResolved}
      rules={rules}
      hits={hits}
    />
  );
}
