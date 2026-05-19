import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { InstructorsAdminClient } from './_components/InstructorsAdminClient';

export const metadata = {
  title: 'จัดการวิทยากร',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminInstructorsPage() {
  const instructors = await listInstructorsForAdmin();
  return (
    <div className="mx-auto max-w-5xl">
      <InstructorsAdminClient instructors={instructors} />
    </div>
  );
}
