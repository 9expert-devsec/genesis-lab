import { CourseCard } from '@/components/course/CourseCard';

/**
 * course_selector — a curated set of courses (authored `content.courseIds`) with
 * an optional heading (2C.2a). Renders from injected `data` (the resolved course
 * objects), not a fetch.
 *
 * Fixed responsive grid, NOT `layout.columns`: keeping these dynamic grids off
 * the columns reader-set leaves it {card_grid, highlight_grid} and spares 2C.2a
 * a new control + assertion. (An author who wants column control is a later,
 * deliberate reader-set change.)
 *
 * Fails closed: an empty resolved set renders nothing; the editor warns.
 */
export function CourseSelectorSection({ content, data }) {
  const courses = Array.isArray(data) ? data : [];
  const heading = typeof content?.heading === 'string' ? content.heading : '';
  if (!courses.length) return null;

  return (
    <div>
      {heading.trim() && (
        <h2 className="mb-6 font-heading text-2xl font-bold md:text-3xl">{heading}</h2>
      )}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <CourseCard key={c.course_id} course={c} />
        ))}
      </div>
    </div>
  );
}
