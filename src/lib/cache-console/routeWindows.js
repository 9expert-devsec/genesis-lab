/**
 * Route cache windows — BUILD-TIME FACTS, NOT LIVE STATE.
 *
 * Every value here was read out of a real `next build` route table, not
 * inferred from route config. The distinction is the reason this table exists
 * at all: FOR SEVERAL ROUTES THE EXPORTED VALUE IS NOT THE EFFECTIVE ONE, and
 * a console that displayed `export const revalidate` would be confidently wrong
 * about a third of the public site.
 *
 * ── THIS IS NOT A STATUS ────────────────────────────────────────────────────
 * These are the windows the last build BAKED IN. They say nothing about
 * whether any particular URL is currently serving a cached entry, how old it
 * is, or when it will regenerate — Next's Data Cache and Vercel's ISR entry
 * state are both write-only from application code (`revalidatePath` and
 * `revalidateTag` return void), which docs/cache-console-inventory.md §E
 * classifies NOT OBSERVABLE. The UI must present this as a reference table and
 * never as a health indicator.
 *
 * ── THE THREE WAYS AN EXPORTED VALUE STOPS BEING THE EFFECTIVE ONE ──────────
 *
 *   1. LOWERED BY A FETCH IN A SHARED LAYOUT. Next takes the segment's
 *      revalidate down to the shortest `next: { revalidate }` inside it. Every
 *      page rendering the site chrome inherits 1h from
 *      (public)/layout.jsx:15 → PublicHeader.jsx:1,28 → programs.js:12, a
 *      tagged aiFetch at aiFetch's default 3600 (client.js:38). This is why
 *      /terms — which exports nothing and fetches nothing — is 1h, and why
 *      /contact-us's exported 86400 never takes effect.
 *
 *   2. DEFEATED BY A DYNAMIC API. /search exports revalidate = 1800 and then
 *      awaits `searchParams` (search/page.jsx:34), which forces the route
 *      dynamic. The exported value is inert.
 *
 *   3. DEFEATED BY AN UNENUMERABLE SEGMENT. A dynamic segment with no
 *      `generateStaticParams` cannot be prerendered, so it builds ƒ Dynamic
 *      whatever it exports. There is NO generateStaticParams anywhere in
 *      src/app — verified — so this applies to every [param] route in the app.
 *
 * Keep `exported` as the literal text of the segment export so the fs guard can
 * grep the source and compare. `effective` cannot be verified that way and is
 * marked as build-measured; see the guard's own docstring for what it cannot
 * see.
 */

/** When the `effective` column was last read off a real build. */
export const MEASURED_AT = '2026-08-12';
/** The commit whose `next build` produced the `effective` column. */
export const MEASURED_COMMIT = 'da643a9';

export const DIVERGENCE = Object.freeze({
  NONE: 'none',
  LOWERED_BY_LAYOUT: 'lowered-by-layout',
  INERT_DYNAMIC_API: 'inert-dynamic-api',
  INERT_UNENUMERABLE: 'inert-unenumerable',
});

/**
 * `exported` — the literal segment export, or null when the file has none.
 * `effective` — what the build actually produced.
 * `why` — populated only when the two disagree.
 */
export const ROUTE_WINDOWS = Object.freeze([
  // ── the divergences, first, because they are the point of the table ──
  {
    path: '/contact-us',
    file: 'src/app/(public)/contact-us/page.jsx',
    exported: 'revalidate = 86400',
    effective: '1h',
    divergence: DIVERGENCE.LOWERED_BY_LAYOUT,
    why: 'Exports 24h. Builds at 1h — lowered by the chrome\'s listPrograms() fetch, and by its own contact-us.js:18 read, both at aiFetch\'s default 3600. The 24h was never in effect.',
  },
  {
    path: '/terms',
    file: 'src/app/(public)/terms/page.jsx',
    exported: null,
    effective: '1h',
    divergence: DIVERGENCE.LOWERED_BY_LAYOUT,
    why: 'Exports nothing and fetches nothing. Reading route config alone would call it fully static; it is 1h, inherited from the site chrome.',
  },
  {
    path: '/policies, /cookie-policy, /privacy-policy, /refund-policy, /social',
    file: 'src/app/(public)/*/page.jsx',
    exported: null,
    effective: '1h',
    divergence: DIVERGENCE.LOWERED_BY_LAYOUT,
    why: 'Same shape as /terms — no export, no fetch, 1h from the chrome.',
  },
  {
    path: '/search',
    file: 'src/app/(public)/search/page.jsx',
    exported: 'revalidate = 1800',
    effective: 'Dynamic',
    divergence: DIVERGENCE.INERT_DYNAMIC_API,
    why: 'Awaits searchParams (search/page.jsx:34), which forces the route dynamic. The exported 1800 has no effect.',
  },
  {
    path: '/[...slug]',
    file: 'src/app/(public)/[...slug]/page.jsx',
    exported: 'revalidate = 3600',
    effective: 'Dynamic',
    divergence: DIVERGENCE.INERT_UNENUMERABLE,
    why: 'Catch-all with no generateStaticParams, and its metadata awaits searchParams. Every course, program, skill and builder page is served by this route.',
  },
  {
    path: '/promotions/[slug]',
    file: 'src/app/(public)/promotions/[slug]/page.jsx',
    exported: 'revalidate = 3600',
    effective: 'Dynamic',
    divergence: DIVERGENCE.INERT_UNENUMERABLE,
    why: 'Dynamic segment, no generateStaticParams anywhere in src/app.',
  },
  {
    path: '/articles/[slug]',
    file: 'src/app/(public)/articles/[slug]/page.jsx',
    exported: 'revalidate = 3600',
    effective: 'Dynamic',
    divergence: DIVERGENCE.INERT_UNENUMERABLE,
    why: 'Dynamic segment, no generateStaticParams anywhere in src/app.',
  },
  {
    path: '/program/[slug], /skill/[slug]',
    file: 'src/app/(public)/{program,skill}/[slug]/page.jsx',
    exported: 'revalidate = 3600',
    effective: 'Dynamic',
    divergence: DIVERGENCE.INERT_UNENUMERABLE,
    why: 'Dynamic segments, no generateStaticParams anywhere in src/app.',
  },

  // ── routes whose exported value IS the effective one ──
  {
    path: '/',
    file: 'src/app/page.jsx',
    exported: null,
    effective: '1h',
    divergence: DIVERGENCE.LOWERED_BY_LAYOUT,
    why: 'Exports nothing; 1h comes from the header it mounts inline (page.jsx:122).',
  },
  {
    path: '/training-course',
    file: 'src/app/(public)/training-course/page.jsx',
    exported: null,
    effective: '30m',
    divergence: DIVERGENCE.LOWERED_BY_LAYOUT,
    why: 'Exports nothing. 30m, not the chrome\'s 1h — lowered further by listSchedulesByCourse (schedules.js:120, revalidate 1800) reached through enrichCoursesWithDetails.',
  },
  {
    path: '/schedule',
    file: 'src/app/(public)/schedule/page.jsx',
    exported: 'revalidate = 1800',
    effective: '30m',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/about-us',
    file: 'src/app/(public)/about-us/page.jsx',
    exported: 'revalidate = 3600',
    effective: '1h',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/career-path-project',
    file: 'src/app/(public)/career-path-project/page.jsx',
    exported: 'revalidate = 3600',
    effective: '1h',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/promotions',
    file: 'src/app/(public)/promotions/page.jsx',
    exported: 'revalidate = 3600',
    effective: '1h',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/restaurant-and-hotel-nearby-9expert-training',
    file: 'src/app/(public)/restaurant-and-hotel-nearby-9expert-training/page.jsx',
    exported: 'revalidate = 3600',
    effective: '1h',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/sitemap.xml',
    file: 'src/app/sitemap.js',
    exported: 'revalidate = 3600',
    effective: '1h',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/faq',
    file: 'src/app/(public)/faq/page.jsx',
    exported: "dynamic = 'force-dynamic'",
    effective: 'Dynamic',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/articles',
    file: 'src/app/(public)/articles/page.jsx',
    exported: "dynamic = 'force-dynamic'",
    effective: 'Dynamic',
    divergence: DIVERGENCE.NONE,
  },
  {
    path: '/robots.txt',
    file: 'src/app/robots.js',
    exported: null,
    effective: 'none — fully static',
    divergence: DIVERGENCE.NONE,
    why: 'THE ONLY fully-static public route. It renders no site chrome, so nothing lowers it. Changes only on deploy or an on-demand revalidate.',
  },
]);

/** Rows whose exported value is not the effective one. */
export function divergentRoutes(rows = ROUTE_WINDOWS) {
  return rows.filter((r) => r.divergence !== DIVERGENCE.NONE);
}
