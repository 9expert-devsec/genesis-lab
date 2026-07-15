import { CourseCard } from '@/components/course/CourseCard';

/**
 * course_card — one public course, referenced by `content.courseId` (2C.2a,
 * authored reference). Server-renderable, but it does NOT fetch: the course is
 * resolved ABOVE the renderer (resolveSectionData) and handed in as `data`, so
 * the ONE SectionRenderer serves both the public page and the client canvas
 * (see docs/page-builder-status.md §2C.2).
 *
 * Reuses the site's CourseCard — one presentation for a course, no drift. That
 * is also why course_card does NOT read style.cardStyle: its surface is
 * CourseCard's, so no cardStyle control is offered (the reader-set stays
 * {price_card, stat_card, icon_card}).
 *
 * Fails closed: an unresolved / unknown courseId arrives as null → renders
 * nothing, and the editor warns at the field.
 */
export function CourseCardSection({ data }) {
  if (!data) return null;
  return (
    <div className="mx-auto max-w-sm">
      <CourseCard course={data} />
    </div>
  );
}
