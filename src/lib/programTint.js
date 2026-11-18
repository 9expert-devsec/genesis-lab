/**
 * Per-program colour for the program page's copy sections
 * (components/program/ProgramCopySections).
 *
 * `programcolor` is the upstream /programs hex the hero gradient already uses.
 * It reaches the page as an INLINE value (a style or a private custom property),
 * never as a class name — Tailwind cannot see a class built at runtime.
 *
 * Accepts `#RGB` / `#RRGGBB`, with or without `#`, surrounding whitespace
 * ignored. Anything else returns null and the caller keeps its fallback look.
 * Pure; never throws.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `{ r, g, b }` (0–255) for a valid hex, else null. */
export function parseProgramHex(input) {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(HEX);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * `rgba(r, g, b, alpha)` for a valid hex, else null. `alpha` is clamped to
 * 0–1; a non-number alpha means 1.
 */
export function programTint(input, alpha = 1) {
  const rgb = parseProgramHex(input);
  if (!rgb) return null;
  const a = typeof alpha === 'number' && Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}
