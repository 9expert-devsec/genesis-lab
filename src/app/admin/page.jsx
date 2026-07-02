import { getDashboardMetrics } from '@/lib/actions/dashboard';
import { getAllSchedules } from '@/lib/api/schedules';
import { requirePage } from '@/lib/rbac/guard';
import { DashboardClient } from './_components/DashboardClient';

export const metadata = { title: 'แดชบอร์ด' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const range = ['today', 'week', 'month', 'all'].includes(sp.range) ? sp.range : 'today';

  const session = await requirePage('dashboard');
  const isSuperadmin = session?.user?.isSuperadmin ?? false;

  // Fetch metrics and open schedules in parallel
  const [metrics, schedulesRes] = await Promise.allSettled([
    getDashboardMetrics(range),
    getAllSchedules(),
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