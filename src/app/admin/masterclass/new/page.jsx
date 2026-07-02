import { requirePage } from '@/lib/rbac/guard';
import { MasterclassCourseFormClient } from '../_components/MasterclassCourseFormClient';

export const metadata = { title: 'สร้างหลักสูตร Masterclass ใหม่' };

export default async function NewMasterclassPage() {
  await requirePage('masterclass');

  return <MasterclassCourseFormClient course={null} />;
}
