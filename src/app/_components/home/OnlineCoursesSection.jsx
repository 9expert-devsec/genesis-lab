import Link from 'next/link';
import { Monitor, ExternalLink } from 'lucide-react';
import { siteConfig } from '@/config/site';
import { CourseCarousel } from './CourseCarousel';
import { OnlineCourseCard } from './OnlineCourseCard';

/**
 * Online courses live on a dedicated `/online-course` upstream feed
 * (`o_course_*` field prefix). The home page surfaces only the
 * admin-curated subset from the `featured_online_courses` collection
 * — the page server component is responsible for the filter and order.
 *
 * Header CTA links out to 9Expert Academy (`siteConfig.academyUrl`)
 * where these courses actually run.
 */
export function OnlineCoursesSection({ courses = [], skillSlugs = {} }) {
  if (!courses.length) return null;

  // ROUND HS-B: bg-[var(--9e-signature-800)] — the token already carries
  // both values (light #D3E7FF, dark #0E2645), so no dark: variant is
  // needed; the CSS custom property itself switches under .dark. Not
  // exposed as a Tailwind color name (`bg-9e-signature-800` would not
  // compile), hence the arbitrary-value form.
  return (
    <section className="bg-[var(--9e-signature-800)] px-4 py-12 lg:px-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-brand">
              <Monitor className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">หลักสูตรออนไลน์</h2>
          </div>
          <Link
            href={siteConfig.academyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm font-medium text-9e-action hover:underline dark:text-white"
          >
            ไปที่ 9Expert Academy
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <CourseCarousel
          courses={courses}
          CardComponent={OnlineCourseCard}
          skillSlugs={skillSlugs}
        />
      </div>
    </section>
  );
}
