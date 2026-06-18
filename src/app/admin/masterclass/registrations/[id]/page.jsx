import { notFound } from 'next/navigation';
import { getMasterclassRegistrationById } from '@/lib/actions/masterclass-registrations';
import { MasterclassRegDetailClient } from './_components/MasterclassRegDetailClient';

export const dynamic = 'force-dynamic';

export default async function MasterclassRegDetailPage({ params }) {
  const { id } = await params;
  const reg = await getMasterclassRegistrationById(id);
  if (!reg) notFound();
  return <MasterclassRegDetailClient reg={reg} />;
}
