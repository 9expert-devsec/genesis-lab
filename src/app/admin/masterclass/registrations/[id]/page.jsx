import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getMasterclassRegistrationById } from '@/lib/actions/masterclass-registrations';
import { MasterclassRegDetailClient } from './_components/MasterclassRegDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { masterclassRegistrationListQuery } from '@/lib/masterclass/registrationListQuery';

export const dynamic = 'force-dynamic';

export default async function MasterclassRegDetailPage({ params, searchParams }) {
  await requirePage('mc_registrations');

  const { id } = await params;
  const reg = await getMasterclassRegistrationById(id);
  if (!reg) notFound();

  // Where ← and the post-delete redirect go: the list, with the filters and
  // page the row link carried here (lib/masterclass/registrationListQuery).
  // This route is already force-dynamic. A bare arrival yields '' → bare list.
  const listQuery = masterclassRegistrationListQuery(await searchParams);
  return (
    <div className="space-y-4">
      <MasterclassRegDetailClient reg={reg} listQuery={listQuery} />
      <RecordHistory menu="mc_registrations" entity="registration" recordId={String(reg._id)} />
    </div>
  );
}
