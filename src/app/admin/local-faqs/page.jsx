import { requirePage } from '@/lib/rbac/guard';
import { getAllLocalFaqs } from '@/lib/masterclass/getMasterclass';
import { LocalFaqAdminClient } from './_components/LocalFaqAdminClient';

export const metadata = { title: 'จัดการ FAQ (Local)' };
export const dynamic = 'force-dynamic';

export default async function LocalFaqAdminPage() {
  await requirePage('local_faqs');

  const faqs = await getAllLocalFaqs();
  return <LocalFaqAdminClient faqs={faqs} />;
}
