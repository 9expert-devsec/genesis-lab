import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getMasterclassRegistrationById } from '@/lib/actions/masterclass-registrations';
import { MasterclassRegDetailClient } from './_components/MasterclassRegDetailClient';

export const dynamic = 'force-dynamic';

export default async function MasterclassRegDetailPage({ params }) {
  await requirePage('mc_registrations');

  const { id } = await params;
  const reg = await getMasterclassRegistrationById(id);
  if (!reg) notFound();
  return <MasterclassRegDetailClient reg={reg} />;
}
