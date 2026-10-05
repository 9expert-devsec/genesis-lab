import { unstable_cache } from 'next/cache';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import RedirectRule from '@/models/RedirectRule';
import { matchRedirect, normalisePath } from '@/lib/redirects/redirectRules';
import { buildTagIndex, resolveLegacyTag, legacySlugToText } from '@/lib/articles/legacyTagSlug';

/**
 * Legacy Drupal tag pages, `/tags/<slug>` → the Genesis article tag filter.
 *
 * They have 404'd since the 2026-09-08 cutover and the Redirect Panel's 404 log
 * still shows them hit daily (TAGS-1 measured 4,864 distinct paths, ~50K hits
 * over the log's 30-day window). The panel matches exact paths only, so the
 * slug → tag mapping is done here, in lib/articles/legacyTagSlug.js.
 *
 * PRECEDENCE: this static `tags/[slug]` segment outranks the `(public)/[...slug]`
 * catch-all, so a one-segment /tags/ path never reaches the 404 boundary.
 * Deeper paths (/tags/a/b) still fall through to it, as before.
 *
 *   1. an exact, active Redirect Panel rule for the path wins (same pure
 *      matcher the 404 boundary uses, so the same validation applies)
 *   2. a tag resolves → 308 /articles?tag=<tag>
 *   3. otherwise     → 308 /articles?q=<slug as words>  (`q` is the list's
 *      free-text search), or bare /articles when the slug has no words
 *
 * This deliberately does NOT call resolveNotFound(): that records a 404-log
 * row on every miss, and this route is the replacement for the 404, not a 404.
 *
 * COST. This is mostly crawler traffic, so nothing here queries Mongo per
 * request: the tag counts and the /tags/ rules are read once per hour into the
 * data cache (the tag list is also tagged `articles`, which every article save
 * already revalidates), and the response itself carries `s-maxage` so Vercel's
 * edge answers repeats without invoking the function.
 */

const EDGE_CACHE = 'public, max-age=3600, s-maxage=86400';

const loadRedirectData = unstable_cache(
  async () => {
    await dbConnect();
    const [tagRows, rules] = await Promise.all([
      Article.aggregate([
        { $match: { active: true } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
      ]),
      RedirectRule.find({ isActive: true, source: /^\/tags\// })
        .select('host source destination permanent isActive')
        .lean(),
    ]);
    return {
      tagCounts: tagRows
        .filter((t) => typeof t._id === 'string' && t._id.trim())
        .map((t) => ({ tag: t._id, count: t.count })),
      rules: rules.map((r) => ({
        host: r.host,
        source: r.source,
        destination: r.destination,
        permanent: r.permanent,
        isActive: r.isActive,
      })),
    };
  },
  ['legacy-tag-redirect-v1'],
  { revalidate: 3600, tags: ['articles'] }
);

function redirectTo(location, status = 308) {
  return new Response(null, {
    status,
    headers: { Location: location, 'Cache-Control': EDGE_CACHE },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  // The ENCODED path, lowercased by normalisePath — the same key the 404 log
  // and the Redirect Panel store (`/tags/%c2%a0free`).
  const path = normalisePath(url.pathname);
  const slug = url.pathname.split('/')[2] ?? '';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';

  let data = { tagCounts: [], rules: [] };
  try {
    data = await loadRedirectData();
  } catch (err) {
    // Database down: the text fallback still lands the visitor somewhere
    // useful. Not edge-cached, so the next request tries again.
    console.warn('[tags] redirect data load failed:', err?.message ?? err);
    const text = legacySlugToText(slug);
    return new Response(null, {
      status: 307,
      headers: {
        Location: text ? `/articles?q=${encodeURIComponent(text)}` : '/articles',
        'Cache-Control': 'no-store',
      },
    });
  }

  const rule = matchRedirect({ host, path, rules: data.rules });
  if (rule) return redirectTo(rule.destination, rule.permanent ? 308 : 307);

  const resolved = resolveLegacyTag(slug, buildTagIndex(data.tagCounts));
  if (resolved) return redirectTo(`/articles?tag=${encodeURIComponent(resolved.tag)}`);

  const text = legacySlugToText(slug);
  return redirectTo(text ? `/articles?q=${encodeURIComponent(text)}` : '/articles');
}
