/**
 * AboutConfig text as the /about-us page renders it. Pure.
 *
 * Only `tagline` is rendered: inside the เรื่องราวของเรา quote card. The hero
 * paragraph is fixed design copy. description, mission and vision stay
 * admin-only — the live document holds unrelated values for them.
 */

/**
 * The tagline's default in the model and the admin action — so a missing
 * document and an untouched field read the same.
 */
export const DEFAULT_TAGLINE = 'สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"';

/** What the quote card says when the tagline is empty. */
export const QUOTE_FALLBACK = 'สอนแบ่งปันความรู้เทคโนโลยี เพื่อขับเคลื่อนประเทศไทย';

const QUOTE_CHARS = ['“', '”', '"', "'"];

/**
 * The quote card's text: the trimmed tagline (or QUOTE_FALLBACK) inside “ ”.
 * Admin text is never rewritten — a tagline that already starts AND ends with
 * a quote character is shown as-is, so the marks are not doubled.
 */
export function quoteCardText(tagline) {
  const text = String(tagline ?? '').trim() || QUOTE_FALLBACK;
  const quoted = QUOTE_CHARS.includes(text[0]) && QUOTE_CHARS.includes(text[text.length - 1]);
  return quoted && text.length > 1 ? text : `“${text}”`;
}
