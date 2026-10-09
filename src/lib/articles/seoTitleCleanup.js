/**
 * Classifies a stored article `seoTitle` for the one-off cleanup in
 * scripts/cleanup-seo-titles.mjs (SITE-13 / R2). PURE: no db, no fs, no env.
 *
 * Before R1 the admin form cut `seoTitle` at 60 UTF-16 units mid-word, and
 * editors routinely typed the brand into it, so the stored corpus is full of
 * `X | 9Expert`, `X │ 9Expert │ 9Expert Training` and `X | 9Expe`. The public
 * page now appends the brand itself (lib/articles/articleTitle.js), so the
 * typed brand is redundant at best and truncated at worst.
 *
 * Categories, in the order they are tested:
 *   empty        — no seoTitle; nothing proposed (the page uses `title`).
 *   brand-suffix — a trailing `<sep> <brand>` (brand: `9` … `9Expert
 *                  Training`, any prefix) or a bare trailing `<sep>` stripped,
 *                  repeatedly (R2b rules A and B).
 *   cut-prefix   — the stored value is exactly 60 UTF-16 units (the old
 *                  form's `.slice(0, 60)` signature) and, after stripping, a
 *                  STRICT prefix of `title`: it was cut from the full title,
 *                  so it is emptied and the page falls back to `title`. A
 *                  shorter title is never invented (R2b rule C).
 *   brand-suffix+cut-prefix — both; proposed value ''.
 *   needs-human  — stripping left nothing, or ≥58 graphemes, not a prefix of
 *                  `title`, and ending in what looks like a mid-word cut.
 *   ok           — none of the above.
 *
 * REPORTED LENGTHS ARE GRAPHEMES (Intl.Segmenter), not UTF-16 units: Thai
 * combining vowels and tone marks are separate code units but not separate
 * characters, so `.length` would overcount every Thai title. The one place
 * UTF-16 `.length` is used is rule C's 60-unit test, because that is the unit
 * the old form cut in.
 */

import { escapeRegex } from '@/lib/searchTerm';

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** User-perceived character count. */
export function graphemeLength(value) {
  let n = 0;
  for (const _ of segmenter.segment(String(value ?? ''))) n += 1;
  return n;
}

/** `(?:a(?:b(?:c)?)?)` — matches every non-empty prefix of `word` from `min` chars. */
function prefixPattern(word, min) {
  // `escapeRegex` rather than a sixth private copy of the same expression in
  // the same file. Not user input (the words are literals above), so this is
  // consistency, not a fix.
  const esc = escapeRegex;
  const chars = [...word];
  let tail = '';
  for (let i = chars.length - 1; i >= min; i -= 1) tail = `(?:${esc(chars[i])}${tail})?`;
  return chars.slice(0, min).map(esc).join('') + tail;
}

/** Separators seen in the corpus: ASCII pipe, box-drawing │, full-width ｜, dashes, colon. */
const SEPARATORS = '[|\\u2502\\uFF5C\\-\\u2013\\u2014:]';
// Brand: `9` … `9Expert` (rule A: a lone `9` counts — the old 60-unit cut left
// titles ending `| 9`), then optionally ` Training` or any prefix of it. Always
// behind a separator, so `… Windows 9` is not a brand tail.
const BRAND = `${prefixPattern('9Expert', 1)}(?:\\s+${prefixPattern('Training', 1)})?`;
const BRAND_SUFFIX_RE = new RegExp(`\\s*${SEPARATORS}\\s*${BRAND}\\s*$`, 'iu');
// Rule B: a separator with nothing after it — the brand was cut off entirely.
const BARE_SEPARATOR_RE = new RegExp(`\\s*${SEPARATORS}+\\s*$`, 'u');

/**
 * Strip trailing `<sep> <brand>` and bare trailing separators until nothing
 * more matches. `removed` is the exact text taken off the (trimmed) input.
 */
export function stripBrandSuffix(value) {
  const input = String(value ?? '').trim();
  let s = input;
  for (;;) {
    const next = s.replace(BRAND_SUFFIX_RE, '').replace(BARE_SEPARATOR_RE, '').trim();
    if (next === s) break;
    s = next;
  }
  return { value: s, stripped: s !== input, removed: input.slice(s.length) };
}

/** Rule C: the old admin form's `.slice(0, 60)` — measured in UTF-16 units. */
export const OLD_FORM_CUT_UNITS = 60;
export const NEEDS_HUMAN_MIN = 58;

/** Ends in whitespace or punctuation — i.e. not obviously cut inside a word. */
const CLEAN_END_RE = /[\s\p{P}\p{S}]$/u;

/**
 * Mid-word heuristic. The last whitespace-delimited token is "complete" if it
 * occurs in `title` or `excerpt` followed by whitespace, punctuation or the
 * end of the string. Reliable for Latin text; for Thai, which does not put
 * spaces between words, a complete word followed by more Thai text in the
 * title looks exactly like a cut, so Thai endings over-report (see the R2
 * report).
 */
export function looksCutMidWord(value, title, excerpt) {
  const s = String(value ?? '');
  if (!s || CLEAN_END_RE.test(s)) return false;
  const token = s.split(/\s+/).at(-1);
  if (!token) return false;
  // Shared helper, replacing a private copy — see lib/searchTerm.js.
  // `escapeRegex` rather than `searchTermPattern`: this is a token lifted out of
  // a stored title, not a search box, and the length cap would be meaningless
  // (a one-word token) while trimming would change which token is tested.
  const complete = new RegExp(`${escapeRegex(token)}(?=[\\s\\p{P}\\p{S}]|$)`, 'u');
  return !complete.test(String(title ?? '')) && !complete.test(String(excerpt ?? ''));
}

/**
 * @param {{ seoTitle?: string, title?: string, excerpt?: string }} article
 * @returns {{
 *   category: 'empty'|'brand-suffix'|'cut-prefix'|'brand-suffix+cut-prefix'|'needs-human'|'ok',
 *   current: string,
 *   proposed: string|null,   // null = no change proposed
 *   lengthBefore: number,    // graphemes
 *   lengthAfter: number,     // graphemes
 *   utf16LengthBefore: number,
 *   stripped: string,        // exact text removed by rules A/B, '' if none
 * }}
 */
export function classifySeoTitle(article) {
  const current = String(article?.seoTitle ?? '').trim();
  const title = String(article?.title ?? '').trim();
  const lengthBefore = graphemeLength(current);
  // UTF-16 units of the value AS STORED — used only for rule C's cut signature.
  const utf16LengthBefore = String(article?.seoTitle ?? '').length;
  const { value, stripped, removed } = stripBrandSuffix(current);
  const result = (category, proposed) => ({
    category,
    current,
    proposed,
    lengthBefore,
    lengthAfter: graphemeLength(proposed ?? current),
    utf16LengthBefore,
    stripped: removed,
  });

  if (!current) return result('empty', null);
  if (stripped && !value) return result('needs-human', null);

  const len = graphemeLength(value);
  const isStrictPrefix = value.length < title.length && title.startsWith(value);

  // Rule C: exactly 60 stored units AND a strict prefix of the title is the
  // old form's cut. A prefix of any other length may be a deliberately short
  // SEO title and is left alone.
  if (utf16LengthBefore === OLD_FORM_CUT_UNITS && isStrictPrefix) {
    return result(stripped ? 'brand-suffix+cut-prefix' : 'cut-prefix', '');
  }
  if (stripped) return result('brand-suffix', value);

  if (len >= NEEDS_HUMAN_MIN && !isStrictPrefix && looksCutMidWord(value, title, article?.excerpt)) {
    return result('needs-human', null);
  }
  return result('ok', null);
}
