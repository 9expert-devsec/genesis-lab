import { resolveTopicRich, TOPIC_SOURCE } from '@/lib/courses/topicRichState';
import { sanitizeTopicHtml } from '@/lib/courses/sanitizeTopicHtml';

/**
 * SERVER-SIDE PREPARATION for section 7's rich bullets.
 *
 * ══ WHY THIS RUNS ON THE SERVER, AND WHY IT IS ITS OWN MODULE ══════════════
 *
 * `CourseOutline` is a CLIENT component — it owns the open/closed state of the
 * accordion, so it cannot stop being one. `sanitizeTopicHtml` pulls
 * `sanitize-html`, and `topicRichState` pulls `parse5` through `topicHtml`.
 * Neither has any business being shipped to a browser to re-sanitise stored
 * content on every page view.
 *
 * The seam is already there and needs no restructuring:
 *
 *     (public)/[...slug]/page.jsx      SERVER  (async, revalidate 3600)
 *       └─ CourseDetail (page.jsx:759) SERVER  — already holds `extension`
 *            └─ <CourseOutline/>       CLIENT
 *
 * So the decision and the sanitising happen HERE, called from `CourseDetail`,
 * and the client component receives strings it may render as-is. Nothing in
 * this module is imported by `CourseOutline.jsx`, which is what keeps parse5
 * and sanitize-html out of the client bundle — asserted, not assumed, in
 * test/fs/courseOutlineRichSeam.test.mjs.
 *
 * ══ SANITISING AT RENDER IS DEFENCE IN DEPTH, NOT THE ONLY DEFENCE ═════════
 *
 * B3 will also sanitise on WRITE. This still runs, for the same reason
 * sanitizePageHtml runs at render on custom pages: stored bytes can predate a
 * sanitiser change, and the write path is not the only thing that could ever
 * put bytes in that field. The store is not a trust boundary.
 *
 * ══ RETURNS null FOR EVERY COURSE TODAY ════════════════════════════════════
 *
 * No course has a rich copy and there is no backfill, so `resolveTopicRich`
 * answers PLAIN for all 79 and this returns `null`. `null` is the same value
 * the client component defaults to, so the plain path is reached identically
 * whether this module ran or not — which is what makes the inertness proof in
 * test/render/courseOutlineInert.test.mjs a real comparison rather than a
 * restatement.
 */

/**
 * ── THE STALE SIGNAL, READ SIDE ────────────────────────────────────────────
 *
 * On the PUBLIC page a stale rich copy means exactly one thing: render plain,
 * silently. No badge, no banner, nothing a visitor sees — they are not the
 * audience for a data-sync problem, and the admin-facing warning is B3's job.
 *
 * But it must not be SWALLOWED. A rich copy that has silently stopped being
 * used is indistinguishable, from the outside, from one that was never
 * authored — and that is precisely the state where someone's formatting work
 * has quietly stopped reaching the page.
 *
 * One server-side line, no new infrastructure. It runs on the server at ISR
 * time, so it is once per course per revalidate window (3600s), not once per
 * visitor.
 *
 * INJECTABLE rather than hardcoded, following `seedTrainingTopics`'s
 * `onLegacyShape`: this module owns the DETECTION, the caller owns the opinion
 * that the console is the right place to shout, and a test can assert the
 * signal fires without writing to the suite's output.
 */
const warnStale = ({ courseId, rows, richRows }) => {
  console.warn(
    `[CourseOutline] trainingTopicsRich is STALE for ${courseId} — `
    + `${richRows} rich row(s) against ${rows} upstream row(s). `
    + 'Rendering the plain MSDB text. The rich copy no longer describes these '
    + 'rows (a row was inserted, appended, deleted, reordered, or a bullet was '
    + 'edited upstream) and will stay unused until it is re-saved in the admin.'
  );
};

/**
 * Decide what section 7 renders, and sanitise it if it is rich.
 *
 * @param {object}   input
 * @param {object}   input.course     the MSDB course row (carries training_topics)
 * @param {object}   input.extension  the CourseExtension doc, or null
 * @param {Function} [input.onStale]  injectable stale reporter; defaults to a
 *                                    server console warning
 *
 * @returns {string[]|null} per-row sanitised HTML, index-aligned with
 *   `training_topics` — or NULL when the plain MSDB text should render, which
 *   is every course today. Never throws.
 */
export function prepareOutlineRichHtml({ course, extension, onStale = warnStale } = {}) {
  /**
   * `.filter(Boolean)` MATCHES WHAT CourseOutline ALREADY DOES to the same
   * array (CourseOutline.jsx:63). If the two disagreed about which rows exist,
   * the rich array would be index-aligned with a different list than the one
   * being rendered — and index alignment is the entire contract of this field.
   */
  const rows = Array.isArray(course?.training_topics)
    ? course.training_topics.filter(Boolean)
    : [];

  const { source, stale, richRows } = resolveTopicRich({
    rows,
    rich: extension?.trainingTopicsRich,
  });

  if (stale && typeof onStale === 'function') {
    onStale({
      courseId: course?.course_id ?? '(unknown)',
      rows: rows.length,
      richRows: richRows.length,
    });
  }

  // PLAIN — every course today. `null`, so the client component's own default
  // and this answer are the same value and reach the same branch.
  if (source !== TOPIC_SOURCE.RICH) return null;

  return richRows.map((html) => sanitizeTopicHtml(html));
}
