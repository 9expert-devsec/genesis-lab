import { resolveTopicRich, TOPIC_SOURCE } from '@/lib/courses/topicRichState';
import { plainBulletsToHtml } from '@/lib/courses/topicHtml';
import { seedTrainingTopics } from '@/lib/courses/trainingTopics';

/**
 * SEED — what the section-7 bullet editor opens with, per row.
 *
 * ══ IT ASKS resolveTopicRich. NOT A SECOND IMPLEMENTATION OF IT. ═══════════
 *
 * `lib/courses/courseOutlineView` (the PUBLIC renderer's server half) calls
 * `resolveTopicRich` to decide what a visitor sees. This calls the same
 * function to decide what an admin opens. Not an equivalent one — the same one.
 *
 * If the two ever disagreed the failure is silent and one-directional: the
 * admin edits formatting no visitor can see, or a visitor sees formatting the
 * admin's form never loaded and therefore overwrites on the next save. There is
 * no version of "close enough" here.
 *
 * ══ THE THREE CASES, AND THE ONE THAT DESTROYS WORK ════════════════════════
 *
 *   PLAIN (no rich copy)  seed from `plainBulletsToHtml(MSDB bullets)`.
 *                         Every one of the 79 courses is here today.
 *   RICH  (matches)       seed from the stored HTML.
 *   STALE (exists, does   DISCARD the rich copy, seed from plain, AND WARN.
 *          not match)
 *
 * ── THE WARNING IS NOT DECORATION; IT IS WHY THE STALE RULE EXISTS ─────────
 * On the public page a stale copy degrades silently and that is right — a
 * visitor is not the audience for a data-sync problem. On the FORM, silence is
 * destructive. The admin opens a course whose formatting was authored months
 * ago, sees plain text, assumes nobody had formatted it, saves, and the plain
 * projection overwrites the rich copy permanently. The rich copy is the ONLY
 * store of that work; MSDB never had it.
 *
 * So the warning names what happened, that the copy was discarded, and what a
 * save will do. Without it the read-side staleness rule would be a mechanism
 * whose entire admin-facing consequence is data loss.
 *
 * ══ HTML-ESCAPING IS NOT OPTIONAL ON THE PLAIN SEED ════════════════════════
 *
 * `plainBulletsToHtml` builds a parse5 tree and serialises it, so text is
 * escaped by the serialiser — nothing here concatenates strings into markup.
 * UIPATH stores `List<mailmessage>`, the only angle bracket in 4,443 measured
 * values. Unescaped, that seed reaches Tiptap as an unknown element, the
 * element is dropped, AND THE TEXT IS GONE — the admin loses a live bullet by
 * doing nothing but opening the form.
 *
 * ── THERE IS A SECOND BARRIER, AND IT IS NOT THIS ONE ─────────────────────
 * Content that goes through a disallowed element usually stops matching MSDB
 * and is caught as STALE before the sanitiser is ever consulted. That is a
 * genuinely independent mechanism, not a restatement of this one, and it has
 * its own test. Neither test may be allowed to stand in for the other: escaping
 * protects the SEED, staleness protects the STORE, and a fixture that trips
 * both proves only that at least one works.
 */

/**
 * The Thai warning shown on the form when a rich copy was discarded.
 *
 * Exported as a constant so the test asserts the STRING THE ADMIN SEES rather
 * than "some warning was rendered" — a guard that passes on an empty banner is
 * the shape this whole warning exists to avoid.
 */
export const STALE_TOPIC_WARNING =
  'การจัดรูปแบบเดิมของหัวข้อนี้ถูกทิ้งแล้ว — หัวข้อย่อยฝั่ง MSDB ถูกแก้ไข '
  + '(เพิ่ม ลบ สลับลำดับ หรือแก้ข้อความ) หลังจากครั้งล่าสุดที่จัดรูปแบบไว้ '
  + 'ระบบจึงโหลดข้อความธรรมดาจาก MSDB มาแสดงแทน '
  + 'หากกดบันทึก การจัดรูปแบบเดิมจะถูกเขียนทับถาวร';

/**
 * Build the editor's seed rows for one course.
 *
 * @param {object}   input
 * @param {object}   input.course     the MSDB course row (carries training_topics)
 * @param {object}   [input.extension] the CourseExtension doc, or null
 * @param {Function} [input.onLegacyShape] the retired-shape tripwire, injected
 *
 * @returns {{ rows: Array<{title: string, html: string}>, stale: boolean,
 *            warning: string, source: string }}
 */
export function seedTopicEditorRows({ course, extension, onLegacyShape } = {}) {
  /**
   * `.filter(Boolean)` MATCHES courseOutlineView AND CourseOutline, which both
   * apply it to this same array. The rich field is index-aligned with the rows
   * THE RENDERER SEES, so a seed that counted rows differently would align the
   * editor to a different list than the page — and index alignment is the whole
   * contract of the field.
   *
   * (`seedTrainingTopics`, the title/textarea seed, does not filter. It cannot
   * disagree in practice — a falsy row carries neither title nor bullets and is
   * dropped by the editor's own normalise — but this path must match the
   * renderer explicitly, because here the count is load-bearing.)
   */
  const rows = Array.isArray(course?.training_topics)
    ? course.training_topics.filter(Boolean)
    : [];

  /**
   * ── TITLES AND BULLETS STILL COME THROUGH seedTrainingTopics ─────────────
   * This seed REPLACES that function's call site in CourseForm, so calling it
   * here rather than re-deriving `{ title, bullets }` keeps two things that
   * would otherwise have gone quiet:
   *
   *   · the retired-`{ topic, subtopics }` TRIPWIRE, whose whole value is that
   *     it fires by name if the shape ever comes back — a tripwire nothing
   *     calls is indistinguishable from one that never fires;
   *   · its RESCUE ARM. A legacy row is mapped across rather than blanked, so
   *     a shape that should be unreachable does not take the admin's form away
   *     if it turns out not to be.
   *
   * Index-aligned with `rows` — `seedTrainingTopics` maps 1:1 and drops
   * nothing.
   */
  const seeded = seedTrainingTopics({ ...course, training_topics: rows }, { onLegacyShape });

  /**
   * `rows`, not `seeded`, is what the staleness decision sees — because `rows`
   * is exactly what `courseOutlineView` passes on the public side. The two
   * surfaces must ask the identical question of the identical input, or the
   * admin and the visitor can reach different answers about the same course.
   */
  const { source, stale, richRows } = resolveTopicRich({
    rows,
    rich: extension?.trainingTopicsRich,
  });

  const useRich = source === TOPIC_SOURCE.RICH;

  return {
    source,
    stale,
    // '' when not stale, so the caller renders the banner on the string being
    // non-empty and cannot accidentally show an empty one.
    warning: stale ? STALE_TOPIC_WARNING : '',
    rows: seeded.map((row, i) => ({
      title: String(row?.title ?? ''),
      /**
       * A title-only row seeds to ''. `plainBulletsToHtml([])` returns '' and
       * NOT `<ul></ul>` — 125 rows across 27 courses legitimately carry no
       * bullets, and they must open as an EMPTY editor the admin can type the
       * first bullet into, not as a row that already contains an empty list.
       * An empty `<ul></ul>` would also make the row non-empty to the
       * `title || bullets.length > 0` filters on the save path.
       */
      html: useRich
        ? String(richRows[i] ?? '')
        : plainBulletsToHtml(row?.bullets),
    })),
  };
}
