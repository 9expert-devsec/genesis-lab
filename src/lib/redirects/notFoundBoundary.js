import { headers } from 'next/headers';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
// ADDED beside the statements above rather than folded into either — the
// standing rule in this repo.
import { resolveNotFound } from '@/lib/redirects/resolveNotFound';
import { normalisePath } from '@/lib/redirects/redirectRules';

/**
 * "The app has nothing to serve for this path" — the ONE place that decides
 * what happens next.
 *
 * Call it INSTEAD of `notFound()`. It either throws a redirect (a rule matched)
 * or throws `notFound()` itself, so it never returns and the call site needs no
 * branch:
 *
 *     await notFoundOrRedirect(slug);   // does not return
 *
 * ── WHY A HELPER AND NOT A COPY AT EACH EXIT ──────────────────────────────
 * The catch-all has TWO exits — a multi-segment path bails early, before any
 * resolver runs, and a single-segment path falls through every resolver to the
 * bottom. Both are "we are about to 404", and legacy URLs arrive in both shapes.
 * Two copies of this logic would drift, and the one that drifted would be the
 * multi-segment exit, which is the less-read of the two and the one carrying
 * most of a Drupal site's URLs.
 *
 * ── WHY THE HOST COMES FROM headers() ─────────────────────────────────────
 * MEASURED, not assumed: `headers()` in this context carries `host` and
 * `x-forwarded-host` and nothing that names the path. That is why the PATH is
 * passed in as an argument rather than read from a header — there is no header
 * to read it from, which is also why this cannot live in not-found.jsx, which
 * receives no props at all. `x-forwarded-host` is preferred because that is the
 * client's host once a proxy is in front; `host` is the fallback.
 *
 * ── 308 vs 307 ────────────────────────────────────────────────────────────
 * `permanentRedirect` (308) by default, matching the rest of this route's
 * redirects and telling search engines the move is real. A rule can opt into
 * 307 when the move is temporary. Both throw, so both must sit outside any
 * try/catch — the same constraint the route's existing historical-slug
 * redirects document at their call site.
 */

/** The request's host, as the client sees it. */
async function requestHost() {
  try {
    const h = await headers();
    return h.get('x-forwarded-host') || h.get('host') || '';
  } catch {
    // No request scope. Nothing to key a rule on; the 404 still renders.
    return '';
  }
}

/**
 * The requested path, from the catch-all's own `slug` param.
 *
 * Rebuilt here rather than taken from `segmentFromSlug`, because that helper
 * returns null for anything with a slash in it — which is exactly the
 * multi-segment legacy URL this needs to be able to match.
 */
export function pathFromSlug(slug) {
  const parts = Array.isArray(slug) ? slug : [slug];
  const joined = parts
    .filter((s) => s !== undefined && s !== null && s !== '')
    .map((s) => String(s))
    .join('/');
  return normalisePath(joined);
}

/**
 * Redirect if a rule matches; otherwise record the miss and 404.
 *
 * NEVER RETURNS. Both branches throw — `redirect`/`permanentRedirect` throw a
 * Next control-flow signal, and `notFound()` throws its own. A caller that
 * writes `return notFoundOrRedirect(...)` is correct; one that writes code
 * after it has written dead code.
 */
export async function notFoundOrRedirect(slug) {
  const path = pathFromSlug(slug);
  const host = await requestHost();

  let hit = null;
  try {
    hit = await resolveNotFound({ host, path });
  } catch (err) {
    /**
     * A THROWN LOOKUP MUST NOT BECOME A 500 — but a thrown REDIRECT must not be
     * swallowed either, and both arrive here as exceptions. Next's control-flow
     * signals carry a `digest` beginning `NEXT_REDIRECT`; anything else is a
     * genuine failure and the honest answer to it is the 404 the visitor was
     * already getting.
     */
    if (typeof err?.digest === 'string' && err.digest.startsWith('NEXT_')) throw err;
    console.warn('[redirects] boundary lookup failed:', err?.message ?? err);
    hit = null;
  }

  if (hit?.destination) {
    if (hit.permanent) permanentRedirect(hit.destination);
    redirect(hit.destination);
  }

  notFound();
}
