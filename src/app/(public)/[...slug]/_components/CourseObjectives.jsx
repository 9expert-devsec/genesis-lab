import { ContentSection } from './ContentSection';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { isEmptyRichHtml } from '@/lib/richTextEmpty';
import { wrapArticleTables } from '@/lib/articles/wrapArticleTables';

/**
 * `objectivesRich` (CourseExtension) renders IN PLACE OF the plain
 * `course_objectives` list when it holds real content — the exact
 * `CourseDescription` swap, applied to this field. See that component's own
 * header for the full reasoning (sanitise-before-emptiness-check,
 * defence-in-depth re-sanitising at render, `wrapArticleTables` reuse); it is
 * not repeated four times here.
 *
 * Independent of the other three section-6 fields and of `descriptionRich`:
 * this component reads only `extension?.objectivesRich` and
 * `course?.course_objectives`.
 */
export function CourseObjectives({ course, extension }) {
  const richBody = sanitizeRichHtml(extension?.objectivesRich ?? '');
  const hasRichBody = !isEmptyRichHtml(richBody);
  const items = toArray(course?.course_objectives);

  if (!hasRichBody && !items.length) return null;

  return (
    <ContentSection id="objective" title="วัตถุประสงค์">
      {hasRichBody ? (
        <div
          className="article-content rich-body-nested-lists"
          dangerouslySetInnerHTML={{ __html: wrapArticleTables(richBody) }}
        />
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-bold text-9e-action">{i + 1}.</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )}
    </ContentSection>
  );
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}
