import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/rbac/guard';
import { getCareerPathById } from '@/lib/actions/career-paths';
import { getAllLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { CareerPathFaqClient } from './_components/CareerPathFaqClient';

export const metadata = { title: 'จัดการ FAQ — Career Path' };
export const dynamic = 'force-dynamic';

export default async function CareerPathFaqsPage({ params }) {
  await requirePage('career_paths');

  const { id } = await params;
  const cp = await getCareerPathById(id);
  if (!cp) notFound();

  const faqs = await getAllLocalFaqsForCourse('career_path', cp.career_path_id);
  return <CareerPathFaqClient careerPath={cp} initialFaqs={faqs} />;
}
