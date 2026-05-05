import { getAllPromotions, getAllConfigs } from '@/lib/promotions/getPromotions';
import { PromotionsAdminClient } from './_components/PromotionsAdminClient';

export const metadata = { title: 'จัดการโปรโมชั่น' };
export const dynamic = 'force-dynamic';

export default async function PromotionsAdminPage() {
  const [promotions, configMap] = await Promise.all([
    getAllPromotions(),
    getAllConfigs(),
  ]);

  // Latest synced_at across all rows — admin-visible "last sync" indicator.
  const lastSyncedAt = promotions.reduce((acc, p) => {
    if (!p.synced_at) return acc;
    const t = new Date(p.synced_at).getTime();
    return Number.isNaN(t) ? acc : Math.max(acc, t);
  }, 0);

  return (
    <PromotionsAdminClient
      promotions={promotions}
      configMap={configMap}
      lastSyncedAt={lastSyncedAt > 0 ? new Date(lastSyncedAt).toISOString() : null}
    />
  );
}
