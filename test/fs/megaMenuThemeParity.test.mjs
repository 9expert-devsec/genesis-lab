import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The mega menu panel must render in BOTH themes.
 *
 * THE BUG THIS EXISTS FOR: the panel's first column carried
 * `bg-9e-air-scale-950` (#F6FBFF) and its rows `hover:bg-white` — light-mode
 * literals with no `dark:` counterpart. In the dark theme that column rendered
 * as a white slab with pale text beside four correctly-dark siblings:
 * `--text-secondary` (#C5CEDA) on #F6FBFF measures 1.53:1. The hover was the
 * same bug in a state nobody looks at until they move a mouse.
 *
 * SO THE GUARD PINS THE SHAPE, NOT THE CLASS. Asserting "no
 * bg-9e-air-scale-950" would let the next hardcoded tint straight through. It
 * scans every class string in the panel for a colour drawn from a fixed
 * light-mode palette and demands a `dark:` counterpart for the same property.
 *
 * WHAT IT CANNOT SEE — and it is most of what "renders correctly" means:
 *   · rendered colour. It reads class strings; it has no DOM, no CSS cascade
 *     and no theme. Whether `--surface-muted` is actually dark in `.dark` is a
 *     fact about globals.css that this file never opens.
 *   · CONTRAST. Nothing here computes a ratio. The measured ones are in the
 *     round's report; a token swap that keeps the shape legal and tanks the
 *     contrast passes this guard.
 *   · anything reached through `cn()` from a variable, a config array, or a
 *     prop — only literals in this file are visible.
 *   · the OTHER themes' surfaces: it checks that a dark counterpart EXISTS,
 *     not that it is the right one.
 */

const HEADER = readSource('src/components/layout/PublicHeaderClient.jsx');

/**
 * The mega panel's source, from its outermost surface to the end of the
 * component. THROWS when either anchor is missing rather than returning '' —
 * an empty string would make every "does not contain" assertion below pass on
 * a file this guard can no longer find.
 */
function panelSource(code) {
  const start = code.indexOf("'max-h-[350px] max-w-[1200px] mx-auto");
  const end = code.indexOf('function Col4Card', start);
  if (start < 0 || end < 0) {
    throw new Error(
      '[mega-theme] could not locate the mega panel in PublicHeaderClient.jsx ' +
      `(start=${start}, end=${end}). It was renamed or restructured and this ` +
      'guard is now BLIND to it. Re-anchor it; do not let it degrade into an ' +
      'empty string that every negative assertion would pass on.'
    );
  }
  return code.slice(start, end);
}

// `.code`, NOT `.raw`: the fix left comments that QUOTE the old classes
// ("it was `bg-9e-air-scale-950`…"). Read raw, this guard would fail on a
// perfectly correct file — the inverse of the usual defect, and the reason
// test/sourceScan exists.
const PANEL = panelSource(HEADER.code);

/**
 * Colour families that are FIXED light-mode values: they name a literal, not a
 * theme token, so they render identically in both themes.
 */
const LIGHT_ONLY = String.raw`white|black|9e-air-scale-\d+|9e-signature-\d+|9e-slate-lt-\d+|9e-lime-scale-\d+|9e-action-scale-\d+|(?:gray|slate|zinc|neutral|stone)-\d+`;

/** Every offending utility in one class string, with no `dark:` counterpart. */
function lightOnlyOffenders(classString) {
  const out = [];
  const re = new RegExp(String.raw`(^|\s)((?:hover:|focus:|focus-visible:|group-hover:|active:)?)(bg|text|border|ring|from|to|via)-(${LIGHT_ONLY})(/\d+)?(?=\s|$)`, 'g');
  for (const m of classString.matchAll(re)) {
    const [, , variant, prop] = m;
    const token = m[0].trim();
    // A dark counterpart for the SAME property and variant makes it legal:
    // `bg-white dark:bg-9e-navy` is a correct pair, not a defect.
    const darkCounterpart = new RegExp(String.raw`(^|\s)dark:${variant}${prop}-`);
    if (!darkCounterpart.test(classString)) out.push(token);
  }
  return out;
}

/** Every string literal in the panel that looks like a class list. */
function classStrings(src) {
  return [...src.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((s) => /(^|\s)(flex|grid|bg-|text-|border-|hover:|px-|py-|rounded|min-h-|max-h-)/.test(s));
}

test('the panel has no light-only colour without a dark counterpart', () => {
  const found = [];
  for (const s of classStrings(PANEL)) {
    for (const tok of lightOnlyOffenders(s)) found.push({ tok, in: s.slice(0, 70) });
  }
  assert.deepEqual(
    found,
    [],
    'a fixed light-mode colour with no dark: counterpart is back in the mega panel:\n' +
    found.map((f) => `    ${f.tok}  ←  "${f.in}…"`).join('\n')
  );
});

test('the first column and its rows use theme tokens', () => {
  // The positive half. Without it, the assertion above is satisfied by the
  // colours being deleted outright.
  assert.match(
    PANEL,
    /border-r border-\[var\(--surface-border\)\][^"]*bg-\[var\(--surface-muted\)\]/,
    'the first column no longer paints itself with a theme token'
  );
  assert.match(
    PANEL,
    /bg-\[var\(--page-bg\)\] font-medium text-9e-action dark:text-9e-brand/,
    'the ACTIVE row lost its themed chip or its accent pair'
  );
  assert.match(
    PANEL,
    /hover:bg-\[var\(--page-bg\)\] hover:text-9e-action dark:hover:text-9e-air/,
    'the row HOVER lost its themed chip or its accent pair'
  );
});

test('the first column is consistent with its siblings, not a third treatment', () => {
  // Every column paints from the same token vocabulary. This is what the fix
  // was asked to achieve, so it is asserted rather than assumed.
  const tokens = [...PANEL.matchAll(/(?:bg|text|border)-\[var\((--[a-z-]+)\)\]/g)].map((m) => m[1]);
  const allowed = new Set([
    '--surface', '--surface-muted', '--surface-border', '--page-bg',
    '--text-primary', '--text-secondary', '--text-muted',
  ]);
  const strays = [...new Set(tokens)].filter((t) => !allowed.has(t));
  assert.deepEqual(strays, [], `the panel introduced a token outside the shared set: ${strays}`);
  assert.ok(tokens.length >= 15, `only ${tokens.length} themed tokens found — did the scan run?`);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the detector fires on the exact bug that shipped', () => {
  // The two real class strings from before the fix.
  assert.deepEqual(
    lightOnlyOffenders('min-h-0 overflow-y-auto border-r pl-4 py-3 pr-2 bg-9e-air-scale-950'),
    ['bg-9e-air-scale-950']
  );
  assert.deepEqual(
    lightOnlyOffenders('border-l-2 border-transparent text-[var(--text-secondary)] hover:bg-white hover:text-9e-action dark:hover:text-9e-air'),
    ['hover:bg-white']
  );
  // …and on shapes that have NOT shipped yet, which is the point of a shape
  // guard: a focus state, a gradient stop, a ring.
  assert.deepEqual(lightOnlyOffenders('focus:bg-slate-100'), ['focus:bg-slate-100']);
  assert.deepEqual(lightOnlyOffenders('ring-gray-200'), ['ring-gray-200']);
  assert.deepEqual(lightOnlyOffenders('from-white to-slate-50'), ['from-white', 'to-slate-50']);
});

test('CONTROL: the detector does NOT fire on a correct pair or a token', () => {
  // Otherwise "no offenders" would just mean the detector flags nothing.
  assert.deepEqual(lightOnlyOffenders('bg-white dark:bg-9e-navy transition-colors'), []);
  assert.deepEqual(lightOnlyOffenders('hover:bg-white dark:hover:bg-9e-card'), []);
  assert.deepEqual(lightOnlyOffenders('bg-[var(--surface-muted)] text-[var(--text-primary)]'), []);
  assert.deepEqual(lightOnlyOffenders('text-9e-action dark:text-9e-brand'), []);
  assert.deepEqual(lightOnlyOffenders('border-transparent bg-transparent'), []);
});

test('CONTROL: the panel extractor reads the panel, and throws when it cannot', () => {
  assert.ok(PANEL.length > 3000, `the panel slice is only ${PANEL.length} chars — wrong anchors?`);
  assert.ok(PANEL.includes('COL1_ITEMS'), 'the slice does not contain the first column');
  assert.ok(!PANEL.includes('MobileDrawer'), 'the slice ran past the panel into the drawer');
  assert.throws(
    () => panelSource('const nothing = 1;'),
    /could not locate the mega panel/,
    'a missing anchor must throw by name, not yield an empty string'
  );
});

test('CONTROL: the class-string collector finds real class lists only', () => {
  const strings = classStrings(PANEL);
  assert.ok(strings.length >= 20, `only ${strings.length} class strings collected`);
  assert.ok(
    strings.some((s) => s.includes('bg-[var(--surface-muted)]')),
    'the first column class string was not collected'
  );
  // A prose string or an href is not a class list.
  assert.deepEqual(classStrings(`const a = 'https://example.com/x'; const b = 'PROGRAMS';`), []);
});
