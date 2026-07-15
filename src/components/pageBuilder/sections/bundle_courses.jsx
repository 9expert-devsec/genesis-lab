import { CourseCard } from '@/components/course/CourseCard';

/**
 * bundle_courses — the courses that make up a bundle (authored
 * `content.courseIds`, 2C.2a). Renders from injected `data`; same fixed
 * responsive grid as course_selector (no `layout.columns`).
 *
 * Fails closed: an empty resolved set renders nothing; the editor warns.
 */
export function BundleCoursesSection({ data }) {
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
