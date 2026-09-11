import {
  listMasterclassRegistrations,
  getMasterclassRegStatusCounts,
  getMasterclassCourseOptions,
} from '@/lib/actions/masterclass-registrations';
import { requirePage } from '@/lib/rbac/guard';
import { masterclassRegistrationListQuery } from '@/lib/masterclass/registrationListQuery';
import { pageClampTarget } from '@/lib/adminListQuery';
import { redirect } from 'next/navigation';
import { MasterclassRegistrationsClient } from './_components/MasterclassRegistrationsClient';

export const metadata = { title: 'Masterclass — ผู้ลงทะเบียน' };
export const dynamic  = 'force-dynamic';

export default async function MasterclassRegistrationsPage({ searchParams }) {
  await requirePage('mc_registrations');

  const sp      = (await searchParams) ?? {};
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const status  = sp.status   ?? 'all';
  const q       = sp.q        ?? '';
  const range   = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';
  const courseId = sp.courseId ?? '';
  const batchId  = sp.batchId  ?? '';
  const licenseScope = ['all', 'per_attendee'].includes(sp.licenseScope) ? sp.licenseScope : '';
  const perPage = Math.min(100, Math.max(5, parseInt(sp.ppp ?? '', 10) || 20));

  const [data, counts, courseOptions] = await Promise.all([
    listMasterclassRegistrations({ page, status, q, courseId, batchId, licenseScope, perPage }),
    getMasterclassRegStatusCounts({ range }),
    getMasterclassCourseOptions(),
  ]);

  /**
   * THE LIST'S URL STATE, as one string, for every row link — the detail page
   * puts it back on ← and on the post-delete redirect
   * (lib/masterclass/registrationListQuery). A page past the end — the admin
   * deleted the only row on it and came back — is clamped by redirect to the
   * last page that has rows; page 1 and in-range pages pass through. See
   * pageClampTarget. redirect() throws, so it sits after the awaits.
   */
  const listQuery = masterclassRegistrationListQuery(sp);
  const clampTo = pageClampTarget({
    path: '/admin/masterclass/registrations',
    query: listQuery,
    pageKey: 'page',
    page,
    pageCount: data.pageCount,
  });
  if (clampTo) redirect(clampTo);

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
      {/*
        PLAIN NAMES, not `initial*`. These are derived from searchParams above on
        every render and the client renders straight from them — see the header
        of MasterclassRegistrationsClient for what the prefix cost when they were
        seeded into useState.
      */}
      <MasterclassRegistrationsClient
        initialData={data}
        status={status}
        q={q}
        range={range}
        courseId={courseId}
        batchId={batchId}
        licenseScope={licenseScope}
        counts={counts}
        courseOptions={courseOptions}
        listQuery={listQuery}
      />
    </div>
  );
}
