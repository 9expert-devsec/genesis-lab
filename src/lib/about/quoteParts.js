import { QUOTE_FALLBACK } from '@/lib/about/aboutText';

/**
 * The /about-us pull quote's text, split for emphasis. Pure.
 *
 * The stored tagline carries its own emphasis as a quoted phrase —
 * `สอนแบ่งปันความรู้ เทคโนโลยีเพื่อ "ขับเคลื่อนประเทศไทย"` — so the emphasis
 * comes from the DATA, not from the component:
 *
 *   1. a surrounding pair the text (or an older component) wrapped around the
 *      whole tagline is dropped — curly “…”, or straight "…" with no other
 *      quote mark inside;
 *   2. the FIRST pair of quote marks left (straight or curly) splits the text
 *      into { before, emphasis, after }, and those marks are dropped;
 *   3. no pair → the whole text is `before`.
 *
 * Any stray quote mark is removed from all three parts, so none reaches the
 * page: the decorative opening mark is drawn by CSS, not by the text. An empty
 * or missing tagline reads as QUOTE_FALLBACK.
 */
const QUOTE = /["“”]/;
const QUOTES = /["“”]/g;

function unwrap(text) {
  const first = text[0];
  const last = text[text.length - 1];
  if (text.length < 2) return text;
  if (first === '“' && last === '”') return text.slice(1, -1);
  if (first === '"' && last === '"' && !QUOTE.test(text.slice(1, -1))) return text.slice(1, -1);
  return text;
}

const clean = (s) => s.replace(QUOTES, '');

function split(text) {
  const open = text.search(QUOTE);
  const close = open === -1 ? -1 : text.slice(open + 1).search(QUOTE);
  if (open === -1 || close === -1) return { before: clean(text), emphasis: '', after: '' };
  const end = open + 1 + close;
  return {
    before: clean(text.slice(0, open)),
    emphasis: clean(text.slice(open + 1, end)),
    after: clean(text.slice(end + 1)),
  };
}

export function quoteParts(tagline) {
  const parts = split(unwrap(String(tagline ?? '').trim()).trim());
  // Nothing but quote marks (or nothing at all) reads as the fallback.
  if (!(parts.before + parts.emphasis + parts.after).trim()) {
    return { before: QUOTE_FALLBACK, emphasis: '', after: '' };
  }
  return parts;
}
