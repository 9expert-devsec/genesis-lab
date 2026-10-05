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
 *   brand-suffix — a trailing `<sep> <brand>` stripped, repeatedly.
 *   cut-prefix   — ≥55 graphemes and a STRICT prefix of `title`: it was cut
 *                  from the full title, so it is emptied and the page falls
 *                  back to `title`. A shorter title is never invented.
 *   brand-suffix+cut-prefix — both; proposed value ''.
 *   needs-human  — stripping left nothing, or ≥58 graphemes, not a prefix of
 *                  `title`, and ending in what looks like a mid-word cut.
 *   ok           — none of the above.
 *
 * LENGTHS ARE GRAPHEMES (Intl.Segmenter), not UTF-16 units: Thai combining
 * vowels and tone marks are separate code units but not separate characters,
 * so `.length` would overcount every Thai title.
 */

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** User-perceived character count. */
export function graphemeLength(value) {
  let n = 0;
  for (const _ of segmenter.segment(String(value ?? ''))) n += 1;
  return n;
}

/** `(?:a(?:b(?:c)?)?)` — matches every non-empty prefix of `word` from `min` chars. */
function prefixPattern(word, min) {
  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const chars = [...word];
  let tail = '';
  for (let i = chars.length - 1; i >= min; i -= 1) tail = `(?:${esc(chars[i])}${tail})?`;
  return chars.slice(0, min).map(esc).join('') + tail;
}

/** Separators seen in the corpus: ASCII pipe, box-drawing │, full-width ｜, dashes, colon. */
const SEPARATORS = '[|\\u2502\\uFF5C\\-\\u2013\\u2014:]';
// Brand: `9E` … `9Expert`, then optionally ` Training` or any prefix of it.
const BRAND = `${prefixPattern('9Expert', 2)}(?:\\s+${prefixPattern('Training', 1)})?`;
const BRAND_SUFFIX_RE = new RegExp(`\\s*${SEPARATORS}\\s*${BRAND}\\s*$`, 'iu');

/** Strip trailing `<sep> <brand>` until nothing more matches. */
export function stripBrandSuffix(value) {
  let s = String(value ?? '').trim();
  let stripped = false;
  for (;;) {
    const next = s.replace(BRAND_SUFFIX_RE, '').trim();
    if (next === s) break;
    s = next;
    stripped = true;
  }
  return { value: s, stripped };
}

export const CUT_PREFIX_MIN = 55;
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
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const complete = new RegExp(`${esc}(?=[\\s\\p{P}\\p{S}]|$)`, 'u');
  return !complete.test(String(title ?? '')) && !complete.test(String(excerpt ?? ''));
}

/**
 * @param {{ seoTitle?: string, title?: string, excerpt?: string }} article
 * @returns {{
 *   category: 'empty'|'brand-suffix'|'cut-prefix'|'brand-suffix+cut-prefix'|'needs-human'|'ok',
 *   current: string,
 *   proposed: string|null,   // null = no change proposed
 *   lengthBefore: number,
 *   lengthAfter: number,
 * }}
 */
export function classifySeoTitle(article) {
  const current = String(article?.seoTitle ?? '').trim();
  const title = String(article?.title ?? '').trim();
  const lengthBefore = graphemeLength(current);
  const result = (category, proposed) => ({
    category,
    current,
    proposed,
    lengthBefore,
    lengthAfter: graphemeLength(proposed ?? current),
  });

  if (!current) return result('empty', null);

  const { value, stripped } = stripBrandSuffix(current);
  if (stripped && !value) return result('needs-human', null);

  const len = graphemeLength(value);
  const isStrictPrefix = value !== title && title.startsWith(value);

  if (len >= CUT_PREFIX_MIN && isStrictPrefix) {
    return result(stripped ? 'brand-suffix+cut-prefix' : 'cut-prefix', '');
  }
  if (stripped) return result('brand-suffix', value);

  if (len >= NEEDS_HUMAN_MIN && !isStrictPrefix && looksCutMidWord(value, title, article?.excerpt)) {
    return result('needs-human', null);
  }
  return result('ok', null);
}
