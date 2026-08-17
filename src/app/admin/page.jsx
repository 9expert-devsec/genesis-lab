import { getDashboardMetrics } from '@/lib/actions/dashboard';
import { ADMIN_SCHEDULE_STATUSES, getAllSchedules } from '@/lib/api/schedules';
import { requirePage } from '@/lib/rbac/guard';
import { DashboardClient } from './_components/DashboardClient';

export const metadata = { title: 'แดชบอร์ด' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const range = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'today';

  const session = await requirePage('dashboard');
  const isSuperadmin = session?.user?.isSuperadmin ?? false;

  // Fetch metrics and open schedules in parallel.
  //
  // status: all — same reason as the admin schedules table (see
  // app/admin/schedules/page.jsx). Without it this reads the PUBLIC-filtered
  // feed, so the dashboard tile counted fewer rounds than the table an admin
  // reaches by clicking it: a round set to เต็ม left the count but stayed in
  // the grid. Two admin surfaces disagreeing about how many rounds exist is
  // worse than either number alone.
  const [metrics, schedulesRes] = await Promise.allSettled([
    getDashboardMetrics(range),
    // includeStarted — the public surfaces now drop a round the moment its
    // first training day arrives. This tile is an ADMIN count and must not
    // move: an admin manages rounds that have started and rounds that have
    // finished, and this number has to keep agreeing with the /admin/schedules
    // table it links to. Two admin surfaces disagreeing about how many rounds
    // exist is exactly what `status: all` was added to stop.
    getAllSchedules({ status: ADMIN_SCHEDULE_STATUSES, includeStarted: true }),
  ]);

  const data   = metrics.status === 'fulfilled' ? metrics.value : null;
  const openSchedulesCount =
    schedulesRes.status === 'fulfilled'
      ? (schedulesRes.value?.items?.length ?? 0)
      : 0;

  return (
    <DashboardClient
      data={data}
      openSchedulesCount={openSchedulesCount}
      initialRange={range}
      isSuperadmin={isSuperadmin}
    />
  );
}