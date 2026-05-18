import { getAllCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { CareerPathsAdminClient } from './_components/CareerPathsAdminClient';

export const metadata = { title: 'จัดการ Career Path' };
export const dynamic = 'force-dynamic';

export default async function CareerPathsAdminPage() {
  const careerPaths = await getAllCareerPaths();

  // Latest synced_at across all rows — admin-visible "last sync" indicator.
  const lastSyncedAt = careerPaths.reduce((acc, c) => {
    if (!c.synced_at) return acc;
    const t = new Date(c.synced_at).getTime();
    return Number.isNaN(t) ? acc : Math.max(acc, t);
  }, 0);

  return (
    <CareerPathsAdminClient
      careerPaths={careerPaths}
      lastSyncedAt={lastSyncedAt > 0 ? new Date(lastSyncedAt).toISOString() : null}
    />
  );
}