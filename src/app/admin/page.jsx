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
    getAllSchedules({ status: ADMIN_SCHEDULE_STATUSES }),
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