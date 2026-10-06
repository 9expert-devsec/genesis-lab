import { sanitizeRichHtml } from '@/lib/sanitizeRichHtml';

export const CONTENT_FIELDS = ['title', 'excerpt', 'content', 'coverUrl'];

const text = (v) => String(v ?? '').trim();

function normalise(doc) {
  return {
    title: text(doc?.title),
    excerpt: text(doc?.excerpt),
    content: sanitizeRichHtml(String(doc?.content ?? '')),
    coverUrl: text(doc?.coverUrl),
  };
}

/**
 * Did an article's CONTENT change between the stored document and a save?
 *
 * Decides whether `updateArticle` moves `contentUpdatedAt`. The content fields
 * are exactly title, excerpt, content and coverUrl — what a reader sees as "the
 * article". Taxonomy, SEO, JSON-LD, pinning, ordering, `active` and
 * `featuredOnLanding` are deliberately NOT content: those writes all bump
 * Mongoose's `updatedAt`, which is why that field cannot answer this question.
 *
 * BOTH SIDES GO THROUGH THE SAVE'S OWN NORMALISATION before comparing — trim
 * for the strings (articleSchema trims title and excerpt), and sanitizeRichHtml
 * for the body (buildModelData sanitises on the way in). Normalising only the
 * incoming side would count a no-op re-save of a legacy article as an edit,
 * because its stored bytes predate the sanitiser.
 *
 * @param {object} previous the stored document (only the four fields are read)
 * @param {object} next     the payload the save is about to $set
 * @returns {boolean}
 */
export function contentChanged(previous, next) {
  const a = normalise(previous);
  const b = normalise(next);
  return CONTENT_FIELDS.some((f) => a[f] !== b[f]);
}
