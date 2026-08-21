/**
 * DARK MODE ON THE REGISTRATION DETAIL SCREENS — MEASURED, NOT REVIEWED.
 *
 *   node scripts/_probe-detail-dark-contrast.mjs
 *
 * ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *
 * Eleven rounds of size, spacing and contrast decisions were taken with the
 * design open in light. Dark has been mentioned twice in that whole time — the
 * overflow sheet's paint order, and round 4's tab labels, which DID get a proper
 * two-theme measurement (`scripts/_probe-tab-contrast.mjs`). Everything else was
 * assumed to follow from the CSS variables.
 *
 * Mostly it does. The token layer is real: `--surface`, `--text-primary`,
 * `--surface-border` and the rest all flip in `.dark`, so a component written
 * entirely in tokens is theme-correct by construction and needs no `dark:`
 * variant at all. THE RISK IS THE COMPONENTS THAT REACH PAST THE TOKENS — the
 * stock Tailwind pastels on the chips, the `9e-*` brand colours, and the one
 * token that is IDENTICAL in both themes.
 *
 * This script prints every text-on-surface pair the two detail screens actually
 * draw, in both themes, so the question "which of these fail AA in dark" is
 * answered with numbers rather than by opening the page.
 *
 * ── WHAT IT CANNOT SEE ────────────────────────────────────────────────────
 * Opacity. `bg-9e-action/10`, `border-l-9e-brand/40` and `bg-[var(--surface-
 * muted)]/40` composite against whatever is behind them, and this script
 * composites them against the surface it is told about — which is right for the
 * cases below and would be wrong for a stack of three translucent layers. Where
 * a row says COMPOSITED, the number is real but the stack is assumed.
 *
 * It also says nothing about whether dark mode LOOKS right. A ratio is a floor,
 * not a design.
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));

const { contrastRatio } = await import('@/lib/articles/normalizeAuthoredColors');

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0').toUpperCase()).join('')}`;

/** `fg` at `alpha` over `bg`. The only compositing this file does. */
const over = (fg, bg, alpha) => rgbToHex(
  hexToRgb(fg).map((c, i) => c * alpha + hexToRgb(bg)[i] * (1 - alpha)),
);

// ── The tokens, straight from src/app/globals.css ───────────────────────────

const TOKENS = {
  light: {
    pageBg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F8FAFD',
    surfaceRaised: '#FFFFFF',
    surfaceBorder: 'rgba(13,27,42,0.12)',
    textPrimary: '#0D1B2A',
    textSecondary: '#465469',
    textMuted: '#5E6A7E',
  },
  dark: {
    pageBg: '#0D1B2A',
    surface: '#132638',
    surfaceMuted: '#1A2D42',
    surfaceRaised: '#1E3A5F',
    surfaceBorder: '#1A2D42',
    textPrimary: '#F8FAFD',
    textSecondary: '#C5CEDA',
    // IDENTICAL IN BOTH THEMES. That is not a transcription slip — globals.css
    // really does declare `--text-muted: #5E6A7E` twice, and it is the single
    // biggest finding in this file.
    textMuted: '#5E6A7E',
  },
};

/** The 9e palette, from tailwind.config.js. */
const NINE_E = {
  brand: '#2486FF',
  action: '#005CFF',
  air: '#48B0FF',
  ice: '#F8FAFD',
  navy: '#0D1B2A',
  accent: '#FF4D4F',
};

/** Stock Tailwind values the screens use directly, with no dark counterpart. */
const STOCK = {
  'sky-100': '#E0F2FE', 'sky-700': '#0369A1',
  'violet-100': '#EDE9FE', 'violet-700': '#6D28D9',
  'amber-100': '#FEF3C7', 'amber-700': '#B45309', 'amber-400': '#FBBF24',
  'blue-100': '#DBEAFE', 'blue-700': '#1D4ED8', 'blue-400': '#60A5FA',
  'emerald-100': '#D1FAE5', 'emerald-700': '#047857',
  'emerald-600': '#059669', 'emerald-400': '#34D399',
  'slate-100': '#F1F5F9', 'slate-500': '#64748B', 'slate-300': '#CBD5E1',
};

/**
 * Every text-on-background pair the detail screens draw.
 *
 * `fg`/`bg` are functions of the theme so a token can differ between them; a
 * literal string is a colour that does NOT change, which is the whole point of
 * listing them side by side.
 *
 * `size` decides the bar: WCAG AA is 4.5:1 for normal text and 3.0:1 for large
 * text, where "large" is >= 18.66px bold or >= 24px regular.
 */
const PAIRS = [
  // ── round 12: the page header ─────────────────────────────────────────────
  ['H1 heading', 40, true, (t) => t.textPrimary, (t) => t.pageBg, 'token'],
  ['header subtitle', 14, false, (t) => t.textSecondary, (t) => t.pageBg, 'token'],
  ['header timestamp', 12, false, (t) => t.textMuted, (t) => t.pageBg, 'token'],
  ['back link', 13, false, (t) => t.textSecondary, (t) => t.pageBg, 'token'],

  // ── round 11: the field rows ──────────────────────────────────────────────
  ['field VALUE', 16, false, (t) => t.textPrimary, (t) => t.surface, 'token'],
  ['field LABEL', 13, false, (t) => t.textMuted, (t) => t.surface, 'token'],
  ['card heading', 14, true, (t) => t.textPrimary, (t) => t.surface, 'token'],
  ['emptyHint (italic)', 16, false, (t) => t.textMuted, (t) => t.surface, 'token'],
  ['ข้อมูลระบบ heading', 12, true, (t) => t.textSecondary, (t) => over(t.surfaceMuted, t.surface, 0.4), 'COMPOSITED /40'],
  ['ข้อมูลระบบ field label', 13, false, (t) => t.textMuted, (t) => over(t.surfaceMuted, t.surface, 0.4), 'COMPOSITED /40'],

  // ── the copy control, round 8 / 11 ────────────────────────────────────────
  ['CopyButton idle', 11, false, (t) => t.textMuted, (t) => t.surface, 'token'],
  ['CopyButton ok', 11, false, () => NINE_E.action, (t) => t.surface, 'NO DARK VARIANT'],
  ['CopyButton fail', 11, false, () => NINE_E.accent, (t) => t.surface, 'NO DARK VARIANT'],

  // ── links and actions ─────────────────────────────────────────────────────
  ['mailto / tel link', 16, false, () => NINE_E.action, (t) => t.surface, 'NO DARK VARIANT'],
  ['Omise charge link', 16, false, () => NINE_E.action, (t) => t.surface, 'NO DARK VARIANT'],
  ['ยอดสุทธิ total', 16, true, () => NINE_E.action, (t) => t.surface, 'NO DARK VARIANT'],
  ['DetailError line', 12, false, () => NINE_E.accent, (t) => t.pageBg, 'NO DARK VARIANT'],
  ['primary button label', 11, true, () => NINE_E.ice, () => NINE_E.navy, 'fixed pair'],
  ['ConsentLine tick', 12, false, () => STOCK['emerald-600'], (t) => t.surface, 'NO DARK VARIANT'],

  // ── the chips: stock pastels, passed in from the clients ──────────────────
  ['TypeBadge Public', 11, true, () => STOCK['sky-700'], () => STOCK['sky-100'], 'FIXED LIGHT PASTEL'],
  ['TypeBadge In-house', 11, true, () => STOCK['violet-700'], () => STOCK['violet-100'], 'FIXED LIGHT PASTEL'],
  ['status pending', 11, true, () => STOCK['amber-700'], () => STOCK['amber-100'], 'FIXED LIGHT PASTEL'],
  ['status confirmed', 11, true, () => STOCK['blue-700'], () => STOCK['blue-100'], 'FIXED LIGHT PASTEL'],
  ['status paid', 11, true, () => STOCK['emerald-700'], () => STOCK['emerald-100'], 'FIXED LIGHT PASTEL'],
  ['status cancelled', 11, true, () => STOCK['slate-500'], () => STOCK['slate-100'], 'FIXED LIGHT PASTEL'],

  // ── the internal-notes and quoted-note blocks ─────────────────────────────
  ['customer note body', 16, false, (t) => t.textPrimary, (t) => t.surface, 'token'],
  ['internal note body', 13, false, (t) => t.textPrimary, (t) => t.surface, 'token'],
  ['internal note byline', 11, false, (t) => t.textMuted, (t) => t.surface, 'token'],
  ['append-only warning', 11, false, (t) => t.textMuted, (t) => t.surface, 'token'],

  // ── the attendee table ────────────────────────────────────────────────────
  ['attendee name', 16, true, (t) => t.textPrimary, (t) => t.surface, 'token'],
  ['attendee email link', 16, false, () => NINE_E.action, (t) => t.surface, 'NO DARK VARIANT'],
  ['attendee dash', 16, false, (t) => t.textMuted, (t) => t.surface, 'token'],
  ['attendee # counter', 12, false, (t) => t.textMuted, (t) => t.surfaceMuted, 'token'],
  ['attendee col header', 11, false, (t) => t.textSecondary, (t) => t.surfaceMuted, 'token'],
];

const AA = (px, bold) => ((bold && px >= 18.66) || px >= 24 ? 3.0 : 4.5);

console.log('\n══ REGISTRATION DETAIL — TEXT CONTRAST, BOTH THEMES ════════════════════════\n');
console.log('  AA is 4.5:1 for normal text, 3.0:1 for large (>=18.66px bold, or >=24px).\n');
console.log('  ' + 'pair'.padEnd(24) + 'px  bar   light        dark         note');
console.log('  ' + '-'.repeat(88));

const failures = { light: [], dark: [] };
for (const [what, px, bold, fg, bg, note] of PAIRS) {
  const bar = AA(px, bold);
  const cells = ['light', 'dark'].map((theme) => {
    const t = TOKENS[theme];
    const ratio = contrastRatio(hexToRgb(fg(t)), hexToRgb(bg(t)));
    if (ratio < bar) failures[theme].push({ what, px, bar, ratio, note });
    return `${ratio.toFixed(2)}:1 ${ratio >= bar ? 'PASS' : 'FAIL'}`;
  });
  console.log(`  ${what.padEnd(24)}${String(px).padStart(2)}  ${bar.toFixed(1)}   `
    + `${cells[0].padEnd(13)}${cells[1].padEnd(13)}${note}`);
}

for (const theme of ['light', 'dark']) {
  const f = failures[theme];
  console.log(`\n── ${theme.toUpperCase()}: ${f.length} of ${PAIRS.length} below AA ──`);
  for (const { what, px, bar, ratio, note } of f) {
    console.log(`  ${ratio.toFixed(2)}:1  needs ${bar.toFixed(1)}  ${what} (${px}px)  — ${note}`);
  }
}

console.log('\n── THE TOKEN THAT DOES NOT FLIP ──');
console.log(`  --text-muted is ${TOKENS.light.textMuted} in light AND ${TOKENS.dark.textMuted} in dark.`);
console.log('  Everything set in it inherits a light-mode decision into dark unchanged.');
const mutedPairs = PAIRS.filter(([, , , fg]) => fg(TOKENS.dark) === TOKENS.dark.textMuted);
console.log(`  ${mutedPairs.length} of the pairs above are set in it: `
  + mutedPairs.map(([w]) => w).join(', '));
console.log('');
