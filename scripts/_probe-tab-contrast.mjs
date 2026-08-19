/**
 * The measured contrast of the restyled tabs, in BOTH themes.
 *
 * Run by hand. It exists so the ratios quoted in the commit message and in
 * test/render/registrationTabColours are computed rather than asserted from
 * memory — and so the DARK-mode pair is computed at all, which is the half that
 * is easy to forget when the design is drawn in light.
 *
 * `contrastRatio` is the repo's own, from the authored-colour classifier, so
 * these numbers are produced by the same implementation the article pipeline is
 * held to rather than by a second one written here.
 *
 * Usage: node scripts/_probe-tab-contrast.mjs
 */
import { register } from 'node:module';
register(new URL('../test/loader.mjs', import.meta.url));

const { contrastRatio } = await import('@/lib/articles/normalizeAuthoredColors');

// The module exports no hex parser — `parseColor` handles authored CSS strings,
// which is a different job. Same two-liner test/pure/authoredColors uses.
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Straight from globals.css — light `:root`, then `.dark`. */
const THEMES = {
  light: {
    surfaceRaised:  '#FFFFFF', // --surface-raised  : the SELECTED tab's card
    surfaceMuted:   '#F8FAFD', // --surface-muted   : the tab GROUP behind it
    textMuted:      '#5E6A7E', // --text-muted
    textSecondary:  '#465469', // --text-secondary
  },
  dark: {
    surfaceRaised:  '#1E3A5F',
    surfaceMuted:   '#1A2D42',
    textMuted:      '#5E6A7E',
    textSecondary:  '#C5CEDA',
  },
};

/** Every candidate for the two labels, so the choice is made on numbers. */
const SELECTED_CANDIDATES = { '9e-action': '#005CFF', '9e-air': '#48B0FF', '9e-brand': '#2486FF' };
const UNSELECTED_CANDIDATES = { '--text-muted': 'textMuted', '--text-secondary': 'textSecondary' };

const r2 = (n) => Math.round(n * 100) / 100;
const AA = 4.5;
const verdict = (n) => (n >= AA ? 'PASS' : 'FAIL');

console.log('');
console.log('══ TAB CONTRAST ═══════════════════════════════════════════════════════════');
for (const [theme, t] of Object.entries(THEMES)) {
  console.log(`\n── ${theme} ──`);
  console.log(`  SELECTED label, on its raised card ${t.surfaceRaised}:`);
  for (const [name, hex] of Object.entries(SELECTED_CANDIDATES)) {
    const n = r2(contrastRatio(hexToRgb(hex), hexToRgb(t.surfaceRaised)));
    console.log(`    ${name.padEnd(10)} ${hex}  → ${String(n).padStart(5)}:1  ${verdict(n)}`);
  }
  console.log(`  UNSELECTED label, on the group ${t.surfaceMuted}:`);
  for (const [name, key] of Object.entries(UNSELECTED_CANDIDATES)) {
    const hex = t[key];
    const n = r2(contrastRatio(hexToRgb(hex), hexToRgb(t.surfaceMuted)));
    console.log(`    ${name.padEnd(18)} ${hex}  → ${String(n).padStart(5)}:1  ${verdict(n)}`);
  }
  // The card must also be distinguishable FROM the group, or "raised" is a claim
  // the eye cannot verify. This is not a text ratio and has no WCAG threshold;
  // it is reported so the number is on record rather than assumed to be enough.
  console.log(`  SEPARATION (not text): card ${t.surfaceRaised} vs group ${t.surfaceMuted}`
    + ` → ${r2(contrastRatio(hexToRgb(t.surfaceRaised), hexToRgb(t.surfaceMuted)))}:1`);
}
console.log('');
console.log('  WCAG AA for normal text is 4.5:1. The tab labels are 13px SEMIBOLD,');
console.log('  which is below the 18.66px large-text threshold, so 4.5 is the bar');
console.log('  that applies — not 3.0.');
console.log('');
