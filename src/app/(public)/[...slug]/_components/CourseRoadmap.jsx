import Image from 'next/image';
import { ContentSection } from './ContentSection';

export function CourseRoadmap({ course }) {
  const url = course?.course_roadmap_url;
  if (!url) return null;

  return (
    <ContentSection id="roadmap" title="Road Map">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-9e-ice">
        <Image
          src={url}
          alt={`${course.course_name} roadmap`}
          fill
          sizes="(max-width: 1024px) 100vw, 800px"
          className="object-contain"
        />
      </div>
    </ContentSection>
  );
}
