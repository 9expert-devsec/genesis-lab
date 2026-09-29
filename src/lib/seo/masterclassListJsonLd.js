/**
 * /masterclass's `@graph` — CollectionPage + ItemList + BreadcrumbList.
 *
 * ══ EACH ListItem IS THE SAME ENTITY AS ITS DETAIL PAGE ═════════════════════
 * The Course `@id` here comes from `masterclassCourseId`, the function
 * lib/masterclass/generateJsonLd uses for the detail page's Course node. So the
 * listing and the detail page reference ONE entity per masterclass rather than
 * describing two, which is what two independently-built `@id`s would mean to a
 * crawler. That property only became reachable in the commit before this one: the
 * detail graph used to build its ids from a hardcoded
 * `masterclass.9experttraining.com`, which has been a 308 to www since the
 * 2026-09-08 cutover.
 *
 * ── WHAT THE ITEMS DELIBERATELY DO NOT CARRY ────────────────────────────────
 * No batches, no `hasCourseInstance`, no offers, no price. Those live on the
 * DETAIL page's Course node, which is the document that describes a masterclass in
 * full, and they are exactly the facts that go stale: /masterclass is static with
 * `revalidate = 3600`, and batch availability flips the moment a seat sells. A
 * listing that published prices and `availability` from an hour-old snapshot would
 * be making machine-readable claims a buyer acts on. Same reasoning, and the same
 * line, as lib/seo/scheduleJsonLd draws for /schedule.
 *
 * `description` is the SHORT field (`subtitle_th`), never `description_html` —
 * that is the long authored body, and a listing entry is a one-line summary.
 *
 * PURE: no I/O, no database, no env, no React.
 */

import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';
import {
  masterclassCanonicalUrl,
  masterclassCourseId,
} from '@/lib/masterclass/masterclassUrl';

/** The route this graph describes. One spelling, for the URL and the ids. */
const PATH = '/masterclass';

/**
 * The `%s` half of this page's `<title>`, and the CollectionPage's `name`.
 *
 * ── IT USED TO CONTAIN THE BRAND, AND THEREFORE DOUBLED IT ──────────────────
 * `metadata.title` on the listing was `'Masterclass — 9Expert Training'`, and the
 * root layout's template appends ` | ${siteConfig.name}` to whatever a child
 * gives it — so the page actually rendered
 *
 *     Masterclass — 9Expert Training | 9Expert Training
 *
 * The brand belongs to the template, not to the segment. This is the segment
 * alone, so the rendered title is `Masterclass | 9Expert Training`, matching
 * every other route in the tree.
 *
 * Read by app/(public)/masterclass/page.jsx's `metadata.title`, so the tag and
 * the graph are one value. It lives here rather than in the page for the reason
 * lib/seo/homeMeta.js exists: this module is imported BY the page, so a constant
 * defined there would make this module import its own consumer.
 */
export const MASTERCLASS_TITLE = 'Masterclass';

/**
 * The breadcrumb label for the site root. Fourth copy in the tree — see
 * lib/seo/scheduleJsonLd's note; single-sourcing all of them means editing
 * app/(public)/[...slug]/page.jsx, which stays out of scope.
 */
export const HOME_BREADCRUMB_LABEL = 'หน้าแรก';

/**
 * Build /masterclass's `@graph`.
 *
 * @param {object[]} courses `getPublishedMasterclasses()`'s output — published
 *   courses in `display_order` ascending, which is the order the page renders
 *   them in (MasterclassListingClient passes the array straight through and
 *   neither sorts nor filters).
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves the URLs are composed rather than restated.
 * @returns {object|null} the `@graph` document, or null when nothing is published.
 */
export function buildMasterclassListJsonLd(courses, siteUrl = SITE_URL) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const canonicalUrl = `${base}${PATH}`;

  const webPageId = `${canonicalUrl}#webpage`;
  const itemListId = `${canonicalUrl}#masterclasslist`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;

  const { website: websiteId, organization: organizationId } = homeGraphIds(base);

  const listItems = [];
  for (const course of Array.isArray(courses) ? courses : []) {
    if (!course || typeof course !== 'object') continue;

    // SKIPPED, NOT GUESSED. Without a slug there is no URL known to resolve, and
    // an ItemList entry pointing at a plausible 404 is worse than an absent one.
    // Positions are assigned after the skip, so they stay contiguous.
    const slug = typeof course.slug === 'string' ? course.slug.trim() : '';
    if (!slug) continue;

    const name = course.title_th;
    if (!name) continue;

    const description =
      typeof course.subtitle_th === 'string' ? course.subtitle_th.trim() : '';

    const url = masterclassCanonicalUrl(slug, base);

    listItems.push({
      '@type': 'ListItem',
      position: listItems.length + 1,
      url,
      item: {
        '@type': 'Course',
        // THE SAME id the detail page's Course node carries — one entity, two
        // documents referencing it.
        '@id': masterclassCourseId(slug, base),
        url,
        name,
        // Omitted ENTIRELY when blank, never emitted as ''. An empty string is a
        // claim that the description is the empty text; a missing key is the
        // absence of a claim.
        ...(description ? { description } : {}),
        provider: { '@id': organizationId },
      },
    });
  }

  // Nothing published → no graph, and the caller emits no script tag. An ItemList
  // with an empty itemListElement is a positive assertion that there are no
  // masterclasses, which is not what a failed read means.
  if (listItems.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': webPageId,
        url: canonicalUrl,
        // The page's ACTUAL rendered <title>, composed from the same constant the
        // route puts in `metadata.title` and the root layout's template.
        name: `${MASTERCLASS_TITLE} | ${siteConfig.name}`,
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
        // The count of what is ACTUALLY listed. An ItemList whose numberOfItems
        // disagrees with its own itemListElement is a defect either way.
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
            name: MASTERCLASS_TITLE,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}
