import { CheckCircle } from 'lucide-react';
import { ContentSection } from './ContentSection';

export function CourseRequirements({ course }) {
  const items = toArray(course?.course_system_requirements);
  if (!items.length) return null;

  return (
    <ContentSection id="requirement" title="ความต้องการของระบบ">
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckCircle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-9e-action"
              strokeWidth={2}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </ContentSection>
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}
