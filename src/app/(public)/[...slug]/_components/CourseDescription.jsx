import { ContentSection } from './ContentSection';

/**
 * Renders `course_teaser` as the course description. The heading is the
 * course name itself — upstream doesn't expose a separate description-
 * title field, and the design uses the course name as the anchor.
 * Hidden when the teaser is absent so the page doesn't show an empty
 * shell.
 */
export function CourseDescription({ course }) {
  const teaser = course?.course_teaser;
  if (!teaser) return null;

  return (
    <ContentSection id="description" title={course.course_name}>
      <p className="whitespace-pre-line">{teaser}</p>
    </ContentSection>
  );
}
