/**
 * /training-course's `@graph` — CollectionPage + ItemList + BreadcrumbList.
 *
 * ══ WHAT THIS GRAPH DESCRIBES, AND WHY IT IS ALWAYS THE UNFILTERED CATALOG ══
 * /training-course is STATIC (no `dynamic` or `revalidate` export on the route;
 * its revalidate is inherited from the fetch layer — 1800s, the minimum across
 * the page's fetches, pinned by listSchedulesByCourse). Its filtering is
 * ENTIRELY CLIENT-SIDE: CourseListClient reads `skill`, `program` and `view`
 * from `useSearchParams` on every render and nothing is mirrored into state —
 * "THE URL IS THE FILTER", as that component's own docblock puts it.
 *
 * So the server has exactly one list to describe: the unfiltered catalog, in
 * the order projectCourseListRows hands it over. That is the right thing to
 * describe, because it is the list the page's `<link rel="canonical">` names —
 * `/training-course`, with no query string. A crawler fetching
 * `/training-course?skill=data` receives the SAME prerendered HTML, therefore
 * the same graph, and the canonical tells it the bare URL is the page. All
 * three statements agree, which is the only configuration that does not lie.
 *
 * ── DELIBERATELY UNLIKE /articles ────────────────────────────────────────────
 * lib/articles/buildListJsonLd.js takes `page`, `pageSize` and `total` and
 * offsets `position` accordingly, because /articles is `force-dynamic` and its
 * ItemList genuinely reflects the filters and the page the request asked for.
 * Copying that shape here would be wrong twice over: there are no pages to
 * offset, and a filter the server cannot see must not appear to have been
 * applied. This builder therefore takes NO page/filter arguments at all — the
 * absence is the design, not an omission to be filled in later.
 *
 * FILTERED LISTS ARE NOT THIS PAGE'S JOB. The URLs that mean "the courses for
 * one skill or program" are the `-all-courses` routes, served by the catch-all
 * at app/(public)/[...slug]/page.jsx. Those currently render the ENTIRE catalog
 * under an H1 of the de-hyphenated slug and apply no filtering whatsoever (the
 * branch calls listPublicCourses() unfiltered and uses the slug only for the
 * heading) — so giving them an ItemList today would emit machine-readable
 * claims that are false. Fixing that branch, and then describing it, is a
 * separate round and deliberately out of scope here.
 *
 * PURE: no I/O, no database, no env, no React. Same contract as
 * courseCanonicalPath, homeJsonLd and buildListJsonLd, and for the same reason —
 * a builder that can be invoked by a test is one whose output is asserted
 * rather than scanned for out of source text.
 */

import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';
import { courseCanonicalPath } from '@/lib/courses/courseCanonicalPath';

/** The route this graph describes. One spelling, used for the URL and the ids. */
const PATH = '/training-course';

/**
 * The `%s` half of this page's `<title>`, and the CollectionPage's `name`.
 *
 * ── WHY THE PAGE IMPORTS ITS OWN TITLE FROM HERE ────────────────────────────
 * Two surfaces name this page: `metadata.title` in
 * app/(public)/training-course/page.jsx (which becomes `<title>` through the
 * root layout's template) and `CollectionPage.name` below. The rule homeJsonLd
 * keeps — structured data may not assert a title the page does not have — only
 * holds while those are ONE value, so the page reads this constant instead of
 * spelling the string a second time.
 *
 * It lives here rather than in page.jsx for the reason lib/seo/homeMeta.js
 * exists: this module is imported BY the page, so a constant defined in the page
 * would make this module import its own consumer. Same shape, same cycle, same
 * answer.
 */
export const TRAINING_COURSE_TITLE = 'หลักสูตรทั้งหมด';

/**
 * The breadcrumb label for the site root.
 *
 * NOT imported from a shared module, because there is no such module: the only
 * other BreadcrumbList in the tree spells this literal inline at
 * app/(public)/[...slug]/page.jsx:841 (the course detail page's trail). Two
 * copies of one label is a real if minor duplication; single-sourcing it means
 * editing that route, which this round's scope excludes. Named here so the next
 * reader finds the second copy rather than discovering it.
 */
export const HOME_BREADCRUMB_LABEL = 'หน้าแรก';

/**
 * The page's full rendered `<title>`, composed the way the framework composes it.
 *
 * ── THE ONE DUPLICATION IN THIS FILE, STATED PLAINLY ────────────────────────
 * The root layout declares `title.template` as `%s | ${siteConfig.name}`
 * (src/app/layout.jsx). Next applies that to a child's `title` string, so the
 * text a reader and a crawler actually see is the composition below — and a
 * builder that emitted only the `%s` half would assert a title the page does not
 * have, which is the exact failure this rule exists to prevent.
 *
 * The template cannot be imported: layout.jsx is a route module that pulls in
 * fonts, the popup provider and the whole app shell. So the FORM is restated
 * here while both INPUTS stay single-sourced, and a test reads layout.jsx's
 * source and asserts the template is still this shape. If someone changes the
 * separator, that test goes red here rather than this file quietly describing a
 * title that no longer exists.
 */
function renderedTitle() {
  return `${TRAINING_COURSE_TITLE} | ${siteConfig.name}`;
}

/**
 * The absolute canonical URL of one course, or null when it cannot be named.
 *
 * ── WHY NOT courseLinkHref, WHICH IS THE BRIDGE FOR THIS EXACT ROW SHAPE ────
 * `courseLinkHref(row)` is the adapter that turns a list row's flat `urlAlias`
 * into the `{ urlAlias }` extension object `courseCanonicalPath` wants, and it is
 * what the cards link through. It is the right ADAPTER and the wrong FUNCTION
 * here, for one reason: it never returns null. A course with neither a code nor
 * an alias falls back to `/training-course`, which is correct for an `<a href>`
 * (a visible link to the catalog beats a dead link) and catastrophic in an
 * ItemList — the entry would claim the listing page is a Course, and 1..n
 * positions would silently describe the wrong entities.
 *
 * So this reproduces courseLinkHref's ADAPTER — the same one-line
 * `{ urlAlias: row.urlAlias }` object, nothing more — and delegates to the same
 * rule, keeping the null. The alias rule itself is NOT re-derived here; that
 * lives in courseCanonicalPath and this file has no opinion about it.
 *
 * The join cannot double-slash: courseCanonicalPath returns a path with exactly
 * one leading slash, and the base is trimmed. That defect has shipped three
 * times in this repo (the mega menu, the Course JSON-LD, the BreadcrumbList) and
 * is the reason neither side of this join is allowed to be hand-built.
 */
function courseUrlFor(row, base) {
  const path = courseCanonicalPath(row, { urlAlias: row?.urlAlias });
  return path ? `${base}${path}` : null;
}

/**
 * Build /training-course's `@graph`.
 *
 * @param {object[]} rows the projected list rows the server is rendering, in
 *   render order — projectCourseListRows' output, unfiltered.
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves the URLs are composed rather than restated.
 * @returns {object|null} the `@graph` document, or null when there is nothing
 *   to describe.
 */
export function buildCourseListJsonLd(rows, siteUrl = SITE_URL) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const canonicalUrl = `${base}${PATH}`;

  const webPageId = `${canonicalUrl}#webpage`;
  const itemListId = `${canonicalUrl}#courselist`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;

  // The site-wide entities Home DECLARES. Read from homeJsonLd's own exported
  // construction, never spelled here — see homeGraphIds for why a second
  // spelling of an `@id` is two entities rather than one referenced twice.
  const { website: websiteId, organization: organizationId } = homeGraphIds(base);

  const listItems = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const url = courseUrlFor(row, base);
    // SKIPPED, NOT GUESSED. A row the canonical rule cannot name has no URL
    // that is known to resolve, and an ItemList entry pointing at a plausible
    // 404 is worse than an entry that is absent. Positions below are assigned
    // after the skip, so they stay contiguous.
    if (!url) continue;

    const name = row.course_name;
    if (!name) continue;

    const description =
      typeof row.course_teaser === 'string' ? row.course_teaser.trim() : '';

    listItems.push({
      '@type': 'ListItem',
      position: listItems.length + 1,
      url,
      item: {
        '@type': 'Course',
        /**
         * THE COURSE'S IDENTITY — the canonical URL, and a KNOWN MISMATCH.
         *
         * lib/courses/buildCourseJsonLd.js, which emits the Course node on the
         * detail page, carries NO `@id` at all — it sets `url` (through the same
         * courseCanonicalPath rule) and stops. So a crawler reading both
         * documents has an `@id` here and none there, and cannot merge the list
         * entry with the detail node by identity; it has to fall back to
         * matching on `url`, which both sides do spell identically.
         *
         * Using the canonical URL as the `@id` is what makes that fallback work
         * and is what a later round would give the detail node too. Adding the
         * `@id` there is the actual fix and it is NOT taken here: the detail
         * page's structured data is out of this round's scope, and changing what
         * 77 course pages emit is its own decision with its own verification.
         * Recorded, not fixed — deliberately the same posture, and the same
         * wording, lib/seo/siteUrl.js used for the origin it could not take.
         */
        '@id': url,
        url,
        name,
        // Omitted ENTIRELY when blank, never emitted as ''. An empty string is a
        // claim that the description is the empty text; a missing key is the
        // absence of a claim. Same rule buildListJsonLd applies to image.
        ...(description ? { description } : {}),
        provider: { '@id': organizationId },
      },
    });
  }

  // Nothing to describe → no graph, and the caller emits no script tag. An
  // ItemList with an empty itemListElement is a positive assertion that the
  // catalog is EMPTY, which is not what a failed fetch or a fully-hidden
  // catalog means to a crawler. Same contract, and the same reasoning, as
  // lib/articles/buildListJsonLd.js.
  if (listItems.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': webPageId,
        url: canonicalUrl,
        // The page's ACTUAL rendered <title>, composed from the same constant
        // page.jsx puts in `metadata.title`, so structured data cannot assert a
        // title the page does not have.
        name: renderedTitle(),
        inLanguage: 'th',
        isPartOf: { '@id': websiteId },
        about: { '@id': organizationId },
        mainEntity: { '@id': itemListId },
        breadcrumb: { '@id': breadcrumbId },
      },
      {
        '@type': 'ItemList',
        '@id': itemListId,
        url: canonicalUrl,
        // The count of what is ACTUALLY listed, not of the rows handed in. The
        // two differ only when a row was skipped above, and an ItemList whose
        // numberOfItems disagrees with its own itemListElement is a defect
        // regardless of which number is the more flattering one.
        numberOfItems: listItems.length,
        itemListElement: listItems,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': breadcrumbId,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: HOME_BREADCRUMB_LABEL,
            item: base,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: TRAINING_COURSE_TITLE,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
