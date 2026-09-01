import { CheckCircle } from 'lucide-react';
import { ContentSection } from './ContentSection';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { isEmptyRichHtml } from '@/lib/richTextEmpty';
import { wrapArticleTables } from '@/lib/articles/wrapArticleTables';

/**
 * `systemRequirementsRich` renders IN PLACE OF the plain
 * `course_system_requirements` list when it holds real content — see
 * CourseDescription.jsx and CourseObjectives.jsx for the shared reasoning;
 * not repeated here.
 *
 * Independent of the other three section-6 fields and of `descriptionRich`.
 */
export function CourseRequirements({ course, extension }) {
  const richBody = sanitizeRichHtml(extension?.systemRequirementsRich ?? '');
  const hasRichBody = !isEmptyRichHtml(richBody);
  const items = toArray(course?.course_system_requirements);

  if (!hasRichBody && !items.length) return null;

  return (
    <ContentSection id="requirement" title="ความต้องการของระบบ">
      {hasRichBody ? (
        <div
          className="article-content rich-body-nested-lists"
          dangerouslySetInnerHTML={{ __html: wrapArticleTables(richBody) }}
        />
      ) : (
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
      )}
    </ContentSection>
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}
