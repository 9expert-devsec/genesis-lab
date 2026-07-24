/**
 * XML sitemap (Next.js App Router convention → served at /sitemap.xml).
 *
 * Scope is deliberately narrow: this codebase's middleware runs in
 * masterclass-only mode (src/middleware.js redirects every non-masterclass
 * public route to the main site), so the ONLY publicly reachable content on
 * this deployment is /masterclass/[slug]. Listing anything else — the bare
 * /masterclass hub, marketing pages — would advertise URLs the middleware
 * immediately 307s away, which wastes crawl budget and invites soft-404s.
 *
 * URLs are absolute and built from getSiteUrl() so they always point at the
 * host actually serving them (never a hardcoded domain).
 */

import { getSiteUrl } from '@/config/site';
import { getPublishedMasterclassSlugs } from '@/lib/masterclass/getMasterclass';

// Run at request time, not build time. The course list lives in MongoDB, so
// evaluating this during `next build` (the default for a route with no dynamic
// APIs) would either fail with no DB or freeze a stale list into the build.
// revalidate hands it a warm connection and refreshes hourly.
export const revalidate = 3600;

export default async function sitemap() {
  const base = getSiteUrl();

  let courses;
  try {
    courses = await getPublishedMasterclassSlugs();
  } catch (err) {
    // Surface the real cause in Vercel logs and let it fail loudly. Silently
    // returning [] would emit an empty 200 sitemap — which reads to Google as
    // "this site has no pages" and deindexes far more quietly than a retryable
    // error does.
    console.error('[sitemap] failed to load published masterclass slugs:', err);
    throw err;
  }

  return courses.map(({ slug, updatedAt }) => ({
    url: `${base}/masterclass/${slug}`,
    lastModified: updatedAt ? new Date(updatedAt) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));
}
