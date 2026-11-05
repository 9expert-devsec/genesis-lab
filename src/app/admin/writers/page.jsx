import { requirePage } from '@/lib/rbac/guard';
import { listWriters } from '@/lib/actions/writers';
import { WritersAdminClient } from './_components/WritersAdminClient';

export const metadata = {
  title: 'ผู้เขียน',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['all', 'active', 'inactive']);

/**
 * Every filter is read here and passed down as a prop, for the reason
 * test/fs/urlFilterNoState exists: a filter copied into `useState` goes stale
 * when a navigation keeps the component instance.
 */
export default async function WritersAdminPage({ searchParams }) {
  await requirePage('writers');

  const sp = (await searchParams) ?? {};
  const status = STATUSES.has(sp.status) ? sp.status : 'all';
  const q = String(sp.q ?? '');
  const { rows, counts } = await listWriters({ status, q });

  return <WritersAdminClient rows={rows} counts={counts} status={status} q={q} />;
}
