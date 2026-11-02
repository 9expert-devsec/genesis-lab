/**
 * Level score: 3 stars, −1 per hint used anywhere in the level, never below 1.
 * XP is stars × 10.
 */

export const MAX_STARS = 3;
export const XP_PER_STAR = 10;

export function starsFor(hintsUsed) {
  const used = Number.isFinite(hintsUsed) && hintsUsed > 0 ? Math.floor(hintsUsed) : 0;
  return Math.max(1, MAX_STARS - used);
}

export function xpFor(stars) {
  return stars * XP_PER_STAR;
}

/** The most stars a set of levels can give — the HUD's denominator. */
export function maxStarsFor(levels) {
  return (levels || []).length * MAX_STARS;
}
