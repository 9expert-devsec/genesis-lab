import { slotsOf } from './containerSlots';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. THE definition of what a bundle references, shared with
// collectRefs and dataRefSignature. Re-deriving it here is exactly the drift
// resolveSectionRefs.js exported it to prevent: a code this file ignored would
// be a bundle that never appears on its own course's page, silently.
import { bundleCourseCodes } from './resolveSectionRefs';
// ADDED beside the statements above rather than folded into any. `publicPageHref`
// is the ONLY sanctioned way to build a link to one of these pages — a promotion
// page is diverted off its bare slug (`/<slug>` answers 308) and the helper also
// refuses when the page is outside its publish window.
import { publicPageHref } from '@/lib/pages/promotionMode';
// ADDED beside the statements above rather than folded into any. The repo's
// canonical form of a course_id — see the matching note below.
import { normaliseCourseId } from '@/lib/courses/courseIdAvailability';

/**
 * "Which published bundle pages contain course X" — the pure half.
 *
 * ── THE SHAPE OF THIS JOIN WAS MEASURED, NOT ASSUMED ────────────────────
 * A bundle's courses live in SECTION CONTENT, at any depth inside containers.
 * The Early Bird binding solves the same "find me from a course code" problem
 * by living at PAGE level, and its doc block says why: "the course detail page
 * has to find this, and it cannot scan page sections to do it." A bundle cannot
 * copy that shape — the courses are authored per bundle and a page may hold
 * several — so the choice was between scanning at read time and maintaining a
 * derived, indexed `bundleCourseIds` on the page.
 *
 * MEASURED 2026-09-08, read-only, on the live database:
 *
 *   page_builder_pages TOTAL                 7
 *     pageType 'promotion'                   6   (4 published)
 *     promotionKind 'bundle'                 0
 *   promotion_bundle sections                2   (both at container depth 0)
 *   serialized `sections`, promotion pages   64.2 KB   (47.3 KB published)
 *   largest single page                      17.6 KB
 *
 * Against a threshold of ≤ 25 pages and a few hundred KB, that is two orders of
 * quiet. So this SCANS AND FILTERS AT READ TIME and there is no derived field.
 *
 * That is not only the cheaper option, it is the one that cannot go stale. A
 * derived field would have to be recomputed at EVERY point that changes live
 * `sections` — `saveSections`, the draft promotion inside `publishPageStatus`,
 * and any path added later — and a page whose courses were edited through a
 * path that forgot would be silently absent from its own courses' pages, with
 * nothing on screen and nothing in a log. A scan has no such write path to
 * forget.
 *
 * REVISIT IT when the promotion corpus grows past the threshold above. Re-run
 * the measurement rather than arguing from this paragraph.
 *
 * ── LIVE SECTIONS ONLY ──────────────────────────────────────────────────
 * Every reader here takes `page.sections`, never `page.draft.sections`. A draft
 * is unpublished by definition, and a bundle an author is still assembling must
 * not advertise itself on a public course page.
 *
 * Pure — no DB, no models, no React. Imports only client-safe modules, so the
 * settings panel can count a page's bundles with the same walk the reader uses.
 */

/**
 * The label a bundle row carries, so it is not mistaken for an MSDB promotion.
 * One constant rather than a string at each call site — the row appears in the
 * public block and the count in the editor panel reads the same vocabulary.
 */
export const BUNDLE_ROW_LABEL = 'แพ็กเกจ';

/**
 * Every `promotion_bundle` section in a tree, at any container depth.
 *
 * The walk is `slotsOf`, the same one `collectRefs` uses, rather than a generic
 * "recurse into any array of objects": a container's child slots are declared,
 * and guessing at them would also descend into content that merely looks like
 * sections. Depth is unbounded because nesting is — MEASURED, both bundles on
 * this system sit at depth 0, which is exactly why a depth-0-only reader would
 * have passed every test anyone thought to write.
 */
export function collectBundleSections(sections) {
  const out = [];
  const walk = (arr) => {
    for (const s of Array.isArray(arr) ? arr : []) {
      if (!s || typeof s !== 'object') continue;
      if (s.type === 'promotion_bundle') out.push(s);
      const slots = slotsOf(s.type);
      if (slots) for (const slot of slots) walk(s.content?.[slot]);
    }
  };
  walk(sections);
  return out;
}

/** How many bundles does this page hold? For the settings panel's hint. */
export function countBundleSections(sections) {
  return collectBundleSections(sections).length;
}

/**
 * Every course code a page's bundles reference, in canonical form, de-duplicated.
 *
 * ── WHY CANONICAL FORM, AND WHOSE ─────────────────────────────────────────
 * Mixed-case `course_id` values exist upstream and have already caused 404s in
 * this repo, so a bundle authored with `mse-l1` must still match a course page
 * asking for `MSE-L1`. The normaliser is `normaliseCourseId` — the repo's
 * existing definition (trim + UPPERCASE, `lib/courses/courseIdAvailability.js`)
 * — imported rather than retyped, because a second spelling of "the same course
 * code" is how the two sides start disagreeing about which courses a bundle
 * holds.
 */
export function pageBundleCourseCodes(page) {
  const out = new Set();
  for (const section of collectBundleSections(page?.sections)) {
    for (const code of bundleCourseCodes(section?.content)) {
      const key = normaliseCourseId(code);
      if (key) out.add(key);
    }
  }
  return [...out];
}

/** Is this page a bundle promotion at all? Kind is checked, not inferred. */
function isBundlePage(page) {
  return page?.pageType === 'promotion' && page?.promotionKind === 'bundle';
}

/**
 * The published bundle pages that contain `courseId`, as row view models.
 *
 * `{ href, title, cover, label }` — serialized, so a server component can hand
 * the array straight to a client boundary without a second mapping.
 *
 * ── ONE PAGE, ONE ROW ───────────────────────────────────────────────────
 * The same course may appear in several bundles on ONE page, and in several
 * items of ONE bundle; both are normal and explicitly allowed. The row is the
 * PAGE, so the reader iterates pages and asks each one a yes/no question — a
 * shape in which the duplicate cannot arise rather than one that de-duplicates
 * afterwards.
 *
 * ── A PAGE WITH NO HONEST LINK IS DROPPED, NOT RENDERED HREFLESS ─────────
 * `publicPageHref` returns null for a page with no slug and for one that is not
 * publicly visible RIGHT NOW — which is where draft, scheduled-but-not-started
 * and expired pages all leave. That single call is therefore the whole
 * visibility gate, and it is the same one the destination route runs, so a row
 * cannot survive here and 404 on click. A link that 404s is worse than no link:
 * it spends the customer's click before failing.
 *
 * ── ORDER, STATED RATHER THAN EMERGENT ──────────────────────────────────
 * `promotionOrder` ascending, then title — the sort the /promotions grid
 * already uses for Genesis-owned pages, so a customer meets these pages in the
 * same order in both places. Title breaks the tie because `promotionOrder`
 * defaults to 0 and would otherwise leave the order to however Mongo returned
 * the documents, which is not an order at all.
 */
export function selectBundlePagesForCourse(pages, courseId, now = Date.now()) {
  const wanted = normaliseCourseId(courseId);
  if (!wanted) return [];

  return (Array.isArray(pages) ? pages : [])
    .filter((page) => isBundlePage(page) && pageBundleCourseCodes(page).includes(wanted))
    // SORTED AS PAGES, BEFORE THE MAP. `promotionOrder` is not part of the view
    // model — a row carries what it renders and nothing else — so sorting the
    // mapped rows could only sort on what survived, which is not the order this
    // function promises.
    .sort((a, b) => {
      const order = (Number(a?.promotionOrder) || 0) - (Number(b?.promotionOrder) || 0);
      if (order !== 0) return order;
      return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), 'th');
    })
    .map((page) => {
      const href = publicPageHref(page, now);
      if (!href) return null;
      return {
        href,
        title: String(page?.title ?? ''),
        cover: String(page?.promotionCover ?? ''),
        label: BUNDLE_ROW_LABEL,
      };
    })
    .filter(Boolean);
}
