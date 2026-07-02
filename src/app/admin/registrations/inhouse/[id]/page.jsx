import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getInhouseRegistrationById } from '@/lib/actions/inhouse-registrations';
import { InhouseDetailClient } from '../_components/InhouseDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `In-house Request ${String(id).slice(-8).toUpperCase()}` };
}

export default async function Page({ params }) {
  await requirePage('registrations');

  const { id } = await params;
  const doc = await getInhouseRegistrationById(id);
  if (!doc) notFound();

  return <InhouseDetailClient doc={doc} />;
}