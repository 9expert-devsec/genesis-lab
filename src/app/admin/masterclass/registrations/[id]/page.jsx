import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getMasterclassRegistrationById } from '@/lib/actions/masterclass-registrations';
import { MasterclassRegDetailClient } from './_components/MasterclassRegDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';

export const dynamic = 'force-dynamic';

export default async function MasterclassRegDetailPage({ params }) {
  await requirePage('mc_registrations');

  const { id } = await params;
  const reg = await getMasterclassRegistrationById(id);
  if (!reg) notFound();
  return (
    <div className="space-y-4">
      <MasterclassRegDetailClient reg={reg} />
      <RecordHistory menu="mc_registrations" entity="registration" recordId={String(reg._id)} />
    </div>
  );
}
