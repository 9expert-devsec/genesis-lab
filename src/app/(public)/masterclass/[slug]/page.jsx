import { notFound } from 'next/navigation';
import { getMasterclassBySlug, getLocalFaqs } from '@/lib/masterclass/getMasterclass';
import { MasterclassDetailClient } from './_components/MasterclassDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const course = await getMasterclassBySlug(slug);
  if (!course) return { title: 'Masterclass — 9Expert Training' };
  return {
    title: `${course.title_th} | Masterclass — 9Expert Training`,
    description: course.subtitle_th || '',
  };
}

export default async function MasterclassDetailPage({ params }) {
  const { slug } = await params;
  const [course, faqs] = await Promise.all([
    getMasterclassBySlug(slug),
    getLocalFaqs('masterclass'),
  ]);
  if (!course) notFound();
  return <MasterclassDetailClient course={course} faqs={faqs} />;
}
