/**
 * The Home page's `@graph` — the organisation entity for the whole site.
 *
 * ── WHY A BUILDER AND NOT A LITERAL IN page.jsx ────────────────────────────
 * Home's structured data was an inline object literal in the JSX, which made it
 * the one JSON-LD block on the site that could not be invoked by a test: the
 * only way to assert anything about it was to scan the source text of a .jsx
 * file, and a source scan cannot tell you what the page EMITS. As a pure builder
 * it is invoked for real, exactly like buildListJsonLd and buildCourseJsonLd.
 *
 * The `siteUrl` parameter exists FOR THE CONTROL, not for callers. Production has
 * one origin and passes nothing. A test passes a different one and asserts that
 * every absolute URL in the result moved — which is what catches a hardcoded host
 * surviving in here, the single defect this whole module is arranged to prevent.
 *
 * ── THE FOUR NODES ─────────────────────────────────────────────────────────
 * EducationalOrganization + WebSite + WebPage + Place, cross-linked by `@id`.
 * Every `@id` and `url` is built from the one origin; nothing concatenates a
 * literal host.
 *
 * NO ItemList NODES. An earlier draft carried four (banner / featured-courses /
 * online-courses / latest-articles). They are deliberately absent: Home already
 * server-renders that content and those links, so the markup added nothing a
 * crawler could not see, and it had to be kept in sync with four separate data
 * feeds forever. The organisation entity is the part that is actually used.
 *
 * NO hasOfferCatalog. The previous block carried four `Course` entries naming no
 * real course, with no url and no offer — decorative, and dropped for the same
 * reason as the ItemLists.
 *
 * ── omit-empty ─────────────────────────────────────────────────────────────
 * Every value passes through prune(): an empty, null or undefined value drops
 * its whole key rather than emitting `""` or `null`. Zero and false are VALUES
 * and are kept — the rule is about absence, not falsiness.
 */

import { siteConfig } from '@/config/site';
import { SITE_URL } from '@/lib/seo/siteUrl';
import { HOME_TITLE } from '@/lib/seo/homeMeta';

/**
 * The training venue, shared by the Place node and the organisation's own
 * `address`. One object rather than two copies: they are the same postal
 * address and a crawler reading them as different ones is the bug.
 *
 * The street line is Thai and the locality is English on purpose — it matches
 * how this address is written in our other listings.
 */
const TRAINING_ADDRESS = {
  '@type': 'PostalAddress',
  streetAddress:
    '318 ชั้น 2 ห้อง 2B อาคาร เอเวอร์กรีนเพลส ซ.วรฤทธิ์ ถนนพญาไท แขวงถนนเพชรบุรี เขตราชเทวี',
  addressLocality: 'Bangkok',
  addressRegion: 'Bangkok',
  postalCode: '10400',
  addressCountry: 'TH',
};

const TELEPHONE = '+6622194304';

/**
 * Profiles that are demonstrably this organisation. `sameAs` is an identity
 * claim, so the Facebook entry reads from siteConfig rather than restating a URL
 * the repo already owns — the same no-second-spelling rule as the origin itself.
 */
const SAME_AS = [
  siteConfig.facebookUrl,
  'https://x.com/9EXPERT',
  'https://th.linkedin.com/company/9expert',
  'https://www.instagram.com/9expert_training/',
  'https://www.youtube.com/channel/UCfh4ustMvOQtu8k-hlqvm4A',
  'https://page.line.me/gic1119p',
  'https://tiktok.com/@9expert',
];

/**
 * Drop every empty key, at any depth.
 *
 * Returns `undefined` for a value that should not be emitted at all, which is
 * how a key disappears rather than appearing as `""` / `null` / `{}`. An object
 * or array that empties out disappears too, so a node cannot survive as a bare
 * `{"@type": "..."}` shell once its content is gone.
 *
 * 0 and false are kept. They are values a schema property can legitimately hold
 * and the omit-empty rule is about ABSENCE, not falsiness — treating them as
 * empty is how a geo coordinate on the equator or a `false` flag silently
 * vanishes.
 */
function prune(value) {
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      const pruned = prune(v);
      if (pruned !== undefined) out[key] = pruned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  return value === null ? undefined : value;
}

/**
 * Build Home's JSON-LD.
 *
 * @param {string} [siteUrl] Origin WITHOUT a trailing slash. Defaults to the
 *   site's one origin; pass a different one only from a test.
 * @returns {object} The `@graph` document, ready to stringify.
 */
export function buildHomeJsonLd(siteUrl = SITE_URL) {
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;
  const webPageId = `${siteUrl}/#webpage`;
  const logoId = `${siteUrl}/#logo`;
  const placeId = `${siteUrl}/#training-location`;

  // The canonical URL of this page. `alternates.canonical` on app/page.jsx is
  // this same value, and the two are REQUIRED to be byte-identical — see
  // lib/seo/siteUrl.js. Measured: the emitted tag carries no trailing slash.
  const homeUrl = siteUrl;

  return prune({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': organizationId,
        name: siteConfig.name,
        alternateName: 'นายน์เอ็กซ์เพิร์ท',
        legalName: siteConfig.nameFull,
        url: homeUrl,
        logo: {
          '@type': 'ImageObject',
          '@id': logoId,
          // Square (400x400) and already the favicon / apple-touch asset. The
          // 16:9 wordmarks in /brand are a worse fit for a logo slot.
          url: `${siteUrl}/logo/9exp-stand.png`,
        },
        image: `${siteUrl}/brand/og-9expert-1200x630.png`,
        description:
          'สถาบันสอนคอมพิวเตอร์ 9Expert Training บริการจัดอบรมหลักสูตร Microsoft Office, Programming, Data Analysis, AI และ Automation สำหรับบุคคลและองค์กร สอนเข้าใจง่าย ใช้งานได้จริง',
        telephone: TELEPHONE,
        email: 'training@9expert.co.th',
        address: TRAINING_ADDRESS,
        founder: {
          '@type': 'Person',
          name: 'Chalaivate Pipatpannawong',
          url: 'https://www.facebook.com/chalaivate',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          telephone: TELEPHONE,
          contactType: 'customer service',
          availableLanguage: ['th', 'en'],
          areaServed: 'TH',
        },
        sameAs: SAME_AS,
        location: { '@id': placeId },
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: homeUrl,
        name: siteConfig.name,
        inLanguage: 'th',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebPage',
        '@id': webPageId,
        url: homeUrl,
        // The page's ACTUAL <title>, read from the same constant app/page.jsx
        // puts in `metadata.title`, so structured data cannot assert a title the
        // page does not have.
        //
        // That title changed on 2026-09-09 (round ORIGIN-1) from
        // `${siteConfig.name} — ${siteConfig.tagline}` to approved marketing
        // copy. This line follows it rather than being pinned to the old value:
        // the rule was never "the name is the brand and the tagline", it was
        // "the name is whatever the page's title is", and lib/seo/homeMeta is
        // now where that one value lives.
        name: HOME_TITLE,
        inLanguage: 'th',
        isPartOf: { '@id': websiteId },
        about: { '@id': organizationId },
      },
      {
        '@type': 'Place',
        '@id': placeId,
        name: siteConfig.name,
        address: TRAINING_ADDRESS,
        hasMap: 'https://maps.app.goo.gl/8ny66J39HeZ2Yh678',
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 13.750661,
          longitude: 100.531117,
        },
        openingHoursSpecification: {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: [
            'https://schema.org/Monday',
            'https://schema.org/Tuesday',
            'https://schema.org/Wednesday',
            'https://schema.org/Thursday',
            'https://schema.org/Friday',
          ],
          opens: '08:00',
          closes: '17:00',
        },
      },
    ],
  });
}
