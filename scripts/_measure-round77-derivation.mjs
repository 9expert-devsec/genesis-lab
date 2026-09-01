/**
 * ROUND 77 §C — candidate algorithms for "a dark-toned equivalent of the
 * colour the author typed", worked on the REAL stored colours and scored.
 *
 * The six hexes below are every distinct author-entered colour in the corpus,
 * read out of `scripts/_audit-round77-custom-colours.mjs`'s run rather than
 * invented. Round 77's brief names `#ffcb5c → #fff8e0`; that pair is NOT in
 * the corpus (the audit says so explicitly), so it is carried here as a
 * clearly-labelled hypothetical rather than quietly treated as data.
 *
 * ── WHY OKLab AND NOT HSL ────────────────────────────────────────────────
 * HSL "lightness" is not lightness: #0000FF and #FFFF00 are both L=50% and one
 * is nearly black to the eye while the other is nearly white. Any rule phrased
 * as "invert the lightness" therefore has to name a perceptual space or it is
 * not a rule at all. OKLab is used because it is the space CSS Color 4 adopted
 * for exactly this, and because its L is close enough to uniform that
 * "keep the hue and chroma, move L" means what it sounds like.
 *
 * ── WHAT IS SCORED ───────────────────────────────────────────────────────
 * A pretty colour nobody can read on is not a candidate. So each result is
 * scored on:
 *   · contrast against `--text-primary` in dark mode (#F8FAFD) — the text the
 *     theme will actually put on it, WCAG AA 4.5:1 for normal text;
 *   · GAMUT CLIPPING — whether the OKLab result fell outside sRGB and had to
 *     be clamped, which silently shifts hue and is the standard failure of a
 *     naive implementation;
 *   · HUE DRIFT in degrees, so a "keeps the hue" claim is a number;
 *   · for the two-stop gradients, the OKLab ΔE between the derived stops, so
 *     "the stops stay distinguishable" is measured rather than asserted.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * The arithmetic is verified against a real browser, not trusted: every
 * derived colour is painted as a swatch in a `.dark` document with
 * `color: var(--text-primary)`, and Chrome's own computed values are read back
 * and compared to the Node figures. A mismatch on ANY swatch is a hard
 * failure — that is what stops this file from being a plausible-looking model
 * of a browser rather than a measurement of one. jsdom cannot do this job:
 * it compiles no Tailwind and returns "" for every computed style.
 *
 * Nothing is written into public/. The document is injected into the
 * about:blank tab openPage already provides.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round77-derivation.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
function die(m) { console.error('X ' + m); process.exit(1); }

// ── tokens, read from globals.css rather than transcribed ─────────────────
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
function blockFor(sel) {
  const start = CSS.indexOf(sel + ' {');
  if (start < 0) die('no ' + sel + ' block');
  let d = 0;
  for (let i = start; i < CSS.length; i += 1) {
    if (CSS[i] === '{') d += 1;
    else if (CSS[i] === '}') { d -= 1; if (d === 0) return CSS.slice(start, i + 1); }
  }
  return die('unterminated ' + sel);
}
function decls(b) {
  const m = new Map();
  for (const x of b.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) m.set(x[1], x[2].trim());
  return m;
}
const LIGHT = decls(blockFor(':root'));
const DARK = decls(blockFor('.dark'));
const PAGE_BG_LIGHT = LIGHT.get('--page-bg');
const PAGE_BG_DARK = DARK.get('--page-bg');
const TEXT_DARK = DARK.get('--text-primary');
if (!PAGE_BG_LIGHT || !PAGE_BG_DARK || !TEXT_DARK) die('a required token is missing from globals.css');

// ── colour maths ──────────────────────────────────────────────────────────
const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hex = ([r, g, b]) => '#' + [r, g, b]
  .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function rgbToOklab([R, G, B]) {
  const r = toLin(R); const g = toLin(G); const b = toLin(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}
function oklabToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return [
    toGam(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
const oklabToLch = ([L, a, b]) => [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
const lchToOklab = ([L, C, h]) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
const inGamut = ([r, g, b]) => [r, g, b].every((c) => c >= -0.0005 && c <= 1.0005);

/** Reduce chroma until the colour fits sRGB — the standard CSS Color 4 map. */
function gamutMap([L, C, h]) {
  if (inGamut(oklabToRgb(lchToOklab([L, C, h])))) return { lch: [L, C, h], clipped: false };
  let lo = 0; let hi = C;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToRgb(lchToOklab([L, mid, h])))) lo = mid; else hi = mid;
  }
  return { lch: [L, lo, h], clipped: true, chromaLost: +(C - lo).toFixed(4) };
}

const lum = ([R, G, B]) => 0.2126 * toLin(R) + 0.7152 * toLin(G) + 0.0722 * toLin(B);
function contrast(hexA, hexB) {
  const a = lum(srgb(hexA)); const b = lum(srgb(hexB));
  const hi = Math.max(a, b); const lo = Math.min(a, b);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
const deltaE = (h1, h2) => {
  const [L1, a1, b1] = rgbToOklab(srgb(h1)); const [L2, a2, b2] = rgbToOklab(srgb(h2));
  return +(Math.hypot(L1 - L2, a1 - a2, b1 - b2)).toFixed(4);
};

const L_PAGE_LIGHT = rgbToOklab(srgb(PAGE_BG_LIGHT))[0];
const L_PAGE_DARK = rgbToOklab(srgb(PAGE_BG_DARK))[0];

// ── the candidates ────────────────────────────────────────────────────────
const ALGORITHMS = {
  /** L' = 1 - L. The literal reading of "invert lightness". */
  'oklch-invert': ([L, C, h]) => [1 - L, C, h],

  /**
   * Keep the colour's DISTANCE FROM THE PAGE, not its absolute lightness.
   * d = how far below white the colour sits in light mode; the result sits the
   * same fraction of the available headroom above the dark page background.
   * This is the one that answers "a near-white panel should become a
   * near-dark panel", which is what the hero actually is.
   */
  'oklch-anchored': ([L, C, h]) => {
    const d = (L_PAGE_LIGHT - L) / L_PAGE_LIGHT;      // 0 = the page itself
    return [L_PAGE_DARK + d * (1 - L_PAGE_DARK), C, h];
  },

  /** L *= 0.25 — "darken by a fixed factor", the cheapest thing that could work. */
  'darken-fixed-0.25': ([L, C, h]) => [L * 0.25, C, h],

  /**
   * Nearest step of the `9e-slate-dp` scale by OKLab L. Included because the
   * brief names it, and because what it does to a saturated colour is the
   * argument against it — the scale is neutral grey, so C collapses to ~0.
   */
  'slate-dp-nearest': ([L], _, SLATE) => {
    let best = SLATE[0];
    for (const s of SLATE) if (Math.abs(s.L - L) < Math.abs(best.L - L)) best = s;
    return [best.L, best.C, best.h];
  },

  /**
   * Preserve the WCAG contrast the colour had against the LIGHT page, but
   * against the DARK page. Solves for L numerically. Phrased in the units the
   * accessibility rules are written in rather than in perceptual ones.
   */
  'wcag-preserved': ([L, C, h], hexIn) => {
    const target = contrast(hexIn, PAGE_BG_LIGHT);
    let lo = 0; let hi = 1; let bestL = L;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      const got = contrast(hex(oklabToRgb(lchToOklab(gamutMap([mid, C, h]).lch))), PAGE_BG_DARK);
      bestL = mid;
      if (got < target) lo = mid; else hi = mid;
    }
    return [bestL, C, h];
  },
};

/**
 * ── THE SIXTH CANDIDATE, AND IT IS ALREADY SHIPPED ───────────────────────
 * `adjustLightnessForContrast` in src/lib/articles/normalizeAuthoredColors.js
 * is in production on ~200 article bodies. It is not one of the four shapes the
 * brief listed and it is better than all of them, because it is the only one
 * that is a NO-OP when the author's colour already works: it moves lightness
 * nearest-first only until a stated contrast floor is cleared, keeping hue and
 * saturation, and returns the input unchanged when the floor is already met.
 *
 * It is imported rather than reimplemented. A second copy of a derivation rule
 * is the drift risk this repo keeps removing, and a copy that disagreed with
 * the shipped one would make every number below a fiction.
 *
 * Two variants, because a background and an accent have DIFFERENT requirements:
 *   ...vs-text  the surface must carry `--text-primary` — what a custom
 *               BACKGROUND needs.
 *   ...vs-page  the colour must be visible ON the dark page — what a custom
 *               ACCENT needs, since round 21 established it is used as a fill,
 *               as a text colour and as a button background.
 */
const { adjustLightnessForContrast } = await import('@/lib/articles/normalizeAuthoredColors');
const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fromChan = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
ALGORITHMS['shipped-floor-vs-text'] = (_lch, hexIn) =>
  oklabToLch(rgbToOklab(srgb(fromChan(adjustLightnessForContrast(chan(hexIn), chan(TEXT_DARK), 4.5)))));
ALGORITHMS['shipped-floor-vs-page'] = (_lch, hexIn) =>
  oklabToLch(rgbToOklab(srgb(fromChan(adjustLightnessForContrast(chan(hexIn), chan(PAGE_BG_DARK), 4.5)))));

// The slate-dp ramp, from tailwind.config.js — read, not retyped.
const TW = (await import('node:module')).createRequire(path.join(ROOT, 'noop.js'))(path.join(ROOT, 'tailwind.config.js'));
const SLATE = Object.values(TW.theme.extend.colors['9e-slate-dp'])
  .map((h) => { const [L, C, hh] = oklabToLch(rgbToOklab(srgb(h))); return { hex: h, L, C, h: hh }; });

// ── the inputs ────────────────────────────────────────────────────────────
const CORPUS = [
  ['#f8e7d5', 'hero stop 1 (near-white warm) — early-bird-claude-code'],
  ['#fefaf5', 'hero stop 2 (near-white) — early-bird-claude-code'],
  ['#65819f', 'cta stop 1 (mid desaturated blue) — expo002'],
  ['#4394ea', 'cta stop 2 (saturated blue) — expo002'],
  ['#c88614', 'custom accent (saturated amber) — expo002'],
  ['#0f5c00', 'custom accent (near-black saturated green) — expo002'],
];
const HYPOTHETICAL = [
  ['#ffcb5c', 'NOT IN CORPUS — named by the round 77 brief'],
  ['#fff8e0', 'NOT IN CORPUS — named by the round 77 brief'],
];
const GRADIENTS = [
  ['#f8e7d5', '#fefaf5', 'the hero — two near-whites, ΔE 0.0362 apart in light'],
  ['#65819f', '#4394ea', 'the expo002 cta'],
  ['#ffcb5c', '#fff8e0', 'the brief\'s hypothetical pair'],
];

function derive(name, hexIn) {
  const lch = oklabToLch(rgbToOklab(srgb(hexIn)));
  const out = ALGORITHMS[name](lch, hexIn, SLATE);
  const mapped = gamutMap(out);
  const result = hex(oklabToRgb(lchToOklab(mapped.lch)));
  const after = oklabToLch(rgbToOklab(srgb(result)));
  return {
    hex: result,
    L: +lch[0].toFixed(3), Lafter: +after[0].toFixed(3),
    C: +lch[1].toFixed(3), Cafter: +after[1].toFixed(3),
    hueDriftDeg: +Math.abs(((after[2] - lch[2] + 540) % 360) - 180).toFixed(1),
    gamutClipped: mapped.clipped,
    contrastVsTextPrimaryDark: contrast(result, TEXT_DARK),
    contrastVsPageBgDark: contrast(result, PAGE_BG_DARK),
  };
}

const names = Object.keys(ALGORITHMS);
const report = {
  tokensUsed: { pageBgLight: PAGE_BG_LIGHT, pageBgDark: PAGE_BG_DARK, textPrimaryDark: TEXT_DARK },
  swatches: {}, gradients: {},
};

for (const [h, label] of [...CORPUS, ...HYPOTHETICAL]) {
  const row = { label, inputContrastVsTextPrimaryDark: contrast(h, TEXT_DARK) };
  for (const n of names) row[n] = derive(n, h);
  report.swatches[h] = row;
}
for (const [a, b, label] of GRADIENTS) {
  const row = { label, inputDeltaE: deltaE(a, b) };
  for (const n of names) {
    const da = derive(n, a); const db = derive(n, b);
    row[n] = { from: da.hex, to: db.hex, deltaE: deltaE(da.hex, db.hex), stopsStillDistinct: deltaE(da.hex, db.hex) >= 0.01 };
  }
  report.gradients[`${a} → ${b}`] = row;
}

// ── BROWSER VERIFICATION — the control ────────────────────────────────────
const allDerived = [];
for (const [h, row] of Object.entries(report.swatches)) {
  for (const n of names) allDerived.push({ id: `${h.slice(1)}-${n.replace(/[^a-z0-9]/gi, '')}`, hex: row[n].hex, node: row[n].contrastVsTextPrimaryDark });
}
const body = allDerived
  .map((s) => `<div data-sw="${s.id}" style="background:${s.hex};color:var(--text-primary)">Aa</div>`)
  .join('\n');
const doc = [
  '<!doctype html><html class="dark"><head><meta charset="utf-8"><style>',
  ':root{--text-primary:' + LIGHT.get('--text-primary') + '}',
  '.dark{--text-primary:' + TEXT_DARK + '}',
  '</style></head><body>', body, '</body></html>',
].join('\n');

const { browser, close } = await launch();
let readback;
try {
  const page = await openPage(browser, { width: 400, height: 400 });
  try {
    await page.eval((h) => { document.open(); document.write(h); document.close(); }, doc);
    readback = await page.eval(() => {
      const px = (c) => String(c).match(/[\d.]+/g).map(Number);
      const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
      const lm = ([r, g, b]) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      const out = {};
      for (const el of document.querySelectorAll('[data-sw]')) {
        const cs = getComputedStyle(el);
        const a = lm(px(cs.backgroundColor)); const b = lm(px(cs.color));
        const hi = Math.max(a, b); const lo = Math.min(a, b);
        out[el.dataset.sw] = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      }
      return out;
    });
  } finally { await page.close().catch(() => {}); }
} finally { await close().catch(() => {}); }

const mismatches = [];
for (const s of allDerived) {
  const got = readback[s.id];
  if (got === undefined) { mismatches.push(`${s.id}: swatch never rendered`); continue; }
  if (Math.abs(got - s.node) > 0.02) mismatches.push(`${s.id}: node ${s.node} vs chrome ${got}`);
}
if (Object.keys(readback).length !== allDerived.length) {
  die(`browser rendered ${Object.keys(readback).length} of ${allDerived.length} swatches — the control did not run`);
}
if (mismatches.length) die('Node arithmetic disagrees with Chrome on ' + mismatches.length + ' swatches:\n  ' + mismatches.join('\n  '));

report.control = {
  swatchesVerifiedInChrome: allDerived.length,
  maxAbsDifferenceFromNode: Math.max(...allDerived.map((s) => Math.abs(readback[s.id] - s.node))),
};

console.log(JSON.stringify(report, null, 2));
