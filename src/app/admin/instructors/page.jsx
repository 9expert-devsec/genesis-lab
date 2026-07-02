import { requirePage } from '@/lib/rbac/guard';
import { listInstructorsForAdmin } from '@/lib/actions/instructors';
import { InstructorsAdminClient } from './_components/InstructorsAdminClient';

export const metadata = {
  title: 'จัดการวิทยากร',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AdminInstructorsPage() {
  await requirePage('instructors');

  const instructors = await listInstructorsForAdmin();
  return (
    <div>
      <InstructorsAdminClient instructors={instructors} />
    </div>
  );
}
