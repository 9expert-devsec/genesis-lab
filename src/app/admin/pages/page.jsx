import { requirePage } from '@/lib/rbac/guard';
import { canUseAdvanced } from '@/lib/rbac/access';
import { getCustomPages } from '@/lib/actions/customPages';
import { getPageBuilderPages } from '@/lib/actions/pageBuilder';
import { CustomPagesAdminClient } from './_components/CustomPagesAdminClient';

export const metadata = { title: 'จัดการหน้าเพจ' };
export const dynamic = 'force-dynamic';

export default async function CustomPagesAdminPage() {
  const session = await requirePage('pages');

  // Both page types share this list. Tag each row with `_type` so the client
  // can branch actions/links, then merge newest-first.
  const [custom, builder] = await Promise.all([
    getCustomPages({ limit: 200 }),
    getPageBuilderPages({ limit: 200 }),
  ]);
  const pages = [
    ...custom.items.map((p) => ({ ...p, _type: 'advanced_html' })),
    ...builder.items.map((p) => ({ ...p, _type: 'builder' })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Advanced-HTML (legacy raw HTML) is developer-tier only — the client hides
  // the create option below that tier, but the list shows existing ones to all.
  return <CustomPagesAdminClient pages={pages} canCreateAdvanced={canUseAdvanced(session.user)} />;
}
