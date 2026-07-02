import { requirePage } from '@/lib/rbac/guard';
import { CustomPageForm } from '../_components/CustomPageForm';

export const metadata = { title: 'สร้างหน้าเพจใหม่' };
export const dynamic  = 'force-dynamic';

export default async function NewCustomPage() {
  const session = await requirePage('pages');
  const isSuperAdmin = session?.user?.isSuperadmin ?? false;
  return <CustomPageForm page={null} isSuperAdmin={isSuperAdmin} />;
}
