import { siteConfig } from '@/config/site';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import CustomPage from '@/models/CustomPage';
import CourseExtension from '@/models/CourseExtension';
import { listPublicCourses } from '@/lib/api/public-courses';
import { courseSitemapEntries } from '@/lib/courses/courseSitemapEntries';

// Regenerate hourly — fresh enough for new articles, cheap enough that
// crawlers don't trigger a Mongo round-trip on every hit.
export const revalidate = 3600;

const STATIC_ROUTES = [
  '',                       // homepage
  '/training-course',
  '/schedule',
  '/promotions',
  '/articles',
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
    })
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

  return [...staticEntries, ...articleEntries, ...customPageEntries, ...courseEntries];
}
