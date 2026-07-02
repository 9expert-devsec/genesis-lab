import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getMasterclassCourseById, getBatchesByCourse } from '@/lib/masterclass/getMasterclass';
import { MasterclassBatchListClient } from './_components/MasterclassBatchListClient';

export const dynamic = 'force-dynamic';

export default async function MasterclassBatchesPage({ params }) {
  await requirePage('masterclass');

  const { id } = await params;
  const [course, batches] = await Promise.all([
    getMasterclassCourseById(id),
    getBatchesByCourse(id),
  ]);
  if (!course) notFound();
  return <MasterclassBatchListClient course={course} batches={batches} />;
}
