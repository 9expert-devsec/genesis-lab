/**
 * D05 — utility pages that must not be indexed but whose links may be followed.
 *
 * `follow: true` on purpose: these pages link to courses and the rest of the
 * site, and a crawler that lands on one (from an old backlink, say) should
 * still walk out of it. Compare the CMS `noIndex` flag and preview renders in
 * app/(public)/[...slug]/page.jsx, which use { index: false, follow: false } —
 * those are pages an author chose to hide, a different intent.
 *
 * Applied through each route's metadata:
 *   · /search                         — search/page.jsx
 *   · /registration/**                — registration/layout.jsx
 *   · /masterclass/<slug>/register/** — masterclass/[slug]/register/layout.jsx
 *   · the CMS pages in NOINDEX_PAGE_SLUGS, served by the catch-all
 * and src/app/sitemap.js leaves every one of them out.
 */
export const UTILITY_ROBOTS = Object.freeze({ index: false, follow: true });

/**
 * Bare slugs of CMS pages (CustomPage / Page Builder) that are utility forms,
 * not content. Held in code, not as the CMS noIndex flag, so the rule ships
 * with the code instead of depending on an admin edit.
 *
 * /dashboard and /dashboard2 are deliberately NOT here: whether those pages
 * stay public is a Marketing decision (M06).
 */
export const NOINDEX_PAGE_SLUGS = Object.freeze(['evaluation']);

/** Is this bare catch-all slug one of NOINDEX_PAGE_SLUGS? Case-insensitive. */
export function isNoindexPageSlug(slug) {
  if (!slug) return false;
  return NOINDEX_PAGE_SLUGS.includes(String(slug).trim().toLowerCase());
}
