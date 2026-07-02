import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getMasterclassCourseById } from '@/lib/masterclass/getMasterclass';
import { getAllLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { MasterclassFaqClient } from './_components/MasterclassFaqClient';

export const metadata = { title: 'จัดการ FAQ — Masterclass' };
export const dynamic = 'force-dynamic';

export default async function MasterclassFaqsPage({ params }) {
  await requirePage('masterclass');

  const { id } = await params;
  const course = await getMasterclassCourseById(id);
  if (!course) notFound();

  const faqs = await getAllLocalFaqsForCourse('masterclass', String(course._id));
  return <MasterclassFaqClient course={course} initialFaqs={faqs} />;
}
