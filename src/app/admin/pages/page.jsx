import { requirePage } from '@/lib/rbac/guard';
import { getCustomPages } from '@/lib/actions/customPages';
import { CustomPagesAdminClient } from './_components/CustomPagesAdminClient';

export const metadata = { title: 'จัดการหน้าเพจ' };
export const dynamic = 'force-dynamic';

export default async function CustomPagesAdminPage() {
  await requirePage('pages');

  const { items } = await getCustomPages({ limit: 200 });
  return <CustomPagesAdminClient pages={items} />;
}
