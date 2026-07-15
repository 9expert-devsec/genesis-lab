/**
 * Reserved slugs — shared by BOTH page types (CustomPage / `advanced_html`
 * and PageBuilder / `builder`). A page slug that collides with one of these
 * would shadow a real route (or a Next.js internal), so create/update in
 * either collection must reject it.
 *
 * Extracted from actions/customPages.js so the two page types share ONE
 * list — otherwise a slug blocked for advanced-HTML pages could still be
 * claimed by a builder page, and vice versa. Pure module (no imports) so
 * both the server actions and any client-side pre-check can use it.
 */
export const RESERVED_SLUGS = [
  'masterclass', 'career-path', 'career-path-register', 'career-path-project',
  'admin', 'api', 'articles', 'promotions', 'about-us', 'contact-us', 'portfolio',
  'join-us', 'training-course', 'schedule', 'faq', 'social', 'p', 'lp',
  'sitemap.xml', 'robots.txt', '_next', 'favicon.ico',
];

const RESERVED_SET = new Set(RESERVED_SLUGS);

/** Case-normalised membership check. */
export function isReservedSlug(slug) {
  if (!slug) return false;
  return RESERVED_SET.has(String(slug).trim().toLowerCase());
}
