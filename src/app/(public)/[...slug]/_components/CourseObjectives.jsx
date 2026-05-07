import { ContentSection } from './ContentSection';

export function CourseObjectives({ course }) {
  const items = toArray(course?.course_objectives);
  if (!items.length) return null;

  return (
    <ContentSection id="objective" title="วัตถุประสงค์">
      <ol className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 font-bold text-9e-action">{i + 1}.</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </ContentSection>
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}
