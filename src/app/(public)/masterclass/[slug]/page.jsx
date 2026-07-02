import { notFound } from 'next/navigation';
import { getMasterclassBySlug, getInstructorsByIds } from '@/lib/masterclass/getMasterclass';
import { getLocalFaqsForCourse } from '@/lib/local-faqs/getLocalFaqs';
import { generateMasterclassJsonLd } from '@/lib/masterclass/generateJsonLd';
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
  const course = await getMasterclassBySlug(slug);
  if (!course) notFound();
  const [faqs, instructors] = await Promise.all([
    getLocalFaqsForCourse('masterclass', String(course._id)),
    getInstructorsByIds(course.instructor_ids ?? []),
  ]);

  const jsonLd = generateMasterclassJsonLd(course, instructors, faqs);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MasterclassDetailClient course={course} faqs={faqs} instructors={instructors} />
    </>
  );
}
