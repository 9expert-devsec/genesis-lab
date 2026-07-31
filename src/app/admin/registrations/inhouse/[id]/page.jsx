import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getInhouseRegistrationById } from '@/lib/actions/inhouse-registrations';
import { InhouseDetailClient } from '../_components/InhouseDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { refNo } from '@/lib/refNo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `In-house Request ${refNo(id)}` };
}

export default async function Page({ params }) {
  await requirePage('registrations');

  const { id } = await params;
  const doc = await getInhouseRegistrationById(id);
  if (!doc) notFound();

  return (
    <div className="space-y-4">
      <InhouseDetailClient doc={doc} />
      <RecordHistory menu="registrations" entity="inhouse" recordId={String(doc._id)} />
    </div>
  );
}