/**
 * An Article document reshaped for `BlogCard`.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `BlogCard` (exported from app/_components/home/BlogSection) does not take an
 * Article. It takes a already-mapped `blog` object with a different vocabulary:
 * `thumbnail` rather than `coverUrl`, `slug` already prefixed into a full href,
 * and a cover FALLBACK applied — `blog.thumbnail` is handed straight to
 * `next/image`, which throws on an undefined `src`, so the fallback is
 * load-bearing rather than cosmetic.
 *
 * The program page renders the same card, so it needs the same mapping. This is
 * that mapping, in one place, so the two surfaces cannot drift.
 *
 * ── BlogSection STILL HAS ITS OWN INLINE COPY, AND THAT IS DELIBERATE ──────
 * The landing page is the REFERENCE in this round, not the thing to change, so
 * BlogSection was left exactly as it is — including the copy of this logic at
 * BlogSection.jsx:34-48. Converting it to import this module is behaviour-
 * preserving and a clean follow-up; it is not done here because editing the
 * reference while matching against it is how you end up matching your own edit.
 *
 * The duplication is therefore KNOWN and time-boxed rather than accidental,
 * and test/pure/articleCardModel pins the two against each other so they cannot
 * silently diverge in the meantime.
 *
 * @param {object} article an Article document (lean/serialized)
 * @returns {{id: string, programs: string[], skills: string[], title: string,
 *            excerpt: string, thumbnail: string, slug: string}}
 */

/**
 * The stand-in cover, copied verbatim from BlogSection's mapper.
 *
 * Exported so the guard test can compare the two without spelling the path a
 * third time — a literal in the test would be a third copy of the very thing
 * this module exists to have one of.
 */
export const ARTICLE_COVER_FALLBACK =
  '/mock-article/cover-article-claude-cowork-vs-copilot-cowork.png.webp';

export function toBlogCardModel(article) {
  const a = article ?? {};
  return {
    id: a._id ?? a.slug,
    // TAXONOMY IDS, NOT PRE-RENDERED LABELS — the card resolves them through
    // the shared name maps, exactly as it does on the landing page.
    programs: Array.isArray(a.programs) ? a.programs : [],
    skills: Array.isArray(a.skills) ? a.skills : [],
    title: a.title ?? '',
    excerpt: a.excerpt ?? '',
    thumbnail:
      a.coverUrl && a.coverUrl.trim() !== '' ? a.coverUrl : ARTICLE_COVER_FALLBACK,
    slug: `/articles/${a.slug}`,
  };
}
