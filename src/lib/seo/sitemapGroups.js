/**
 * Pure helpers behind src/app/sitemap.js's D04 groups — no DB, no network, so
 * the rules are testable without a Mongo connection.
 */

/**
 * `<slug>-review-YYYYMMDD` is a dated working copy of an article, not a page of
 * its own. It must never be listed, whatever its `active` flag says.
 */
const REVIEW_COPY = /-review-\d{8}$/;

export function isReviewCopySlug(slug) {
  return REVIEW_COPY.test(String(slug ?? '').trim());
}

/**
 * ProgramPageConfig / SkillPageConfig rows → their public catalog paths.
 *
 * Mirrors getPageLinkability(): `isPublished === false` is hidden (the page
 * 404s); a missing/blank urlSlug has no catalog address of its own. Paths are
 * de-duplicated (a program and a skill cannot share a urlSlug in practice,
 * but one bad row must not emit a URL twice).
 *
 * @param {Array<{urlSlug?: string|null, isPublished?: boolean, updatedAt?: Date}>} rows
 * @returns {Array<{path: string, updatedAt?: Date}>}
 */
export function catalogConfigSitemapPaths(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row || row.isPublished === false) continue;
    const slug = String(row.urlSlug ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!slug) continue;
    const path = `/${slug}`;
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, updatedAt: row.updatedAt });
  }
  return out;
}

/**
 * Promotion cards (buildPromotionCards) → the detail paths to list. Only a
 * well-formed `/promotions/<slug>` href counts; anything else (an empty slug
 * would produce `/promotions/`, the index itself) is dropped.
 */
export function promotionSitemapPaths(cards = []) {
  const seen = new Set();
  const out = [];
  for (const card of cards) {
    const href = String(card?.href ?? '');
    if (!/^\/promotions\/[^/?#]+$/.test(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

/** Keep the first entry per URL, preserving order. */
export function dedupeSitemapEntries(entries = []) {
  const seen = new Set();
  return entries.filter((e) => {
    if (!e?.url || seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}
