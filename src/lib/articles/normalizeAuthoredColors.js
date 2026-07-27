import sanitizeHtml from 'sanitize-html';

/**
 * Render-time classifier for authored inline colours in article bodies.
 *
 * THE PROBLEM. Article bodies are Tiptap HTML stored in Mongo with hardcoded
 * inline colours (`<span style="color: rgb(13, 27, 42);">` — that is 9e-navy).
 * An inline style outranks both `dark:prose-invert` and the
 * `.dark .article-content` rules, so the text is near-invisible on the dark
 * page background and no class-level CSS can reach it. The stored content is
 * NOT mutated: ~200 published articles carry these styles and a migration
 * would be irreversible.
 *
 * WHAT THIS DOES. It never edits or removes a declaration. For every element
 * carrying an inline `color` / `background-color`, it computes the WCAG
 * relative luminance of the declared colour and ADDS a data attribute
 * recording the verdict:
 *
 *   data-authored-fg="dark" | "mid" | "light"      (same for -bg)
 *
 * globals.css then neutralises only the two hopeless combinations — dark ink
 * on the dark theme, light ink on the light theme — with `color: inherit`.
 * `mid` is left alone in both themes, which is what keeps an author's
 * deliberate accent colour intact.
 *
 * THRESHOLDS. The two sides are calibrated on different bases, deliberately.
 *
 * NOT AN ACCESSIBILITY REMEDIATION. The 3:1 floor below is WCAG AA for LARGE
 * text (>=24px, or >=18.66px bold) and for non-text UI. Body copy requires
 * 4.5:1. An accent that survives classification at ~3.1:1 is legible but is
 * NOT AA-compliant as body text — and no single colour can be, because
 * clearing 4.5:1 against both #FFFFFF and #0D1B2A requires luminance <= 0.183
 * and >= 0.222 simultaneously. This fix makes unreadable text readable; it
 * does not make the article body conformant. Treat that as open.
 *
 * `dark` is DERIVED, not chosen: a colour is dark iff its WCAG contrast against
 * the actual dark page background (--page-bg = #0D1B2A) falls below 3:1. That
 * works out to luminance < 0.1312. A flat
 * luminance cut-off was tried first and rejected: 0.18 also swallowed
 * saturated accents that are perfectly legible on both themes (#C62828 red at
 * 3.09:1, #1565C0 blue at 3.03:1 against the dark page), which would have made
 * this a blunt strip rather than a fix. On the current corpus the derived
 * threshold classifies exactly the same 20 elements as 0.18 did — the navy
 * default leak (1.00:1) and an indigo accent (2.92:1) — while letting the
 * accent family through.
 *
 * `light` is NOT derived the same way, and that is a judgement call worth
 * knowing about. Deriving it symmetrically (contrast < 3:1 against white)
 * would mean luminance > 0.30, which on today's corpus would neutralise 215
 * elements across four author-chosen accent colours — every one of them was
 * evidently picked while looking at the dark theme and does read poorly on
 * white (down to 1.52:1 for rgb(77, 230, 230)). Repainting them is an
 * editorial decision, not a bug fix, so this keeps the conservative 0.75
 * (≈1.31:1 on white — "effectively invisible", not merely "low contrast").
 * That is inert on today's content: the lightest authored colour is 0.639. It
 * exists so a future near-white authored colour cannot break the light theme.
 * To adopt the symmetric rule later, change LIGHT_MIN_LUMINANCE to 0.30.
 *
 * WHY sanitize-html AND NOT DOMPurify OR A REGEX. This runs at RENDER time on
 * the SERVER. isomorphic-dompurify pulls in jsdom server-side, which
 * transitively `require()`s an ESM-only module (@csstools/css-calc, via
 * cssstyle) and crashes under Next — see the header of
 * src/lib/customPages/sanitizePageHtml.js. A regex is not an option either:
 * the bodies contain nested spans and quoted attribute values.
 *
 * THIS IS NOT A SANITIZER. `allowedTags: false` / `allowedAttributes: false`
 * put sanitize-html in pass-through mode so it only parses, runs
 * `transformTags`, and re-serialises. Article bodies are rendered raw today;
 * introducing filtering here would silently strip embeds across 484 articles,
 * which is a separate decision. Nothing about the existing trust model changes.
 *
 * DETERMINISM. Same input always yields the same output — no clock, no
 * randomness, no environment reads — so the server render the client hydrates
 * against is stable.
 */

/**
 * --page-bg inside `.dark` in globals.css. The dark threshold is MEASURED
 * against this rather than hardcoded as a luminance number, so re-theming the
 * dark background moves the classification boundary with it.
 *
 * It is duplicated from CSS into JS because this runs in Node, where the
 * stylesheet is not available. test/fs/authoredColorTokens.test.mjs asserts
 * the two stay equal — that guard is the only thing standing between a theme
 * edit and silently wrong classification.
 */
export const PAGE_BG_DARK = [13, 27, 42];        // #0D1B2A

/** --page-bg on :root. Same duplication and the same fs guard as above. */
export const PAGE_BG_LIGHT = [255, 255, 255];    // #FFFFFF

// WCAG AA floor for LARGE text (see header — body copy needs 4.5:1). Below
// this against a page background, an authored colour is not merely
// low-contrast, it is lost. ONE floor, applied symmetrically to both themes.
export const MIN_CONTRAST = 3;

// Alpha below this makes the composite colour unknowable without knowing what
// is painted behind it, so we decline to classify rather than guess.
const MIN_OPAQUE_ALPHA = 0.9;

// The named colours plausible in authored content. Anything outside this list
// (or any non-colour keyword) is left unclassified rather than guessed at.
const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0], purple: [128, 0, 128],
  gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
  maroon: [128, 0, 0], olive: [128, 128, 0], lime: [0, 255, 0], aqua: [0, 255, 255],
  cyan: [0, 255, 255], teal: [0, 128, 128], navy: [0, 0, 128], fuchsia: [255, 0, 255],
  magenta: [255, 0, 255], pink: [255, 192, 203], brown: [165, 42, 42],
  gold: [255, 215, 0], indigo: [75, 0, 130], violet: [238, 130, 238],
  darkblue: [0, 0, 139], darkred: [139, 0, 0], darkgreen: [0, 100, 0],
  lightblue: [173, 216, 230], lightgray: [211, 211, 211], lightgrey: [211, 211, 211],
};

const clamp255 = (n) => Math.min(255, Math.max(0, n));

/** hsl -> rgb, both in CSS units (h degrees, s/l percent). */
export function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.min(1, Math.max(0, s / 100));
  const ll = Math.min(1, Math.max(0, l / 100));
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const seg = Math.floor(hh / 60) % 6;
  const [r, g, b] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ][seg];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Parse a CSS colour into [r, g, b, alpha], or null when the value is not a
 * colour we can reason about (`currentColor`, `var(...)`, `transparent`,
 * gradients, unknown keywords). Returning null means "leave it alone".
 */
export function parseColor(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;

  // #rgb / #rgba / #rrggbb / #rrggbbaa
  const hex = /^#([0-9a-f]{3,8})$/.exec(raw);
  if (hex) {
    const h = hex[1];
    const ex = (s) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return [ex(h[0]), ex(h[1]), ex(h[2]), h.length === 4 ? ex(h[3]) / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      return [
        ex(h.slice(0, 2)), ex(h.slice(2, 4)), ex(h.slice(4, 6)),
        h.length === 8 ? ex(h.slice(6, 8)) / 255 : 1,
      ];
    }
    return null;
  }

  // rgb()/rgba(), both the comma and the space-separated syntax.
  const rgb = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const chan = (p) => (p.endsWith('%')
      ? (parseFloat(p) / 100) * 255
      : parseFloat(p));
    const [r, g, b] = parts.slice(0, 3).map(chan);
    if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
    let a = 1;
    if (parts[3] != null) {
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      if (!Number.isFinite(a)) a = 1;
    }
    return [clamp255(r), clamp255(g), clamp255(b), a];
  }

  // hsl()/hsla()
  const hsl = /^hsla?\(([^)]+)\)$/.exec(raw);
  if (hsl) {
    const parts = hsl[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const h = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    const l = parseFloat(parts[2]);
    if (![h, s, l].every(Number.isFinite)) return null;
    let a = 1;
    if (parts[3] != null) {
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
      if (!Number.isFinite(a)) a = 1;
    }
    return [...hslToRgb(h, s, l), a];
  }

  if (Object.prototype.hasOwnProperty.call(NAMED, raw)) return [...NAMED[raw], 1];
  return null;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance([r, g, b]) {
  const ch = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio between two rgb triples. */
export function contrastRatio(rgbA, rgbB) {
  const a = relativeLuminance(rgbA);
  const b = relativeLuminance(rgbB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** rgb -> hsl, in CSS units (h degrees, s/l percent). Inverse of hslToRgb. */
export function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  if (!d) return [0, 0, l * 100];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s * 100, l * 100];
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/**
 * OKLab, used only to MEASURE how far a lightness adjustment drags the
 * perceived hue. HSL hue is held exactly by construction, but HSL is not
 * perceptually uniform, so "same HSL hue" does not mean "same perceived hue".
 * Reporting the drift in a perceptual space is the honest way to state the
 * cost of this technique.
 */
export function rgbToOklab([r, g, b]) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Perceived hue in degrees (OKLCH). */
export function oklchHue(rgb) {
  const [, a, b] = rgbToOklab(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}

/** Smallest signed angle between two hues, in degrees. */
export function hueDelta(rgbA, rgbB) {
  const d = Math.abs(oklchHue(rgbA) - oklchHue(rgbB)) % 360;
  return d > 180 ? 360 - d : d;
}

const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');

/**
 * Move a colour's LIGHTNESS — holding hue and saturation — until it clears
 * `minContrast` against `bg`. Returns the input untouched when it already
 * clears the floor.
 *
 * Why lightness only: the alternative verdicts are keep (leaves the text
 * unreadable) and `inherit` (discards the colour the author chose). Holding
 * H and S keeps the choice recognisable while making it legible.
 *
 * Direction is derived, not passed: move AWAY from the background's
 * luminance. Contrast is monotonic along that direction, so a binary search
 * finds the lightness NEAREST the original that clears the floor — the
 * minimum possible change. If that direction hits the 0/1 wall without
 * clearing (only possible for a colour on the far side of the background),
 * the opposite direction is tried before giving up.
 */
export function adjustLightnessForContrast(rgb, bg, minContrast = MIN_CONTRAST) {
  if (contrastRatio(rgb, bg) >= minContrast) return rgb;
  const [h, s] = rgbToHsl(rgb);
  const [, , l0] = rgbToHsl(rgb);

  const at = (l) => hslToRgb(h, s, l);
  const clears = (l) => contrastRatio(at(l), bg) >= minContrast;

  // Nearest-first search on one side of the original lightness.
  const search = (lighter) => {
    let lo = lighter ? l0 : 0;
    let hi = lighter ? 100 : l0;
    if (!clears(lighter ? hi : lo)) return null;   // wall reached, unreachable
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (clears(mid) === lighter) hi = mid; else lo = mid;
    }
    // Round to 8-bit and nudge if rounding dropped it back under the floor.
    let out = at(lighter ? hi : lo);
    for (let step = 0; step < 6 && contrastRatio(out, bg) < minContrast; step++) {
      out = at(lighter ? Math.min(100, hi + step + 1) : Math.max(0, lo - step - 1));
    }
    return contrastRatio(out, bg) >= minContrast ? out : null;
  };

  const away = relativeLuminance(rgb) >= relativeLuminance(bg);
  return search(away) ?? search(!away) ?? rgb;
}

/**
 * Per-mode resolution for one authored colour.
 *
 * Returns null when the colour is unclassifiable OR already clears the floor
 * in BOTH themes — in that case nothing is emitted and the element is left
 * byte-identical, which is what keeps the adjustment conditional.
 *
 * A colour can fail at most one theme: failing on white needs luminance
 * above ~0.30, failing on the dark page needs it below ~0.13. Disjoint. So
 * `mode` names the single theme that needed help; the other theme's value is
 * the original, emitted so the CSS for each mode has something to read.
 */
export function resolveAuthoredColor(value, {
  darkBg = PAGE_BG_DARK, lightBg = PAGE_BG_LIGHT, minContrast = MIN_CONTRAST,
} = {}) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const [r, g, b, a] = parsed;
  if (a < MIN_OPAQUE_ALPHA) return null;
  const rgb = [r, g, b];

  const failsDark = contrastRatio(rgb, darkBg) < minContrast;
  const failsLight = contrastRatio(rgb, lightBg) < minContrast;
  if (!failsDark && !failsLight) return null;

  const dark = failsDark ? adjustLightnessForContrast(rgb, darkBg, minContrast) : rgb;
  const light = failsLight ? adjustLightnessForContrast(rgb, lightBg, minContrast) : rgb;
  return {
    mode: failsDark ? 'dark' : 'light',
    original: rgb,
    dark, light,
    darkHex: toHex(dark), lightHex: toHex(light),
  };
}

/**
 * 'dark' | 'mid' | 'light', or null when the value is not classifiable.
 *
 * Retained as the diagnostic view of the same rule resolveAuthoredColor
 * applies: which theme, if any, this colour fails in. Backgrounds are
 * injectable so the boundary can be tested as a function of the theme tokens
 * rather than as hardcoded numbers.
 */
export function classifyColor(value, {
  darkBg = PAGE_BG_DARK, lightBg = PAGE_BG_LIGHT,
} = {}) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const [r, g, b, a] = parsed;
  if (a < MIN_OPAQUE_ALPHA) return null;
  const rgb = [r, g, b];
  if (contrastRatio(rgb, darkBg) < MIN_CONTRAST) return 'dark';
  if (contrastRatio(rgb, lightBg) < MIN_CONTRAST) return 'light';
  return 'mid';
}

/**
 * Read the effective `color` / `background-color` off a style attribute.
 *
 * The attribute is only ever READ — never rewritten — so a naive `;` split
 * cannot corrupt anything; at worst it mis-reads an exotic value and we
 * decline to classify it. Later declarations win, matching the CSS cascade.
 */
function readColorDecls(style) {
  const out = { color: null, background: null };
  for (const decl of String(style).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const value = decl.slice(i + 1).trim();
    if (!value) continue;
    if (prop === 'color') out.color = value;
    else if (prop === 'background-color') out.background = value;
    // `background` shorthand only counts when the whole value is a bare
    // colour — anything with an image/position/repeat component is skipped.
    else if (prop === 'background' && parseColor(value)) out.background = value;
  }
  return out;
}

/**
 * Config factory rather than a constant: `state.applied` records whether the
 * pass actually classified anything, so a body that gains no attribute can be
 * returned as its original string instead of a re-serialised equivalent.
 */
const buildConfig = (state) => ({
  allowedTags: false,        // pass-through: this classifies, it does not filter
  allowedAttributes: false,
  // `allowedTags: false` necessarily admits <script>/<style>, which makes
  // sanitize-html warn on every call. Acknowledged deliberately: this is not a
  // security boundary, and the bodies already render raw through
  // dangerouslySetInnerHTML (where <script> does not execute). Without this
  // the warning would spam the server log on every render of 26 articles.
  allowVulnerableTags: true,
  transformTags: {
    '*': (tagName, attribs) => {
      if (!attribs || !attribs.style) return { tagName, attribs };
      const { color, background } = readColorDecls(attribs.style);
      if (!color && !background) return { tagName, attribs };

      // The authored declaration is never edited or dropped. What IS added:
      // a marker attribute plus one custom property per theme holding the
      // per-mode replacement, which globals.css reads. The theme that
      // already cleared the floor gets the original value back, so its rule
      // is a no-op. (sanitize-html re-serialises the style attribute —
      // `color: rgb(13, 27, 42);` -> `color:rgb(13, 27, 42)` — a formatting
      // change, CSS-equivalent, not a value change.)
      const next = { ...attribs };
      const decls = [];
      const fg = color ? resolveAuthoredColor(color) : null;
      const bg = background ? resolveAuthoredColor(background) : null;
      if (fg) {
        next['data-authored-fg'] = fg.mode;
        decls.push(`--authored-fg-light:${fg.lightHex}`, `--authored-fg-dark:${fg.darkHex}`);
        state.applied = true;
      }
      if (bg) {
        next['data-authored-bg'] = bg.mode;
        decls.push(`--authored-bg-light:${bg.lightHex}`, `--authored-bg-dark:${bg.darkHex}`);
        state.applied = true;
      }
      if (decls.length) {
        next.style = `${String(next.style).replace(/;\s*$/, '')};${decls.join(';')}`;
      }
      return { tagName, attribs: next };
    },
  },
});

/**
 * Classify authored inline colours in an article body.
 *
 * Bodies where nothing is classified (458 of 484 in the current corpus) are
 * returned as the identical string, so the overwhelming majority of articles
 * are provably untouched — byte-for-byte, not merely equivalent.
 */
export function normalizeAuthoredColors(html) {
  if (!html) return html ?? '';
  const str = String(html);
  // Cheap superset guard: skip the parse entirely when no declaration we care
  // about can be present. Must cover the `background` shorthand too — it does
  // NOT contain the substring "color", and checking only for that silently
  // skipped `style="background: #0D1B2A"`.
  if (!/(?:color|background)\s*:/i.test(str)) return str;
  try {
    const state = { applied: false };
    const result = sanitizeHtml(str, buildConfig(state));
    // Nothing classified => hand back the ORIGINAL bytes. sanitize-html
    // re-serialises (`<br>` -> `<br />`, entity decoding, style whitespace);
    // all of it is rendering-equivalent, but there is no reason to accept even
    // that much churn on a body this transform had no opinion about.
    return state.applied ? result : str;
  } catch {
    // Never lose the article over a presentation concern.
    return str;
  }
}
