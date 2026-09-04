import { siteConfig } from '@/config/site';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import CustomPage from '@/models/CustomPage';

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

  return [...staticEntries, ...articleEntries, ...customPageEntries];
}
