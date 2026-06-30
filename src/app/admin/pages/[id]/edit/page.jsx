import { notFound } from 'next/navigation';
import { getCustomPageById } from '@/lib/actions/customPages';
import { auth } from '@/lib/auth/options';
import { CustomPageForm } from '../../_components/CustomPageForm';

export const metadata = { title: 'แก้ไขหน้าเพจ' };
export const dynamic  = 'force-dynamic';

export default async function EditCustomPage({ params }) {
  const { id } = await params;

  const [session, page] = await Promise.all([
    auth(),
    getCustomPageById(id),
  ]);
  if (!page) notFound();
  const isSuperAdmin = session?.user?.role === 'superadmin';

  return <CustomPageForm page={page} isSuperAdmin={isSuperAdmin} />;
}
