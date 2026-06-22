import {
  listMasterclassRegistrations,
  getMasterclassRegStatusCounts,
  getMasterclassCourseOptions,
} from '@/lib/actions/masterclass-registrations';
import { forbidden } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { MasterclassRegistrationsClient } from './_components/MasterclassRegistrationsClient';

export const metadata = { title: 'Masterclass — ผู้ลงทะเบียน' };
export const dynamic  = 'force-dynamic';

export default async function MasterclassRegistrationsPage({ searchParams }) {
  const session = await auth();
  if (!new Set(['superadmin', 'owner', 'admin', 'registration_admin', 'it_support_admin']).has(session?.user?.role)) forbidden();

  const sp      = (await searchParams) ?? {};
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const status  = sp.status   ?? 'all';
  const q       = sp.q        ?? '';
  const range   = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';
  const courseId = sp.courseId ?? '';
  const batchId  = sp.batchId  ?? '';

  const [data, counts, courseOptions] = await Promise.all([
    listMasterclassRegistrations({ page, status, q, courseId, batchId }),
    getMasterclassRegStatusCounts({ range }),
    getMasterclassCourseOptions(),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            Masterclass — ผู้ลงทะเบียน
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {data.total} รายการทั้งหมด
          </p>
        </div>
      </div>
      <MasterclassRegistrationsClient
        initialData={data}
        initialStatus={status}
        initialQ={q}
        initialRange={range}
        initialCourseId={courseId}
        initialBatchId={batchId}
        counts={counts}
        courseOptions={courseOptions}
      />
    </div>
  );
}
