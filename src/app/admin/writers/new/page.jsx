import { requirePage } from '@/lib/rbac/guard';
import { listInstructorOptions } from '@/lib/actions/writers';
import { WriterForm } from '../_components/WriterForm';

export const metadata = {
  title: 'เพิ่มผู้เขียน',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewWriterPage() {
  await requirePage('writers');
  const instructors = await listInstructorOptions();
  return <WriterForm instructors={instructors} />;
}
