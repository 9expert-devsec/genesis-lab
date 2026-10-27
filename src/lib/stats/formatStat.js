/**
 * The one formatter for the site's headline numbers (Home strip, About strip,
 * the /admin/about preview). Pure — safe on the server, in the client bundle
 * and in tests.
 *
 * Rule, in full:
 *   · ≥ 1000   → floor to thousands + "K+"   (94000 → "94K+", 1999 → "1K+")
 *   · 100–999  → value + "+"                 (300 → "300+")
 *   · below 100 → exact                      (77 → "77", 0 → "0")
 *   · rating   → always one decimal          (5 → "5.0", 4.8 → "4.8")
 *
 * FLOORED, NEVER ROUNDED. "94K+" is a claim that the real number is at least
 * 94,000; rounding 94,600 up to "95K+" would make it false.
 *
 * The number is split into PARTS ({ target, decimals, suffix }) so the
 * count-up can animate `target` and still land on exactly the string the
 * server rendered — the suffix never changes mid-animation ("12K+" → "94K+",
 * not "57" → "340+" → "12K+").
 */

/** @returns {{ target: number, decimals: number, suffix: string }} */
export function statParts(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n >= 1000) return { target: Math.floor(n / 1000), decimals: 0, suffix: 'K+' };
  if (n >= 100) return { target: n, decimals: 0, suffix: '+' };
  return { target: n, decimals: 0, suffix: '' };
}

/** @returns {{ target: number, decimals: number, suffix: string }} */
export function ratingParts(value) {
  const r = Math.min(5, Math.max(0, Number(value) || 0));
  return { target: Math.round(r * 10) / 10, decimals: 1, suffix: '' };
}

/** Reassemble parts into the displayed string. `target` may be a mid-animation float. */
export function formatParts({ target, decimals, suffix }) {
  const head = decimals > 0 ? Number(target).toFixed(decimals) : String(Math.floor(target));
  return head + suffix;
}

export function formatStat(value) {
  return formatParts(statParts(value));
}

export function formatRating(value) {
  return formatParts(ratingParts(value));
}
