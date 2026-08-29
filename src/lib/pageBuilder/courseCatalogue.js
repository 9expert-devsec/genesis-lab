import { listPublicCourses } from '@/lib/api/public-courses';

/**
 * The course list the page-builder editor is handed, and the projection that
 * makes handing it over affordable.
 *
 * ── WHY A PROJECTION, WITH THE NUMBER ──────────────────────────────────────
 * Measured live on 2026-08-29 (`scripts/_probe-round46-course-payload.mjs`),
 * 79 courses:
 *
 *     the full list                    1,229,727 bytes   (1200.9 KB)
 *     {course_id, course_name} only        6,318 bytes   (6.2 KB)
 *                                          194.6x smaller
 *
 * Two of the 37 keys carry 68.6% of that weight — `related_courses` (36.9%),
 * which embeds whole course objects so the payload contains courses several
 * times over, and `training_topics` (31.7%). A picker needs a code and a label.
 * It needs neither of those, nor the other 33.
 *
 * The failure this module exists to prevent is SILENT: handing `items` straight
 * down instead of the projection changes no behaviour, breaks no rendering, and
 * ships 1.2 MB into every editor page load. Nothing would go red. So the
 * projection is a named function with an asserted key set rather than an inline
 * `.map` in two route files, and test/pure/courseCatalogue pins the size.
 *
 * ── WHAT THIS LIST IS AUTHORITATIVE FOR: NOTHING ───────────────────────────
 * It supplies rows to choose from and labels to display. It does NOT decide
 * whether a stored code is valid — `resolveBuilderSectionData` does, and the
 * editor's warnings read that and only that.
 *
 * The two can disagree, because they are read at different moments through
 * different caches, and the design is one where disagreement is harmless:
 *
 *   · a code IN the catalogue that does not resolve still warns — the resolver
 *     decides, and it says so;
 *   · a code NOT in the catalogue still displays and still saves — its absence
 *     here is not an assertion about anything
 *     (docs/course-picker-proposal.md §D.1, §G step 2).
 *
 * Neither can silence the other because only one of them speaks. That is also
 * why `catalogueOrEmpty` below can fail open without consequence: an empty
 * catalogue costs an author the convenience of choosing from a list, and costs
 * them no correctness at all.
 */

/**
 * EXACTLY the keys that cross to the client. Exported so a test asserts on the
 * set rather than on a sample of it — a third key added without thinking about
 * the cost is the regression, and a spot check of two would not see it.
 */
export const CATALOGUE_KEYS = Object.freeze(['course_id', 'course_name']);

/**
 * Upstream rows → the picker's rows.
 *
 * Order is upstream's, which is `listPublicCourses`' order — the stored
 * programme/skill arrangement it applies at the origin. That is the order an
 * admin has arranged elsewhere in this codebase and the one they will expect to
 * scroll. It has nothing to do with an authored list's order, which is the
 * author's alone and is never sorted (§D.3).
 *
 * A row with no `course_id` is dropped: it cannot be chosen, cannot be stored,
 * and would render as a blank line in the picker.
 *
 * @param {unknown} items rows from listPublicCourses
 * @returns {{ course_id: string, course_name: string }[]}
 */
export function projectCourseCatalogue(items) {
  const rows = Array.isArray(items) ? items : [];
  const out = [];
  for (const row of rows) {
    const code = typeof row?.course_id === 'string' ? row.course_id : '';
    if (!code) continue;
    out.push({
      course_id: code,
      // Normalised to a string here rather than at every read site: the picker
      // renders it directly, and `undefined` would render the word "undefined"
      // beside a perfectly good code.
      course_name: typeof row?.course_name === 'string' ? row.course_name : '',
    });
  }
  return out;
}

/**
 * The projection, or an empty list if the read failed.
 *
 * FAIL OPEN, DELIBERATELY. The editor must open even when upstream is down —
 * an admin fixing a heading has no business being blocked by the course API —
 * and an empty catalogue is safe for the reason the header gives: it is
 * authoritative for nothing. A code can still be typed, every stored code still
 * displays, and the resolver still judges them.
 *
 * `fetchList` is injectable for the reason every other adapter seam in this
 * repo carries one: what this function does is decide WHAT crosses to the
 * client, and that is not observable from source text. Production callers pass
 * nothing.
 *
 * @param {{ fetchList?: (opts: object) => Promise<{ items?: unknown[] }> }} [deps]
 */
export async function catalogueOrEmpty({ fetchList = listPublicCourses } = {}) {
  try {
    // includeHidden, for the reason public-courses.js gives for every /admin
    // picker: an admin must be able to see and keep a code the public list has
    // filtered out. A hidden course in the catalogue is strictly better than a
    // hidden course the author cannot find and therefore cannot re-choose.
    const res = await fetchList({ includeHidden: true });
    return projectCourseCatalogue(res?.items);
  } catch {
    return [];
  }
}
