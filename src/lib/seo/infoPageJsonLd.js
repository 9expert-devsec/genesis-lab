/**
 * The two standing information pages — /about-us and /contact-us — as JSON-LD.
 *
 * ══ THESE GRAPHS REFERENCE. THEY DO NOT RESTATE. ════════════════════════════
 * Neither graph contains a single organisation or venue FACT: no name, no
 * address, no telephone, no email, no logo, no opening hours, no sameAs, no geo.
 * Every one of those lives on the home page's graph (lib/seo/homeJsonLd), is
 * declared there exactly once, and is referred to from here by `@id` alone.
 *
 * THAT IS THE WHOLE DESIGN, and it is worth stating why, because restating the
 * facts is the tempting version. /contact-us in particular SHOWS an address, a
 * phone number, opening hours and a map, so copying them into a ContactPage
 * graph looks like the obvious, richer thing to do. It is the defect:
 *
 *   · An `@id` is an identity. Two nodes that both spell out the organisation's
 *     address are not one organisation described twice — to a crawler they are
 *     two organisations, and every cross-page reference stops resolving. This is
 *     the same argument lib/seo/siteUrl.js makes about the host and
 *     lib/seo/courseNode.js makes about a course, one level up.
 *   · A second copy drifts. The facts on /contact-us and the facts on the home
 *     graph ALREADY disagree in six measured ways (round 2026-09-29: the mobile
 *     number, two of the three email addresses and the tax ID are on the page
 *     and not in the graph; the Google Maps short link and the map's coordinates
 *     differ between the two). Copying today's page values in would freeze one
 *     side of those disagreements into structured data and make the drift
 *     machine-readable. Reconciling them is a content decision for whoever owns
 *     the contact details — deliberately NOT taken here, and not papered over.
 *
 * So `mentions: { '@id': <place> }` is the entire contact claim: "this page is
 * about that organisation and mentions that venue". A crawler follows the id to
 * the home graph and reads the facts once, from the one place they are written.
 *
 * ── WHAT EACH PAGE NODE'S @type BUYS ────────────────────────────────────────
 * `AboutPage` and `ContactPage` are schema.org's own subtypes of WebPage for
 * exactly these two pages, so the type carries the claim that would otherwise
 * need prose. /about-us additionally sets `mainEntity` to the organisation —
 * the page is not merely ABOUT the company, the company IS its subject — while
 * /contact-us does not: its subject is how to make contact, not the
 * organisation itself.
 *
 * PURE: no I/O, no database, no env, no React.
 */

import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { homeGraphIds } from '@/lib/seo/homeJsonLd';

/**
 * The `%s` halves of the two pages' `<title>`s, and their page nodes' `name`s.
 *
 * Read by each route's `generateMetadata` so the tag and the graph are ONE
 * value. They live here rather than in the pages for the reason
 * lib/seo/homeMeta.js exists: this module is imported BY those pages, so a
 * constant defined in a page would make this module import its own consumer.
 */
export const ABOUT_TITLE = 'เกี่ยวกับเรา';
export const CONTACT_TITLE = 'ติดต่อเรา';

/**
 * The breadcrumb label for the site root. Third copy in the tree — the course
 * detail page spells this literal inline at app/(public)/[...slug]/page.jsx:841
 * and lib/seo/scheduleJsonLd re-exports its own. Single-sourcing all four means
 * editing that route, which stays out of scope; named here so the next reader
 * finds the others rather than discovering them.
 */
export const HOME_BREADCRUMB_LABEL = 'หน้าแรก';

/**
 * The page's full rendered `<title>`, composed the way the framework composes it.
 *
 * The root layout declares `title.template` as `%s | ${siteConfig.name}`
 * (src/app/layout.jsx), so this is the text a reader and a crawler actually see.
 * The template cannot be imported — layout.jsx drags in fonts and the app shell
 * — so the FORM is restated while both INPUTS stay single-sourced, and a test
 * reads layout.jsx's source to assert the template is still this shape. Same
 * arrangement, and the same guard, as lib/seo/courseListJsonLd.
 */
function renderedTitle(segment) {
  return `${segment} | ${siteConfig.name}`;
}

/**
 * Both graphs, which differ only in type, path, title and which home nodes they
 * point at. One builder so the two cannot drift in the parts that are the same.
 *
 * @param {object} spec
 * @param {'AboutPage'|'ContactPage'} spec.type
 * @param {string} spec.path route path, leading slash, no trailing slash
 * @param {string} spec.titleSegment the `%s` half of the page's `<title>`
 * @param {boolean} [spec.mainEntityIsOrganization] set `mainEntity` to the org
 * @param {boolean} [spec.mentionsPlace] set `mentions` to the training venue
 * @param {string} siteUrl origin, with or without a trailing slash
 * @returns {object} the `@graph` document
 */
function buildInfoPageJsonLd(
  { type, path, titleSegment, mainEntityIsOrganization = false, mentionsPlace = false },
  siteUrl
) {
  const base = String(siteUrl ?? '').replace(/\/+$/, '');
  const canonicalUrl = `${base}${path}`;

  const webPageId = `${canonicalUrl}#webpage`;
  const breadcrumbId = `${canonicalUrl}#breadcrumb`;

  // The site-wide entities Home DECLARES. Read from homeJsonLd's own exported
  // construction, never spelled here — a hand-written `${base}/#organization`
  // would agree today and split the graph the day either side is edited.
  const { website: websiteId, organization: organizationId, place: placeId } =
    homeGraphIds(base);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': type,
        '@id': webPageId,
        url: canonicalUrl,
        // The page's ACTUAL rendered <title>, composed from the same constant
        // the route puts in `metadata.title`, so structured data cannot assert a
        // title the page does not have.
        name: renderedTitle(titleSegment),
        inLanguage: 'th',
        isPartOf: { '@id': websiteId },
        about: { '@id': organizationId },
        ...(mainEntityIsOrganization ? { mainEntity: { '@id': organizationId } } : {}),
        ...(mentionsPlace ? { mentions: { '@id': placeId } } : {}),
        breadcrumb: { '@id': breadcrumbId },
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
            name: titleSegment,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };
}

/**
 * /about-us — an `AboutPage` whose subject IS the organisation.
 *
 * `mainEntity` as well as `about`: schema.org draws the distinction between a
 * page that merely concerns a thing and one whose primary content IS that thing,
 * and an About page is the second. /contact-us deliberately does not claim this.
 *
 * @param {string} [siteUrl] origin without a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test, which is what
 *   proves the URLs and ids are composed rather than restated.
 * @returns {object} the `@graph` document
 */
export function buildAboutPageJsonLd(siteUrl = SITE_URL) {
  return buildInfoPageJsonLd(
    {
      type: 'AboutPage',
      path: '/about-us',
      titleSegment: ABOUT_TITLE,
      mainEntityIsOrganization: true,
    },
    siteUrl
  );
}

/**
 * /contact-us — a `ContactPage` that MENTIONS the training venue.
 *
 * `mentions`, not `location` and not a nested Place: the venue is an entity the
 * home graph declares, and this page refers to it. Restating its address, hours,
 * map or coordinates here is the thing this module exists not to do — see the
 * module docblock for the six measured disagreements that makes concrete.
 *
 * @param {string} [siteUrl] origin without a trailing slash.
 * @returns {object} the `@graph` document
 */
export function buildContactPageJsonLd(siteUrl = SITE_URL) {
  return buildInfoPageJsonLd(
    {
      type: 'ContactPage',
      path: '/contact-us',
      titleSegment: CONTACT_TITLE,
      mentionsPlace: true,
    },
    siteUrl
  );
}
