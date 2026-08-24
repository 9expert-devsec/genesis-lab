/**
 * ROUND 75 §C — the three-way split, derived from the §B measurement rather
 * than hand-counted.
 *
 * Reads scripts/_round75-out.json (written by _measure-round75-dark.mjs) and
 * assigns every measured row on the author's page exactly ONE bucket:
 *
 *   OK        follows the mode, or is legible and not a light slab
 *   CONTRACT  a custom colour behaving as round 39 promised — used verbatim in
 *             BOTH themes, which is the documented behaviour of `กำหนดเอง`
 *   NO-DARK   a token or literal with no `.dark` counterpart (a `9e-*` Tailwind
 *             colour, or a `--9e-*` raw brand var globals.css never redeclares)
 *   TEXT-AXIS surface answers `.dark` but text does not, or vice versa
 *
 * ── WHAT COUNTS AS FAILING, STATED BEFORE THE COUNT ──────────────────────
 * Two independent tests, because the author reported two different symptoms:
 *   (a) CONTRAST  — dark-mode contrast below WCAG AA 4.5:1 for normal text.
 *   (b) SLAB      — an OPAQUE LIGHT surface (luminance >= 0.5) painted while
 *                   the site is in dark mode. Contrast can be perfect and this
 *                   still be the defect: a white page on a dark canvas is
 *                   legible and is still not dark mode.
 *   (c) SPLIT     — the element's own surface MOVES between modes while the
 *                   page shell it sits on does NOT. Contrast can pass and the
 *                   luminance can be mid, and the result is still a colour
 *                   nobody chose: `highlight_grid`'s 40%-alpha navy over a
 *                   white shell composites to #9ea4aa, a grey that appears in
 *                   no token, no preset and no author's picker. Without this
 *                   test the author's loudest symptom scores "OK".
 *
 * A row that inherits its surface from an ancestor is marked `inherited` and
 * counted in a SEPARATE column, so the bucket totals count causes and not
 * repetitions of one cause.
 *
 * Run: node scripts/_measure-round75-classify.mjs
 */
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync('scripts/_round75-out.json', 'utf8'));
const KEY = 'early-bird-claude-code:default';
if (!d.light[KEY]) { console.error('X author page missing from the measurement'); process.exit(1); }

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/**
 * The cause table. Each entry names the CODE that decides the row's surface,
 * so a bucket is an argument about a specific line and not an impression.
 */
const CAUSE = [
  { el: 'route wrapper', bucket: 'OK', why: 'bg-[#F8FAFD] dark:bg-[#0D1B2A] in the promotions route — the one element on this path that answers .dark' },
  { el: 'page shell', bucket: 'NO-DARK', why: 'THEME.pageClass = "bg-white text-9e-navy" — literal Tailwind colours; `white` and `9e-navy` have no .dark counterpart' },
  { el: 'section wrapper[0]', bucket: 'CONTRACT', why: 'settings.backgroundMode=custom, #f8e7d5→#fefaf5 — round 39: a custom colour is verbatim in BOTH themes' },
  { el: 'section wrapper[1]', bucket: 'NO-DARK', inherited: true, why: 'background=default → backgroundClass "" → inherits the page shell' },
  { el: 'section wrapper[2]', bucket: 'NO-DARK', inherited: true, why: 'background=default → inherits the page shell' },
  { el: 'section wrapper[3]', bucket: 'CONTRACT', why: 'the second custom peach gradient' },
  { el: 'nested section[0]', bucket: 'CONTRACT', inherited: true, why: 'inside the custom-background hero' },
  { el: 'nested section[1]', bucket: 'CONTRACT', inherited: true, why: 'inside the custom-background hero' },
  { el: 'nested section[2]', bucket: 'CONTRACT', inherited: true, why: 'inside the custom-background hero' },
  { el: 'nested section[3]', bucket: 'CONTRACT', inherited: true, why: 'inside the custom-background hero' },
  { el: 'heading', bucket: 'CONTRACT', inherited: true, why: 'text-9e-navy from pageClass, on the custom peach — legible, but neither half moves' },
  { el: 'body text (prose p)', bucket: 'TEXT-AXIS', why: 'rich_text PROSE carries `dark:prose-invert`: TEXT answers the SITE .dark axis while the surface under it does not move at all' },
  { el: 'link (in prose)', bucket: 'TEXT-AXIS', why: 'prose-a:text-[var(--pb-accent-text)] over prose-invert — same axis split as the paragraph' },
  { el: 'link', bucket: 'OK', why: 'the CTA anchor paints --pb-accent-fill with --pb-accent-on chosen by luminance (round 39)' },
  { el: 'card surface (shadow)', bucket: 'NO-DARK', why: 'cardStyle=shadow paints NO surface; only shadow-9e-md, whose --shadow-color does flip. The card cannot separate because there is nothing to separate' },
  { el: 'card surface (filled/ice)', bucket: 'NO-DARK', why: 'cardStyle=filled → bg-9e-ice, a literal light hex with no .dark counterpart (round 59 §A2)' },
  { el: 'highlight_grid child box', bucket: 'TEXT-AXIS', why: 'highlight_grid.jsx:50 `bg-9e-ice/50 dark:bg-[#0D1B2A]/40` — the SURFACE answers the site axis at 40% alpha, over a page shell that does not. Composites to #9ea4aa: the grey slab' },
  { el: 'muted body text (dark:text-#94a3b8)', bucket: 'TEXT-AXIS', why: '`text-9e-slate-dp-50 dark:text-[#94a3b8]` in eight components — text answers the site axis, the surface under it does not' },
  { el: 'muted text ON the grey box', bucket: 'TEXT-AXIS', why: 'both halves answer the site axis and land on nearly the same grey — 1.02:1' },
  { el: 'shadow card ON the grey box', bucket: 'NO-DARK', why: 'cardStyle=shadow paints no surface at all, so the card IS the grey box behind it' },
];

// The page shell's own behaviour is the reference for test (c).
const shellL = d.light[KEY].find((r) => r.el === 'page shell');
const shellD = d.dark[KEY].find((r) => r.el === 'page shell');
if (!shellL || !shellD) { console.error('X page shell row missing'); process.exit(1); }
const shellMoves = shellL.bg !== shellD.bg;

const rows = [];
for (const [i, L] of d.light[KEY].entries()) {
  const D = d.dark[KEY][i];
  const cause = CAUSE.find((c) => c.el === L.el);
  if (!cause) { console.error('X unclassified row: ' + L.el); process.exit(1); }
  const lowContrast = D.contrast != null && D.contrast < 4.5;
  const lightSlab = D.bg != null && lum(D.bg) >= 0.5;
  const surfaceMoves = L.bg !== D.bg;
  const split = surfaceMoves && !shellMoves && L.el !== 'route wrapper';
  rows.push({
    el: L.el,
    lightBg: L.bg, lightFg: L.fg, lightContrast: L.contrast,
    darkBg: D.bg, darkFg: D.fg, darkContrast: D.contrast,
    followsMode: L.bg !== D.bg || L.fg !== D.fg,
    failsContrast: lowContrast,
    lightSlabInDark: lightSlab,
    surfaceMovesUnderAStillShell: split,
    bucket: (lowContrast || lightSlab || split) ? cause.bucket : 'OK',
    inherited: !!cause.inherited,
    why: cause.why,
  });
}

const counts = {};
const distinct = {};
for (const r of rows) {
  counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;
  if (!r.inherited) distinct[r.bucket] = (distinct[r.bucket] ?? 0) + 1;
}

// CONTROL: a classifier that fell through to OK for everything would print a
// clean page and look like good news.
if ((counts['OK'] ?? 0) === rows.length) { console.error('X every row classified OK — the classifier is not discriminating'); process.exit(1); }

console.log(JSON.stringify({
  page: KEY,
  rowsMeasured: rows.length,
  bucketsAllRows: counts,
  bucketsDistinctCauses: distinct,
  rows,
}, null, 2));
