import { siteConfig } from '@/config/site';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import CustomPage from '@/models/CustomPage';
import CourseExtension from '@/models/CourseExtension';
import { listPublicCourses } from '@/lib/api/public-courses';
import { courseSitemapEntries } from '@/lib/courses/courseSitemapEntries';
import { getPublishedMasterclasses } from '@/lib/masterclass/getMasterclass';
import { readPublicWriters } from '@/lib/writers/writerReads';
import { writerSitemapEntries } from '@/lib/writers/writerProfile';
import ProgramPageConfig from '@/models/ProgramPageConfig';
import SkillPageConfig from '@/models/SkillPageConfig';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import {
  getActivePromotions, getSlugMap, getActiveBuilderPromotions,
  getActiveCustomPagePromotions,
} from '@/lib/promotions/getPromotions';
import { buildPromotionCards } from '@/lib/promotions/promotionCards';
import { isNoindexPageSlug } from '@/lib/seo/utilityRobots';
import {
  catalogConfigSitemapPaths,
  dedupeSitemapEntries,
  isReviewCopySlug,
  promotionSitemapPaths,
} from '@/lib/seo/sitemapGroups';

// Regenerate hourly — fresh enough for new articles, cheap enough that
// crawlers don't trigger a Mongo round-trip on every hit.
export const revalidate = 3600;

/**
 * ── EVERY BLOCK BELOW FAILS LOUD, NOT SILENT (D04) ─────────────────────────
 * Each group is still best-effort — one failing source must not take the
 * whole sitemap (and every other group) down with a 500. But a failure is
 * logged with the block's name: before D04 each block swallowed its error, so
 * a Mongo or upstream hiccup at regeneration time quietly shipped a sitemap
 * missing a whole group for the next hour, and nothing said so.
 */
function blockFailed(block, err) {
  console.error(`[sitemap] ${block} block failed — group omitted from this regeneration`, err);
}

// Static routes carry NO lastModified (D04): stamping `new Date()` told
// crawlers every hub changed at every hourly regeneration, which is noise
// they learn to ignore — including on the entries whose dates are real.
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
  '/author',
  // Policy pages and the venue guide (D04) — plain static routes, no redirect,
  // no noindex, each with its own canonical.
  '/policies',
  '/privacy-policy',
  '/cookie-policy',
  '/refund-policy',
  '/terms',
  '/restaurant-and-hotel-nearby-9expert-training',
];

export default async function sitemap() {
  const base = siteConfig.url.replace(/\/$/, '');

  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${base}${route}`,
    changeFrequency: route === '' ? 'daily' : 'weekly',
    priority: route === '' ? 1.0 : 0.8,
  }));

  /**
   * Articles — ALL active ones (D04). This used to stop at `.limit(500)` and
   * the live sitemap sat exactly on 500, so the oldest published articles had
   * silently fallen out. One query of four small fields is fine at today's
   * ~600; the sitemap protocol's ceiling is 50,000 URLs per file, and only
   * past that would this need generateSitemaps() — nowhere near it.
   *
   * lastModified is the reader-visible content date: `contentUpdatedAt` is
   * set by the content-change detector (models/Article.js), whereas
   * `updatedAt` also moves on non-content writes; publishedAt next.
   *
   * `-review-YYYYMMDD` slugs are dated working copies of an article, not
   * pages of their own (lib/seo/sitemapGroups).
   */
  let articleEntries = [];
  try {
    await dbConnect();
    const articles = await Article.find({ active: true })
      .sort({ publishedAt: -1 })
      .select('slug contentUpdatedAt publishedAt updatedAt')
      .lean();
    articleEntries = articles
      .filter((a) => a?.slug && !isReviewCopySlug(a.slug))
      .map((a) => ({
        url: `${base}/articles/${a.slug}`,
        lastModified: a.contentUpdatedAt ?? a.publishedAt ?? a.updatedAt ?? undefined,
        changeFrequency: 'monthly',
        priority: 0.6,
      }));
  } catch (err) {
    blockFailed('articles', err);
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
      // No cap (D04) — a silent .limit() drops the oldest pages without a
      // word, the same failure the article cap had.
      .lean();
    customPageEntries = pages
      // D05: utility forms held as CMS pages (/evaluation) are noindex in
      // their metadata, so listing them here would contradict it.
      .filter((p) => p?.slug && !isNoindexPageSlug(p.slug))
      .map((p) => ({
        url: `${base}/${p.slug}`,
        lastModified: p.updatedAt ?? undefined,
        changeFrequency: 'monthly',
        priority: 0.5,
      }));
  } catch (err) {
    blockFailed('custom pages', err);
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
  } catch (err) {
    blockFailed('courses', err);
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
  } catch (err) {
    blockFailed('masterclass', err);
  }

  // Writers — best-effort like every block above, and the same read /author
  // renders from, so the two cannot disagree about who is listed.
  let writerEntries = [];
  try {
    writerEntries = writerSitemapEntries(await readPublicWriters(), base);
  } catch (err) {
    blockFailed('writers', err);
  }

  /**
   * ── PROGRAM AND SKILL CATALOG PAGES (/<x>-all-courses) — D04 ─────────────
   * The same rows getPageLinkability() reads to decide where a program/skill
   * chip links: a config with a urlSlug is that page's one public address
   * (programHref/skillHref return `/${urlSlug}`, and /program|/skill/<x>
   * redirect to it). `isPublished === false` is the hidden flag — those pages
   * call notFound(), so they are left out. An entity with NO config, or a
   * config without a urlSlug, has no -all-courses address (it is served at
   * /program|/skill/<kebab>) and is not listed here.
   */
  let catalogEntries = [];
  try {
    await dbConnect();
    const [programConfigs, skillConfigs] = await Promise.all([
      ProgramPageConfig.find({}).select('urlSlug isPublished updatedAt').lean(),
      SkillPageConfig.find({}).select('urlSlug isPublished updatedAt').lean(),
    ]);
    catalogEntries = catalogConfigSitemapPaths([...programConfigs, ...skillConfigs])
      .map(({ path, updatedAt }) => ({
        url: `${base}${path}`,
        lastModified: updatedAt ?? undefined,
        changeFrequency: 'weekly',
        // A hub of courses: the same rung as the static hubs.
        priority: 0.8,
      }));
  } catch (err) {
    blockFailed('program/skill catalogs', err);
  }

  /**
   * ── CAREER PATHS — D04 ─────────────────────────────────────────────────────
   * getActiveCareerPaths() is the read /career-path-project lists from
   * (`is_active: true`), and the link is built the way that page builds it:
   * `/${api_slug}`. A path without an api_slug has no page of its own there
   * (its card links back to the hub), so it is not listed.
   */
  let careerPathEntries = [];
  try {
    const paths = await getActiveCareerPaths();
    careerPathEntries = (Array.isArray(paths) ? paths : [])
      .filter((p) => p?.api_slug)
      .map((p) => ({
        url: `${base}/${p.api_slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
      }));
  } catch (err) {
    blockFailed('career paths', err);
  }

  /**
   * ── PROMOTION DETAIL PAGES — D04 ───────────────────────────────────────────
   * Exactly the cards /promotions shows: the same four loaders and the same
   * buildPromotionCards() union (live MSDB promotions + visible builder and
   * custom-page promotions), so a URL is listed only while the promotion is
   * live on the index. No lastModified — the cards carry no content date.
   */
  let promotionEntries = [];
  try {
    const [promotions, slugMap, builderPromotions, customPromotions] = await Promise.all([
      getActivePromotions(),
      getSlugMap(),
      getActiveBuilderPromotions(),
      getActiveCustomPagePromotions(),
    ]);
    const cards = buildPromotionCards({ promotions, slugMap, builderPromotions, customPromotions });
    promotionEntries = promotionSitemapPaths(cards).map((path) => ({
      url: `${base}${path}`,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch (err) {
    blockFailed('promotions', err);
  }

  // De-duplicated by URL: the groups come from independent sources (a CMS
  // page slug could equal a catalog urlSlug), and a URL listed twice is
  // noise at best.
  return dedupeSitemapEntries([
    ...staticEntries,
    ...catalogEntries,
    ...careerPathEntries,
    ...articleEntries,
    ...customPageEntries,
    ...courseEntries,
    ...masterclassEntries,
    ...promotionEntries,
    ...writerEntries,
  ]);
}
