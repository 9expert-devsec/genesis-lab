import { siteConfig } from '@/config/site';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';

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

  return [...staticEntries, ...articleEntries];
}
