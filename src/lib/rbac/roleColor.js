/**
 * Role color helpers — free-hex role colors rendered via inline `style`.
 *
 * Tailwind can't compile dynamic hex pulled from the DB, so role badges
 * use inline styles instead of utility classes. A readable text ("ink")
 * color is computed from the background hex for contrast, using the WCAG
 * relative-luminance / contrast-ratio approach.
 *
 * All functions are pure. Invalid input degrades to a neutral gray so a
 * bad DB value never throws in the render path.
 */

const DARK_INK = '#1e293b'; // slate-800 — for light backgrounds
const LIGHT_INK = '#f8fafc'; // slate-50  — for dark backgrounds
const NEUTRAL = '#6b7280'; // gray-500 fallback

/**
 * Parse a hex color into { r, g, b } (0..255). Accepts '#RGB' or
 * '#RRGGBB' (leading '#' optional). Returns null on invalid input.
 */
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '').toLowerCase();
  if (h.length === 3) {
    // Expand shorthand '#abc' → 'aabbcc'.
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (!/^[0-9a-f]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Validate + normalize any hex input to '#rrggbb' (lowercase), or null if
 * invalid. The role form and the Role model both use this to canonicalize.
 */
export function normalizeHex(input) {
  const rgb = parseHex(input);
  if (!rgb) return null;
  const to2 = (n) => n.toString(16).padStart(2, '0');
  return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
}

/** Linearize a 0..1 sRGB channel (WCAG). */
function linearize(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0..1) for an { r, g, b } color. */
export function relLuminance({ r, g, b }) {
  const R = linearize(r / 255);
  const G = linearize(g / 255);
  const B = linearize(b / 255);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio (1..21) between two relative luminances. */
function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the text color with the better contrast against `hex` — dark slate
 * ink for light backgrounds, near-white for dark ones. Falls back to dark
 * ink when the background is unparseable.
 */
export function readableInk(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return DARK_INK;
  const bg = relLuminance(rgb);
  const darkContrast = contrastRatio(bg, relLuminance(parseHex(DARK_INK)));
  const lightContrast = contrastRatio(bg, relLuminance(parseHex(LIGHT_INK)));
  return lightContrast > darkContrast ? LIGHT_INK : DARK_INK;
}

/**
 * Inline style objects for a role badge. Returns both a `solid` variant
 * (full-color background + readable ink) and a `soft` variant (low-alpha
 * tint of the same hue + the hex as text, mirroring the old
 * bg-*-100/text-*-700 pill look) so callers can choose per context.
 */
export function roleBadgeStyle(hex) {
  const norm = normalizeHex(hex) || NEUTRAL;
  const rgb = parseHex(norm);
  return {
    solid: {
      backgroundColor: norm,
      color: readableInk(norm),
    },
    soft: {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
      color: norm,
    },
  };
}

/**
 * Hex equivalents of the current ROLE_BADGE Tailwind colors, so the
 * phase-1 migration can seed the default system roles with their existing
 * look before the DB-driven colors take over.
 */
export const DEFAULT_ROLE_COLORS = {
  superadmin: '#2563eb', // blue-600-ish
  admin: '#6b7280', // gray-500
  editor: '#ca8a04', // yellow-600
  registration_admin: '#16a34a', // green-600
  it_support_admin: '#9333ea', // purple-600
};
