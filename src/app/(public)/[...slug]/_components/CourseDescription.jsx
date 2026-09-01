import { ContentSection } from './ContentSection';
import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';
import { isEmptyRichHtml } from '@/lib/richTextEmpty';
import { wrapArticleTables } from '@/lib/articles/wrapArticleTables';

/**
 * Renders the course's rich body — `CourseExtension.descriptionRich` — IN
 * PLACE OF the plain `course_teaser` paragraph, when it is present. Falls
 * back to the teaser (unchanged from before this field existed) when the
 * rich body is absent or carries no real text.
 *
 * ══ SANITISE BEFORE CHECKING EMPTY, NOT AFTER ═══════════════════════════════
 * `isEmptyRichHtml` is run on the SANITISED string, not the stored one.
 * Checking the raw value first would misjudge a body whose only content is
 * something the sanitiser subtree-drops entirely (a stray `<script>alert(1)
 * </script>`, say) as "has content" — `isEmptyRichHtml` only strips TAGS, not
 * tag-and-contents, so the script's text would read as real text. Sanitising
 * first means the emptiness check sees exactly what is about to render.
 *
 * ══ SANITISED HERE TOO, NOT ONLY ON WRITE ═══════════════════════════════════
 * Same defence-in-depth reasoning as every other `sanitizeRichHtml` render
 * site: stored bytes can predate any version of the write-side sanitiser,
 * and the write path (`extensionUpdate.js`) is not the only thing that could
 * ever put bytes in this field. The store is not a trust boundary.
 *
 * ══ `.article-content` IS A DELIBERATE REUSE, ONE KNOWN TRADE-OFF ═══════════
 * The wrapper class and `wrapArticleTables` are the SAME ones
 * `ArticleDetailClient` uses for `Article.content` — reused verbatim rather
 * than a new class, because `wrapArticleTables`'s wrapper CSS is scoped to
 * `.article-content .article-table-scroll` (globals.css) and a table wider
 * than the content column is otherwise unreachable (no scrollbar, no
 * touch-drag — `docs/audit/course-rich-body.md` §1.4 measured this exact
 * defect on 10 of 103 article tables). The one cost: `.article-content a`
 * is hardcoded `#005CFF`, the article page's blue, not this page's own
 * accent — a colour mismatch, not a functional defect, and easy to override
 * with a scoped rule later if it reads wrong once rendered.
 */
export function CourseDescription({ course, extension }) {
  const teaser = course?.course_teaser;
  const richBody = sanitizeRichHtml(extension?.descriptionRich ?? '');
  const hasRichBody = !isEmptyRichHtml(richBody);

  if (!hasRichBody && !teaser) return null;

  return (
    <ContentSection id="description" title={course.course_name}>
      {hasRichBody ? (
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: wrapArticleTables(richBody) }}
        />
      ) : (
        <p className="whitespace-pre-line">{teaser}</p>
      )}
    </ContentSection>
  );
}
