import Link from 'next/link';
import { BookOpen, ExternalLink } from 'lucide-react';
import { CourseCarousel } from './CourseCarousel';

export function NewCoursesSection({ courses = [] }) {
  return (
    <section className="bg-9e-ice px-4 py-12 lg:px-6 dark:bg-9e-border">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-9e-brand">
              <BookOpen className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold text-9e-navy dark:text-white">
              คอร์สใหม่แนะนำ
            </h2>
          </div>
          <Link
            href="/training-course"
            className="flex items-center gap-1 text-sm font-medium text-9e-primary hover:underline dark:text-white"
          >
            ดูคอร์สเรียนทั้งหมด
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
        </div>

        <CourseCarousel courses={courses} />
      </div>
    </section>
  );
}
