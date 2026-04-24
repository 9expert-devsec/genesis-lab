import Link from 'next/link';
import { Monitor, ExternalLink } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { CourseCarousel } from './CourseCarousel';

/**
 * The upstream API has no online-only course flag exposed on the list
 * response (`course_type_public` / `course_type_inhouse` live on the
 * detail endpoint). Until a separate `/online-course` feed is wired up
 * we render a secondary slice of the public courses as the carousel
 * contents — same visual rhythm as NewCoursesSection, different items.
 */
export function OnlineCoursesSection({ courses = [] }) {
  if (!courses.length) return null;

  return (
    <section className="bg-white px-4 py-12 lg:px-6">
      <div className="mx-auto max-w-[1280px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-primary">
              <Monitor className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy">คอร์สออนไลน์</h2>
          </div>
          <Link
            href={siteConfig.academyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-9e-primary hover:underline"
          >
            ไปที่ 9Expert Academy
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <CourseCarousel courses={courses} />
      </div>
    </section>
  );
}
