/**
 * robots.txt (Next.js App Router convention → served at /robots.txt).
 *
 * This deployment runs masterclass-only (see src/middleware.js): the only
 * indexable surface is /masterclass/*. Admin and API routes are never public
 * content, so they're disallowed explicitly rather than relying on the
 * middleware's 404/redirect to hide them from crawlers.
 *
 * The sitemap URL is absolute and derived from getSiteUrl() so it resolves on
 * whichever host is serving this file — never a hardcoded domain.
 */

import { getSiteUrl } from '@/config/site';

export default function robots() {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/masterclass/',
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
