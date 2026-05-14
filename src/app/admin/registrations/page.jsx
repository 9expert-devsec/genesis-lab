import { listRegistrations, getRegistrationStatusCounts } from '@/lib/actions/registrations';
import { RegistrationsClient } from './_components/RegistrationsClient';

export const metadata = { title: 'การลงทะเบียน' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const sp     = (await searchParams) ?? {};
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const status = sp.status ?? 'all';
  const q      = sp.q      ?? '';
  const source = ['public', 'inhouse'].includes(sp.source) ? sp.source : 'public';
  const range  = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';

  const [data, counts] = await Promise.all([
    listRegistrations({ page, status, q, source }),
    getRegistrationStatusCounts({ range, source }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">การลงทะเบียน</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {source === 'inhouse' ? 'In-house' : 'Public'} — {data.total} รายการทั้งหมด
          </p>
        </div>
      </div>

      <RegistrationsClient
        initialData={data}
        initialStatus={status}
        initialQ={q}
        initialSource={source}
        initialRange={range}
        counts={counts}
      />
    </div>
  );
}