import { auth } from '@/lib/auth/options';
import { CustomPageForm } from '../_components/CustomPageForm';

export const metadata = { title: 'สร้างหน้าเพจใหม่' };
export const dynamic  = 'force-dynamic';

export default async function NewCustomPage() {
  const session = await auth();
  const isSuperAdmin = session?.user?.role === 'superadmin';
  return <CustomPageForm page={null} isSuperAdmin={isSuperAdmin} />;
}
