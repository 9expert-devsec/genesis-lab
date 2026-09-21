/**
 * Record a 404 from an ISR route into the not-found log — WITHOUT making the
 * route dynamic and WITHOUT a database write on a cached hit.
 *
 * ── WHY THE CATCH-ALL'S BOUNDARY CANNOT BE REUSED HERE ──────────────────────
 * lib/redirects/notFoundBoundary reads `headers()` for the request host. That
 * is fine on `/[...slug]`, which is per-request anyway; on `/articles/[slug]`
 * or `/masterclass/[slug]` one `headers()` call turns the whole route back
 * into a function per request (test/fs/isrRoutes guards exactly this). So
 * the host is the site's canonical host, not the request's: the log is a
 * worklist of PATHS, keyed (host, path) only so that rules can be scoped, and
 * a canonical-host row is the row an admin would write a rule for anyway.
 *
 * ── WHEN THE WRITE HAPPENS, AND WHEN IT DOES NOT ────────────────────────────
 * This runs inside the page's render, and under ISR a render happens only on
 * a MISS or a background regeneration — a cached HIT is served by the edge
 * and never reaches this code. One `$inc` per regeneration of a junk slug is
 * therefore exactly the number this exists to measure: how many 404 writes
 * the ISR cache is absorbing. `after()` defers the Mongo round-trip until the
 * response has been sent, so it costs the 404 nothing; `after` is not a
 * dynamic API and does not change the route's caching.
 *
 * Errors never escape: a 404 that became a 500 because the logger failed is
 * worth less than the row it lost (same stance as recordNotFound itself).
 */

import { after } from 'next/server';
import { siteConfig } from '@/config/site';
import { recordNotFound } from '@/lib/redirects/resolveNotFound';

/** Host part of the canonical site URL, or '' if it does not parse. */
export function canonicalHost(siteUrl = siteConfig.url) {
  try {
    return new URL(String(siteUrl ?? '')).host;
  } catch {
    return '';
  }
}

/**
 * `path` is the request path as the router saw it — segments still
 * percent-encoded, the way the catch-all's `pathFromSlug` logs them — so
 * rows from both writers normalise the same way.
 *
 * `deps` is a test seam only; production passes nothing.
 */
export function recordStaticNotFound(path, deps = {}) {
  const {
    schedule = after,
    record = recordNotFound,
    host = canonicalHost(),
    warn = (...args) => console.warn(...args),
  } = deps;

  try {
    schedule(() =>
      Promise.resolve()
        .then(() => record({ host, path }))
        .catch((err) => {
          warn('[redirects] could not record a static 404:', err?.message ?? err);
        })
    );
    return { scheduled: true };
  } catch (err) {
    // `after` throws outside a request scope (a build-time render, a test
    // without the Next runtime). The 404 still renders.
    warn('[redirects] static 404 logging skipped:', err?.message ?? err);
    return { scheduled: false };
  }
}
