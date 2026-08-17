import { CourseCard } from '@/app/(public)/training-course/_components/CourseCard';
import { SECTION_ANCHOR_CLASS } from '@/lib/courseSectionNav';

export function RelatedCourses({ courses, currentYear, skillSlugs = {} }) {
  const list = Array.isArray(courses) ? courses.filter(Boolean) : [];
  if (!list.length) return null;

  return (
    <section id="related" className={`mt-16 ${SECTION_ANCHOR_CLASS} bg-[var(--surface-muted)] py-12`}>
      <div className="mx-auto max-w-[1280px] px-4 lg:px-6">
        <h2 className="mb-6 text-center text-xl font-bold text-[var(--text-primary)]">
          หลักสูตรที่เกี่ยวข้อง
        </h2>
        <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {list.map((c) => (
            <CourseCard
              key={c._id ?? c.course_id}
              course={c}
              currentYear={currentYear}
              skillSlugs={skillSlugs}
              className="min-w-[260px] lg:min-w-0"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
