import { getAllMasterclassCourses } from '@/lib/masterclass/getMasterclass';
import { MasterclassCourseListClient } from './_components/MasterclassCourseListClient';

export const metadata = { title: 'จัดการ Masterclass' };
export const dynamic = 'force-dynamic';

export default async function MasterclassAdminPage() {
  const courses = await getAllMasterclassCourses();
  return <MasterclassCourseListClient courses={courses} />;
}
