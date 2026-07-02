import { requirePage } from '@/lib/rbac/guard';
import { getCareerPathRegistrations } from '@/lib/actions/career-path-registrations';
import { CareerPathRegistrationsClient } from './_components/CareerPathRegistrationsClient';

export const metadata = { title: 'Career Path Registrations' };
export const dynamic = 'force-dynamic';

export default async function CareerPathRegistrationsPage() {
  await requirePage('career_path_registrations');

  const { items, total } = await getCareerPathRegistrations({ limit: 50 });
  return <CareerPathRegistrationsClient registrations={items} total={total} />;
}
