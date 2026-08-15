/**
 * The one place a meta description is built, for every surface that needs one.
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 * `articles/[slug]/page.jsx` resolved `seoDescription || excerpt || title` and
 * passed the result RAW to both `description` and `openGraph.description`.
 * `buildJsonLd.js` did the same for the JSON-LD `description`. Both chains
 * bypass the one cap that was ever justified: `seoDescription` is
 * `z.string().max(160)` because 160 is roughly what a search engine will show,
 * and the moment the value comes from the FALLBACK instead, that cap does not
 * apply. `excerpt` is capped at 2000 and `title` at 200, so either can produce
 * a meta description several times the useful length.
 *
 * PREVENTION, NOT A VISIBLE FIX. Measured read-only on 2026-08-13: 74 of 488
 * articles have an empty `seoDescription`, and NONE of those has an excerpt, so
 * no article's meta description is derived from `excerpt` today and nothing on
 * the live site changes. The path fires for the next article whose editor fills
 * the excerpt and leaves the SEO field blank — which is exactly what raising the
 * excerpt cap to 2000 makes both easier and more expensive.
 *
 * ── WHY 160 FOR THE FALLBACK TOO ───────────────────────────────────────────
 * It is the number `seoDescription` already declares, and the alternative is
 * two lengths for one sentence: the meta tag and the structured data would
 * disagree about what the page is about, and there is no reader for whom the
 * longer one is better. Google truncates around this length regardless — the
 * choice is not whether the text is cut but whether WE cut it, at a boundary we
 * pick, or a crawler does, mid-word.
 *
 * The one judgement call: `jsonLd.overrides.description` is an explicit
 * editorial value and is uncapped in the schema, so this truncates something a
 * human deliberately typed. Accepted on the same reasoning — it is the same
 * sentence going to the same consumer, and an uncapped override field is also
 * where a mis-paste lands.
 *
 * ── THE BOUNDARY RULE, AND WHAT IT ACTUALLY DOES TO THAI ───────────────────
 * Thai has no word spaces, so "cut at the last space" cannot mean in Thai what
 * it means in English. Measured against the 73 real excerpts longer than 160:
 *
 *   · Thai text here is NOT space-free. Thai uses the space as a phrase and
 *     clause separator, roughly where English uses a comma. Zero of the 73 had
 *     no space at all within the first 160 characters.
 *   · but the nearest space backwards is unevenly far: median 7 characters,
 *     p90 24, WORST 59. An unbounded "last space" rule would have returned 101
 *     characters of an available 160 on that worst case — a third of the
 *     description thrown away to avoid splitting a phrase.
 *
 * So the space is honoured only within a bounded lookback of 15% of the limit
 * (24 characters at 160). That captures 65 of the 73 cases; the other 8 take a
 * hard character cut rather than surrender a third of the text. The rule is
 * therefore honest in both scripts: in English it almost always lands on a word
 * boundary, and in Thai it lands on a phrase boundary when one is close and
 * cuts mid-phrase when one is not — which is what a Thai reader sees from any
 * truncated snippet anyway.
 *
 * ── THE PART THAT IS NOT A JUDGEMENT CALL: COMBINING MARKS ─────────────────
 * A hard cut at an arbitrary index can land BETWEEN a Thai base consonant and
 * its vowel or tone mark, which are separate codepoints (U+0E31, U+0E34–U+0E3A,
 * U+0E47–U+0E4E). The result is not a shortened word, it is a broken glyph — a
 * dangling mark rendered on a dotted circle. That is the real "mid-token" risk
 * in Thai, and it is invisible to anyone testing with English. The cut backs off
 * over any trailing combining marks before the ellipsis is added.
 */

/** Roughly what a search engine renders, and what `seoDescription` declares. */
export const META_DESCRIPTION_MAX = 160;

/**
 * How far back a space may be honoured, as a fraction of the limit. 15% ≈ 24
 * characters at 160 — the p90 of the measured give-back. Past this the space is
 * ignored and the text is cut hard; see the note above for the numbers.
 */
const LOOKBACK_RATIO = 0.15;

/** Thai vowel signs and tone marks — combining, never valid on their own. */
const THAI_COMBINING = /[ัิ-ฺ็-๎]/;

/** The character appended when text was cut. Counts toward the limit. */
const ELLIPSIS = '…';

/**
 * Collapse to a single line. A meta description lives in an attribute, so
 * newlines and runs of spaces from a paste are noise at best; NBSP is folded
 * too because it survives copy-paste from the old site and renders as a space.
 */
function normalize(value) {
  return String(value ?? '').replace(/[\s ]+/g, ' ').trim();
}

/**
 * Truncate to at most `limit` characters INCLUDING the ellipsis, preferring a
 * nearby space and never leaving a dangling Thai combining mark.
 *
 * @param {string} value
 * @param {number} [limit]
 * @returns {string}
 */
export function truncateForMeta(value, limit = META_DESCRIPTION_MAX) {
  const text = normalize(value);
  if (limit <= 0) return '';
  if (text.length <= limit) return text;

  // The ellipsis is part of the budget, not added on top of it — otherwise a
  // "160-character" description is 161 characters.
  const budget = limit - ELLIPSIS.length;
  let cut = text.slice(0, budget);

  const space = cut.lastIndexOf(' ');
  if (space !== -1 && budget - space <= Math.ceil(limit * LOOKBACK_RATIO)) {
    cut = cut.slice(0, space);
  }

  // Trailing combining marks, then trailing whitespace. In that order: dropping
  // a mark can expose a space that then also has to go.
  while (cut.length > 0 && THAI_COMBINING.test(cut[cut.length - 1])) cut = cut.slice(0, -1);
  cut = cut.replace(/[\s ]+$/, '');

  // A cut that ate everything (a single unbroken token longer than the budget,
  // or a run of marks) degrades to a hard slice rather than to an empty string
  // — a bare ellipsis as a meta description is worse than a clipped word.
  if (cut.length === 0) {
    let hard = text.slice(0, budget);
    while (hard.length > 0 && THAI_COMBINING.test(hard[hard.length - 1])) hard = hard.slice(0, -1);
    cut = hard;
  }

  return `${cut}${ELLIPSIS}`;
}

/**
 * The first non-empty candidate, normalised and truncated. Replaces the `||`
 * chains at both call sites so the fallback ORDER and the truncation cannot
 * drift apart — two implementations of "pick one, then cut it" is how the meta
 * tag and the structured data end up disagreeing.
 *
 *   toMetaDescription(article.seoDescription, article.excerpt, article.title)
 *
 * @param {...(string|null|undefined)} candidates in preference order
 * @returns {string} '' when every candidate is empty
 */
export function toMetaDescription(...candidates) {
  for (const candidate of candidates) {
    const text = normalize(candidate);
    if (text) return truncateForMeta(text);
  }
  return '';
}
