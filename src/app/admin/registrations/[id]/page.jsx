import { notFound } from 'next/navigation';
import { getRegistrationById } from '@/lib/actions/registrations';
import { RegistrationDetailClient } from '../_components/RegistrationDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return { title: `ใบสมัคร ${String(id).slice(-8).toUpperCase()}` };
}

export default async function Page({ params }) {
  const { id } = await params;
  const doc = await getRegistrationById(id);
  if (!doc) notFound();

  return <RegistrationDetailClient doc={doc} />;
}