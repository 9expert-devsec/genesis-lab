import { getAllFaqs } from '@/lib/faqs/getFaqs';
import { FaqsAdminClient } from './_components/FaqsAdminClient';

export const metadata = { title: 'จัดการ FAQ' };
export const dynamic = 'force-dynamic';

export default async function FaqsAdminPage() {
  const faqs = await getAllFaqs();

  // Latest synced_at across all rows — admin-visible "last sync" indicator.
  const lastSyncedAt = faqs.reduce((acc, f) => {
    if (!f.synced_at) return acc;
    const t = new Date(f.synced_at).getTime();
    return Number.isNaN(t) ? acc : Math.max(acc, t);
  }, 0);

  return (
    <FaqsAdminClient
      faqs={faqs}
      lastSyncedAt={lastSyncedAt > 0 ? new Date(lastSyncedAt).toISOString() : null}
    />
  );
}