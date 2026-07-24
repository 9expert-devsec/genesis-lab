/**
 * Route-access predicates for the masterclass-only deployment.
 *
 * Extracted from middleware.js on purpose: middleware.js evaluates
 * `NextAuth(authConfig)` at module load, so importing it boots the Edge auth
 * stack. These functions are pure string predicates with no such dependency,
 * which lets test/pure/ unit-test the whitelist in isolation. middleware.js
 * imports (and re-exports) them so there is still a single source of truth.
 */

/** Returns true for routes that are allowed on this masterclass-only deployment. */
export function isMasterclassRoute(pathname) {
  // SEO/discovery files — MUST be served from THIS host, never redirected.
  // Googlebot fetches /sitemap.xml and /robots.txt directly; if the
  // masterclass-only redirect swallows them (307 → main domain), the crawler
  // never reaches this deployment's URLs and the masterclass pages silently
  // drop out of the index. These map to src/app/sitemap.js and
  // src/app/robots.js — add any future root-served SEO file here too.
  if (pathname === '/sitemap.xml') return true;
  if (pathname === '/robots.txt') return true;
  // /masterclass/payment/* (Omise 3DS return page, etc.)
  if (pathname.startsWith('/masterclass/payment/')) return true;
  // /masterclass/[slug]
  // /masterclass/[slug]/register
  // /masterclass/[slug]/register/* (any sub-step)
  if (/^\/masterclass\/[^/]+(\/register(\/.*)?)?$/.test(pathname)) return true;
  // API routes — always allow
  if (pathname.startsWith('/api/')) return true;
  // Next.js internals + static assets served from /public
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/brand/')) return true;
  if (pathname.startsWith('/assets/')) return true;
  if (pathname.startsWith('/fonts/')) return true;
  if (pathname.startsWith('/icons/')) return true;
  // Admin surface — handled below
  if (pathname.startsWith('/admin')) return true;
  return false;
}

/**
 * For an unrecognised /masterclass/<slug>/… subpath, return the parent course
 * page path (/masterclass/<slug>); null for anything not under /masterclass/.
 *
 * Shared/ad links sometimes carry a deeper tail (a stale campaign segment, a
 * mistyped step). Those fail isMasterclassRoute's strict regex, and without
 * this they'd hit the blanket cross-domain redirect and strand the visitor on
 * the other site's homepage — no course, no context. Sending them to the
 * course they were clearly headed for keeps the intent (and the ad's landing
 * relevance) intact.
 */
export function parentMasterclassPath(pathname) {
  const m = /^\/masterclass\/([^/]+)\/.+/.exec(pathname);
  return m ? `/masterclass/${m[1]}` : null;
}
