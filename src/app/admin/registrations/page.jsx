import { requirePage } from '@/lib/rbac/guard';
import { listRegistrations, getRegistrationStatusCounts } from '@/lib/actions/registrations';
import { buildCourseNameMap } from '@/lib/api/courseNameMap';
import { readLastEditedMap } from '@/lib/audit/readAuditLog';
import { RegistrationsClient } from './_components/RegistrationsClient';

export const metadata = { title: 'การลงทะเบียน' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const session = await requirePage('registrations');

  const sp     = (await searchParams) ?? {};
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const status = sp.status ?? 'all';
  const q      = sp.q      ?? '';
  const source = ['public', 'inhouse'].includes(sp.source) ? sp.source : 'public';
  const range  = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';

  // The course map is only wanted by the in-house body, so a public render does
  // not ask for it at all — and it joins the existing Promise.all rather than
  // adding a serial await.
  const [data, counts, courseNames] = await Promise.all([
    listRegistrations({ page, status, q, source }),
    getRegistrationStatusCounts({ range, source }),
    source === 'inhouse' ? buildCourseNameMap() : Promise.resolve(null),
  ]);

  // ONE audit query for the whole page, never one per row. It has to follow the
  // list because it needs the ids the list actually returned — a page of 20 is
  // one $in of 20, served by {recordId:1, createdAt:-1} with no sort stage.
  //
  // `entity` mirrors `source`, which is why this page adds exactly ONE query
  // and not two: it renders one entity at a time.
  const lastEdited = await readLastEditedMap({
    user: session?.user ?? null,
    menu: 'registrations',
    entity: source === 'inhouse' ? 'inhouse' : 'public',
    recordIds: data.items.map((r) => String(r._id)),
  });

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
        lastEdited={lastEdited}
        courseNames={courseNames}
      />
    </div>
  );
}