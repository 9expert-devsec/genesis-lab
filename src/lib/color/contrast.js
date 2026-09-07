/**
 * WCAG contrast ratio between two colours.
 *
 * ── WHY THIS IS NOT A FOURTH COPY OF THE LUMINANCE MATH ─────────────────────
 * `parseHex` and `relLuminance` already exist, exported and pure, in
 * src/lib/rbac/roleColor.js — written there because a role badge has to pick a
 * readable ink for a hex that comes out of the database. That file also has a
 * `contrastRatio`, but it is module-private and takes two LUMINANCES rather
 * than two colours, so it cannot be called from outside.
 *
 * So this imports the two exported halves rather than restating them. The
 * dependency direction is admittedly odd — a generic colour helper reaching
 * into an RBAC module — but the alternative is a second implementation of the
 * sRGB linearisation, and this repo has been bitten by duplicated derivations
 * often enough that its test suite has a name for it. If roleColor's maths ever
 * moves somewhere more neutral, this import follows it; until then one copy
 * with an awkward path beats two copies with tidy ones.
 *
 * PURE: no I/O, no React, no env.
 */

import { parseHex, relLuminance } from '@/lib/rbac/roleColor';

/**
 * Contrast ratio between two colours, 1..21.
 *
 * @param {string} a hex colour, '#rgb' or '#rrggbb' ('#' optional)
 * @param {string} b hex colour
 * @returns {number} the ratio, or NaN if either colour is unparseable
 *
 * NaN rather than a throw or a 1, and the choice matters: a guard asserting
 * `ratio >= 4.5` FAILS on NaN (every comparison with NaN is false), so a typo
 * in a token name goes red instead of silently passing as "1:1 is not >= 4.5,
 * therefore red for the wrong reason" or, worse, sailing through as 21.
 */
export function contrastRatio(a, b) {
  const rgbA = parseHex(a);
  const rgbB = parseHex(b);
  if (!rgbA || !rgbB) return NaN;

  const lA = relLuminance(rgbA);
  const lB = relLuminance(rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA for normal-size text. */
export const AA_NORMAL = 4.5;

/** WCAG AA for large text (>=24px, or >=18.66px bold) and for non-text UI. */
export const AA_LARGE = 3;
