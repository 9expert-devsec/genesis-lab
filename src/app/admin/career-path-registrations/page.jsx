import { forbidden } from 'next/navigation';
import { getCareerPathRegistrations } from '@/lib/actions/career-path-registrations';
import { auth } from '@/lib/auth/options';
import { CareerPathRegistrationsClient } from './_components/CareerPathRegistrationsClient';

export const metadata = { title: 'Career Path Registrations' };
export const dynamic = 'force-dynamic';

export default async function CareerPathRegistrationsPage() {
  const session = await auth();
  if (!new Set(['superadmin', 'owner', 'admin', 'registration_admin', 'it_support_admin']).has(session?.user?.role)) forbidden();

  const { items, total } = await getCareerPathRegistrations({ limit: 50 });
  return <CareerPathRegistrationsClient registrations={items} total={total} />;
}
