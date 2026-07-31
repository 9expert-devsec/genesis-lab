import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getRegistrationById } from '@/lib/actions/registrations';
import { RegistrationDetailClient } from '../_components/RegistrationDetailClient';
import { RecordHistory } from '@/components/audit/RecordHistory';
import { refNo } from '@/lib/refNo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `ใบสมัคร ${refNo(id)}` };
}

export default async function Page({ params }) {
  await requirePage('registrations');

  const { id } = await params;
  const doc = await getRegistrationById(id);
  if (!doc) notFound();

  return (
    <div className="space-y-4">
      <RegistrationDetailClient doc={doc} />
      {/* menu/entity are written HERE, in the mount point — never derived from
          the URL or client state. The reader re-checks canAccess regardless. */}
      <RecordHistory menu="registrations" entity="public" recordId={String(doc._id)} />
    </div>
  );
}