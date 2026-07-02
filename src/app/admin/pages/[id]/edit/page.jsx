import { notFound } from 'next/navigation';
import { getCustomPageById } from '@/lib/actions/customPages';
import { requirePage } from '@/lib/rbac/guard';
import { CustomPageForm } from '../../_components/CustomPageForm';

export const metadata = { title: 'แก้ไขหน้าเพจ' };
export const dynamic  = 'force-dynamic';

export default async function EditCustomPage({ params }) {
  const session = await requirePage('pages');

  const { id } = await params;

  const page = await getCustomPageById(id);
  if (!page) notFound();
  const isSuperAdmin = session?.user?.isSuperadmin ?? false;

  return <CustomPageForm page={page} isSuperAdmin={isSuperAdmin} />;
}
