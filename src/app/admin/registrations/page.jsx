import { requirePage } from '@/lib/rbac/guard';
import { listRegistrations, getRegistrationStatusCounts } from '@/lib/actions/registrations';
import { buildCourseNameMap } from '@/lib/api/courseNameMap';
import { readLastEditedMap } from '@/lib/audit/readAuditLog';
import { RefreshOnNavigate } from '@/components/admin/RefreshOnNavigate';
import { RegistrationsClient } from './_components/RegistrationsClient';
import { normaliseStatusParam } from '@/lib/registrations/statuses';

export const metadata = { title: 'การลงทะเบียน' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const session = await requirePage('registrations');

  const sp     = (await searchParams) ?? {};
  const page   = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const q      = sp.q      ?? '';
  const source = ['public', 'inhouse'].includes(sp.source) ? sp.source : 'public';
  const range  = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'all';
  /**
   * THE SAME TREATMENT `source` AND `range` ALREADY GET, and it was the one
   * param not getting it.
   *
   * `status` went straight through, so `?status=closed-won` — a value round 2
   * retired, sitting in bookmarks and still-open tabs — reached the query as a
   * clause matching nothing and rendered an EMPTY LIST. Empty reads as lost
   * data, not as a stale bookmark.
   *
   * Normalising to 'all' here is the SCREEN half: it makes the ทั้งหมด chip and
   * the total card render as the selected one, so the controls agree with the
   * rows. `buildRegistrationFilter` degrades the QUERY independently, because
   * `listRegistrations` is a `'use server'` export and can be called without
   * ever passing through this page.
   *
   * It is normalised AFTER `source`, and must be: the two vocabularies are
   * different subsets, so `?status=paid&source=inhouse` is unrecognised while
   * `?status=paid` alone is fine.
   */
  const status = normaliseStatusParam(sp.status ?? 'all', source);

  // The course map is only wanted by the in-house body, so a public render does
  // not ask for it at all — and it joins the existing Promise.all rather than
  // adding a serial await.
  const [data, counts, courseNames] = await Promise.all([
    // `range` goes to BOTH queries. It used to reach only the counts, so the
    // date chips filtered the summary cards and left the table below them
    // showing everything — see buildRegistrationFilter in
    // src/lib/registrations/listFilter.js.
    listRegistrations({ page, status, q, source, range }),
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
      {/*
        `dynamic = 'force-dynamic'` above keeps the SERVER fresh; it does not
        reach the client Router Cache, which is what served a list missing a
        just-created row while the same URL under F5 showed it. See the cost and
        the no-flash reasoning in the component.
      */}
      <RefreshOnNavigate />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">การลงทะเบียน</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {source === 'inhouse' ? 'In-house' : 'Public'} — {data.total} รายการทั้งหมด
          </p>
        </div>
      </div>

      {/*
        The filters go down as PLAIN NAMES, not `initial*`. They are derived
        from searchParams above on every render and the client renders straight
        from them — see the header of RegistrationsClient for what the `initial`
        prefix cost when they were seeded into useState instead.
      */}
      <RegistrationsClient
        initialData={data}
        status={status}
        q={q}
        source={source}
        range={range}
        counts={counts}
        lastEdited={lastEdited}
        courseNames={courseNames}
      />
    </div>
  );
}