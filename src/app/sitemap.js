import { siteConfig } from '@/config/site';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import CustomPage from '@/models/CustomPage';
import CourseExtension from '@/models/CourseExtension';
import { listPublicCourses } from '@/lib/api/public-courses';
import { courseSitemapEntries } from '@/lib/courses/courseSitemapEntries';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';

// Regenerate hourly — fresh enough for new articles, cheap enough that
// crawlers don't trigger a Mongo round-trip on every hit.
export const revalidate = 3600;

const STATIC_ROUTES = [
  '',                       // homepage
  '/training-course',
  '/schedule',
  '/promotions',
  '/articles',
  '/masterclass',
  '/career-path-project',
  '/portfolio',
  '/about-us',
  '/contact-us',
  '/faq',
  '/join-us',
  '/social',
];

export default async function sitemap() {
  const base = siteConfig.url.replace(/\/$/, '');

  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));

  // Articles are best-effort — if Mongo is unreachable at build/ISR time
  // we still want a valid sitemap with the static routes.
  let articleEntries = [];
  try {
    await dbConnect();
    const articles = await Article.find({ active: true })
      .sort({ publishedAt: -1 })
      .limit(500)
      .select('slug updatedAt publishedAt')
      .lean();
    articleEntries = articles.map((a) => ({
      url: `${base}/articles/${a.slug}`,
      lastModified: a.updatedAt ?? a.publishedAt ?? new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    // swallow — static entries still ship
  }

  // Custom pages — best-effort, same defensive style as articles.
  // noIndex pages are explicitly de-indexed, so they never enter the sitemap.
  let customPageEntries = [];
  try {
    await dbConnect();
    const pages = await CustomPage.find({
      status: 'published',
      noIndex: { $ne: true },
      /**
       * A PROMOTION page's bare slug 308s to /promotions/<slug>, so listing it
       * here would publish a list of permanent redirects to crawlers. Excluded
       * rather than rewritten: /promotions is already a static entry above, and
       * emitting the new URL from here would put this file in the business of
       * knowing where another route lives.
       *
       * THIS IS A FILTER, NOT A PROJECTION. The `.select()` below stays exactly
       * two fields, so the note under it — the one that says the projection is
       * what keeps the draft out — is still true and still the whole guard.
       */
      pageType: { $ne: 'promotion' },
    })
      /**
       * THE PROJECTION IS WHAT KEEPS THE DRAFT OUT OF THIS READ — do not widen
       * it casually.
       *
       * CustomPage carries an unpublished `draft` subdocument holding the whole
       * content surface, body included. This read is safe today because it asks
       * for exactly two fields, NOT because anything strips one: there is no
       * stripDraft() below. Add a field here and you are one careless `.select()`
       * away from putting unpublished bodies into a public sitemap — the failure
       * the draft split exists to prevent, arriving through the one file nobody
       * thinks of as a page read.
       *
       * If this ever needs more than a URL and a date, take stripDraft() with it.
       * `noIndex` is a DRAFT key, so the filter above deliberately reads the LIVE
       * value: de-indexing takes effect when it is published, not when it is
       * typed.
       */
      .select('slug updatedAt')
      .limit(500)
      .lean();
    customPageEntries = pages.map((p) => ({
      url: `${base}/${p.slug}`,
      lastModified: p.updatedAt ?? new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  } catch {
    // swallow — static + article entries still ship
  }

  /**
   * ── COURSES, ONE URL EACH ────────────────────────────────────────────────
   * They were absent entirely until this round: the sitemap listed twelve
   * static routes, articles and custom pages, and said nothing about the
   * ~77 course detail pages that are the site's reason for existing.
   *
   * ONE entry per course, in the canonical form — the same
   * `courseCanonicalPath` the page's <link rel="canonical"> and the JSON-LD
   * use. A course has two working URLs, and emitting both would be this file
   * telling Google to index exactly the duplicate the canonical tag is trying
   * to stop declaring.
   *
   * `listPublicCourses()` with its default `includeHidden: false` is what
   * excludes the hidden ones (`extension.isPublished === false`), through the
   * one hidden-set loader every other listing uses. Iterating COURSES rather
   * than extensions is what excludes the orphans — an extension whose courseId
   * matches no upstream course is simply never reached, so the three known
   * dead rows cannot appear. Both exclusions matter because a published URL
   * that answers 404 spends crawl budget and, repeated, reads as a quality
   * problem with the whole site.
   *
   * Best-effort, in the same defensive style as the two blocks above: the
   * upstream API is a network hop and a sitemap without courses is far better
   * than a 500 at /sitemap.xml.
   */
  let courseEntries = [];
  try {
    await dbConnect();
    const [{ items: courses }, extensions] = await Promise.all([
      listPublicCourses(),
      CourseExtension.find({}).select('courseId urlAlias isPublished updatedAt').lean(),
    ]);
    courseEntries = courseSitemapEntries({ courses, extensions, base });
  } catch {
    // swallow — static + article + custom-page entries still ship
  }

  /**
   * ── MASTERCLASS, ONE URL EACH ────────────────────────────────────────────
   * The detail pages were missing entirely: /masterclass/<slug> is served by
   * this app and linked from the hub, and the sitemap said nothing about any
   * of it. The hub itself is now a static route above, sitting with /articles
   * and /promotions — the same shape of page, listed the same way.
   *
   * `getPublishedMasterclasses()` is dev's OWN reader, the one
   * (public)/masterclass/page.jsx already lists from, so "published" here
   * cannot drift from what the hub actually shows: both mean
   * `is_published: true` because both are the same query. It pays for a
   * batch join this file never reads, which is the price of having exactly
   * one published-masterclass predicate on this branch instead of two.
   *
   * SLUGS ARE EMITTED EXACTLY AS STORED. getMasterclassBySlug() matches
   * `findOne({ slug })` case-sensitively, so case-normalising a slug here
   * would publish a URL that answers 404 — the course_id casing failure
   * arriving through a different door. No .toLowerCase(), no "tidying".
   *
   * Serialised rows carry `updatedAt` as an ISO string, hence the
   * `new Date()`; the blocks above get Date objects straight off .lean().
   *
   * Best-effort like every block above it: a masterclass outage must not cost
   * the site its courses, articles and static routes.
   */
  let masterclassEntries = [];
  try {
    await dbConnect();
    const masterclasses = await getPublishedMasterclasses();
    masterclassEntries = (Array.isArray(masterclasses) ? masterclasses : [])
      // A blank slug would emit the hub's own URL a second time.
      .filter((m) => m?.slug)
      .map((m) => ({
        url: `${base}/masterclass/${m.slug}`,
        lastModified: m.updatedAt ? new Date(m.updatedAt) : new Date(),
        // Batches open and close continuously — the same cadence as courses.
        changeFrequency: 'weekly',
        // The same rung as courses: above articles (0.6) and custom pages
        // (0.5), below the static hubs (0.8) that link to them.
        priority: 0.7,
      }));
  } catch {
    // swallow — every other entry type still ships
  }

  return [...staticEntries, ...articleEntries, ...customPageEntries, ...courseEntries, ...masterclassEntries];
}
