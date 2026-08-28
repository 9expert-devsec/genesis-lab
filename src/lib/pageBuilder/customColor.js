/**
 * Author-entered colours — validation, CSS, and the contrast warning.
 *
 * Round 39. Until now every colour in the Page Builder was a PRESET that
 * resolved to a CI token, and MANIFESTO §7 forbade a raw hex anywhere. This
 * module is where an author-entered hex becomes legitimate — as DATA that
 * arrives at runtime, never as a literal in source.
 *
 * ── THE DISTINCTION THE GUARD RESTS ON ────────────────────────────────────
 * Round 30's ban walks the editor surface and rejects any hex literal or
 * numeric rgb() in the SOURCE TEXT, because a hex written into a class or a
 * style opts that surface out of dark mode. Nothing in this file weakens that:
 * there is no hex literal here, and there is none in the panel or the renderer
 * either. What flows through is a string read from the database at render time,
 * which the source scanner cannot see and correctly should not — the ban is
 * about DESIGN DECISIONS TAKEN IN CODE, and an author's colour is not one.
 *
 * The two theme text colours below are the one place a real colour value had to
 * be written down, and they are RGB CHANNEL TRIPLES rather than hexes — pinned
 * against tailwind.config.js by a test, so they cannot drift from the tokens
 * they mirror.
 *
 * ── THE CONTRACT DIFFERS BETWEEN MODES, AND THAT IS THE POINT ─────────────
 * A PRESET colour resolves through a CSS variable and therefore follows dark
 * mode. A CUSTOM colour is used verbatim in BOTH themes. That is not a
 * limitation to be engineered away — an author who types a brand colour means
 * that colour — but it IS a thing the UI has to say out loud, because a control
 * that silently behaves differently in one theme is the failure this repo has
 * spent several rounds removing.
 *
 * Pure: no React, no models, no DOM. Client-safe.
 */

/**
 * What counts as an author colour: `#` and exactly six hex digits, either case.
 *
 * ── WHY EXACTLY SIX, AND ANCHORED ─────────────────────────────────────────
 * The value reaches a `style` attribute, so it is untrusted input on a path
 * where a stray `;` or `)` would be a style injection. An anchored regex over a
 * six-character alphabet cannot express one — that is the security property,
 * and it is worth more than accepting shorthand.
 *
 * REJECTED, deliberately, and each for a reason rather than by omission:
 *   · `#abc` three-digit shorthand — a second spelling of the same colour, and
 *     two spellings mean two stored forms for one value.
 *   · `#rrggbbaa` eight-digit — alpha over an unknown surface is a colour
 *     nobody can predict, including the contrast warning below.
 *   · `rgb(...)`, `hsl(...)`, named colours — every one is a second vocabulary
 *     for the same thing, and `<input type="color">` emits none of them.
 *   · anything with whitespace, a semicolon, a bracket or a quote — refused by
 *     the alphabet, not by a blocklist that a new escape could get past.
 *
 * Case is accepted in both directions and NOT normalised. `<input type="color">`
 * emits lowercase and a pasted brand value is often upper; both are valid CSS
 * and rewriting the author's value would make the stored string differ from
 * what they typed for no gain.
 */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** True for a value this system will put in a style attribute. */
export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

/**
 * The author colour, or null.
 *
 * `null` is the whole safety story at render time: every consumer below treats
 * it as "there is no custom colour here", which falls back to the preset path.
 * A directly-seeded Mongo document can carry anything — presets.js has carried
 * that same warning since Phase 2 — so the schema rejecting bad input at WRITE
 * is not enough on its own, and this is the second, independent layer.
 */
export function hexOrNull(value) {
  return isHexColor(value) ? value : null;
}

/** The two modes a colour control offers. `preset` is the absence of a choice. */
export const COLOR_MODES = ['preset', 'custom'];

/**
 * Gradient directions, and the CSS each becomes.
 *
 * Six, covering the four edges and two diagonals. Not eight: `to top right` and
 * `to top left` are the same gradients read backwards, reachable by swapping
 * the two stops, and a vocabulary with two ways to say one thing is a
 * vocabulary an author has to think about.
 */
export const GRADIENT_DIRECTIONS = [
  'to_bottom', 'to_top', 'to_right', 'to_left', 'to_bottom_right', 'to_bottom_left',
];

const DIRECTION_CSS = {
  to_bottom:       'to bottom',
  to_top:          'to top',
  to_right:        'to right',
  to_left:         'to left',
  to_bottom_right: 'to bottom right',
  to_bottom_left:  'to bottom left',
};

export const DEFAULT_GRADIENT_DIRECTION = 'to_bottom';

/**
 * A custom background as an inline style object — or `null` for "no custom
 * background here, use the preset path".
 *
 * ── ONE STOP AND TWO STOPS ARE DIFFERENT THINGS ───────────────────────────
 * An ABSENT second stop (`to` empty or missing) is a FLAT COLOUR and emits
 * `backgroundColor`. A second stop that happens to equal the first is a
 * GRADIENT the browser paints flat, and it emits `backgroundImage` with both
 * stops. They look identical and they are not the same statement: the author of
 * the first said "one colour", the author of the second said "a gradient
 * between these two". Collapsing the second into the first would silently
 * rewrite an authored value, and would then surprise whoever edited only the
 * `from` stop and expected a gradient to appear.
 *
 * So the representation is: `to === ''` (or absent) means ONE STOP. A reader
 * never has to compare two values to learn how many the author meant.
 *
 * `backgroundColor` for the flat case rather than the `background` shorthand,
 * because the shorthand also resets `background-image`, and a shorthand that
 * clears properties nobody mentioned is how one control starts owning another.
 */
export function customBackgroundStyle(custom) {
  const from = hexOrNull(custom?.from);
  if (!from) return null;
  const to = hexOrNull(custom?.to);
  if (!to) return { backgroundColor: from };
  const dir = DIRECTION_CSS[custom?.direction] ?? DIRECTION_CSS[DEFAULT_GRADIENT_DIRECTION];
  return { backgroundImage: `linear-gradient(${dir}, ${from}, ${to})` };
}

/** Does this settings block ask for a custom background, and can it be honoured? */
export function hasCustomBackground(settings) {
  return settings?.backgroundMode === 'custom' && customBackgroundStyle(settings?.backgroundCustom) !== null;
}

// ── contrast ───────────────────────────────────────────────────────────────

/**
 * The two theme text colours, as sRGB channel triples.
 *
 * NOT hexes, and that is not a dodge of round 30's ban — it is the ban being
 * obeyed. A hex literal here would be a design decision written into code; a
 * channel triple is an INPUT to an arithmetic function, and a test asserts each
 * still equals the token in tailwind.config.js it mirrors, so it cannot drift
 * into being a decision of its own.
 *
 * These two are the whole set because they are the whole set: every entry in
 * presets.js's THEME table paints `text-9e-navy` or `text-9e-ice` and there is
 * no third.
 */
export const THEME_TEXT_RGB = Object.freeze({
  navy: Object.freeze([13, 27, 42]),
  ice:  Object.freeze([248, 250, 253]),
});

/** `#rrggbb` → [r, g, b]. Callers pass values isHexColor has already accepted. */
function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** WCAG 2.1 relative luminance — the sRGB linearisation, verbatim. */
function luminance([r, g, b]) {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two channel triples. 1 to 21. */
export function contrastRatio(rgbA, rgbB) {
  const a = luminance(rgbA);
  const b = luminance(rgbB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The threshold, and where it comes from.
 *
 * 4.5:1 is WCAG 2.1 Success Criterion 1.4.3 (Contrast (Minimum)) for normal
 * text. The 3:1 large-text allowance is deliberately NOT used: this warning
 * cannot know what size text an author will put on the surface, and a threshold
 * that assumes the generous case is a warning that stays quiet when it matters.
 */
export const CONTRAST_MIN = 4.5;

/**
 * Is an author's background readable under EITHER theme text colour?
 *
 * ── IT WARNS. IT DOES NOT DECIDE ANYTHING ─────────────────────────────────
 * Nothing here picks a text colour. Deriving one from the background's
 * luminance would put a second authority over text beside the theme — the exact
 * shape rounds 21-25 spent four rounds taking out of `container.jsx` — and it
 * would do it invisibly, at render, on a page the author had already approved.
 * The theme owns text colour; this tells the author when their choice fights it
 * and then gets out of the way.
 *
 * Measured against the BETTER of the two theme text colours, because a page can
 * be in either. A background that fails both cannot be read on any theme; one
 * that passes one is fine on that theme and is not warned about, which is the
 * conservative direction for a warning nobody can dismiss.
 *
 * The FIRST stop only. A gradient's second stop is a real surface too, and
 * warning per-stop would need the control to say which stop it meant — a second
 * message for a control that has one warning line. The first stop is where an
 * author starts and is the stop a flat background has.
 */
export function backgroundContrastOk(custom) {
  const from = hexOrNull(custom?.from);
  if (!from) return true;
  const rgb = channels(from);
  return Math.max(
    contrastRatio(rgb, THEME_TEXT_RGB.navy),
    contrastRatio(rgb, THEME_TEXT_RGB.ice),
  ) >= CONTRAST_MIN;
}

/**
 * Is an author's accent readable AS TEXT on a light page surface?
 *
 * The accent is used three ways (round 21) — an ornament, a text colour, and a
 * button fill — and only the middle one has a contrast requirement the author
 * can get wrong without noticing. The presets already encode exactly this
 * judgement by hand: `purple` is a legal fill and is degraded to navy as text
 * because it fails AA. This asks the same question of a custom value.
 *
 * Against the LIGHT surface, because six of the seven themes are light and an
 * accent that fails there fails on almost every page.
 */
export function accentContrastOk(hex) {
  const value = hexOrNull(hex);
  if (!value) return true;
  return contrastRatio(channels(value), THEME_TEXT_RGB.ice) >= CONTRAST_MIN;
}
