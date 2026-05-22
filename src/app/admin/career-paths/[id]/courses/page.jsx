import { notFound } from 'next/navigation';
import { getCareerPathById } from '@/lib/actions/career-paths';
import { CareerPathCoursesClient } from './_components/CareerPathCoursesClient';

export const metadata = { title: 'จัดการคอร์ส Career Path' };
export const dynamic = 'force-dynamic';

export default async function CareerPathCoursesPage({ params }) {
  const { id } = await params;
  const cp = await getCareerPathById(id);
  if (!cp) notFound();
  return <CareerPathCoursesClient careerPath={cp} />;
}
