import { CourseCard } from '@/components/course/CourseCard';

/**
 * course_list — a list of courses. Source-AGNOSTIC by design: it renders whatever
 * array `data` holds, and the resolver (resolveSectionData) decides where that
 * array came from — an authored `content.courseIds` (source='manual', 2C.2a), or
 * every course under a skill/program `filter` (source='skill'|'program', 2C.2b).
 * The limit is applied upstream in the resolver, not here. Same fixed responsive
 * grid as the other multi-course components.
 *
 * The derived sources are canvas-FAKE (a request-time SAMPLE); that honesty lives
 * in the editor's sample label, not in this render — which is exactly why this
 * component needs no source branch. See docs/page-builder-status.md §2C.2b.
 *
 * Fails closed: an empty resolved set renders nothing; the editor warns.
 */
export function CourseListSection({ data }) {
  const courses = Array.isArray(data) ? data : [];
  if (!courses.length) return null;
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <CourseCard key={c.course_id} course={c} />
      ))}
    </div>
  );
}
