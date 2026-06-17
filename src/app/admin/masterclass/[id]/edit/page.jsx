import { notFound } from 'next/navigation';
import { getMasterclassCourseById } from '@/lib/masterclass/getMasterclass';
import { MasterclassCourseFormClient } from '../../_components/MasterclassCourseFormClient';

export const dynamic = 'force-dynamic';

export default async function EditMasterclassPage({ params }) {
  const { id } = await params;
  const course = await getMasterclassCourseById(id);
  if (!course) notFound();
  return <MasterclassCourseFormClient course={course} />;
}
