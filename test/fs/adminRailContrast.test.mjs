import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrastRatio, AA_NORMAL, AA_LARGE } from '@/lib/color/contrast';
import { readSource } from '../sourceScan.mjs';

/**
 * Every text/background pair inside the admin rail clears WCAG AA.
 *
 * ══ THE VALUES COME FROM THE DECLARATIONS, NOT FROM A COPY ══════════════════
 * This file parses `--admin-rail-*` out of src/app/globals.css and measures
 * THOSE. It carries no palette of its own, deliberately: a contrast test with
 * a hardcoded copy of the colours passes forever after somebody changes the
 * colours, which is precisely the moment it was written to speak up. The only
 * hex literals below are the two in the CONTROL at the bottom, which exist to
 * prove the measurement can fail.
 *
 * ── WHY fs AND NOT pure ─────────────────────────────────────────────────────
 * Reading globals.css is filesystem work. The arithmetic is pure and is pinned
 * separately in test/pure/contrast — a table built on a broken ratio function
 * would report eight comfortable passes and mean nothing.
 *
 * ── WHAT THIS CANNOT SEE, said plainly ──────────────────────────────────────
 * It measures declared token values. It does not know which token a component
 * actually applies to which element — test/render/adminRailPalette does that —
 * and it cannot account for anti-aliasing, subpixel rendering, or how 11px Thai
 * glyphs at these ratios actually read on a physical screen. Those are named as
 * unverified in the round report.
 */

const CSS_REL = 'src/app/globals.css';
const CSS = readSource(CSS_REL).raw;

/** The `:root` block — the only place --admin-rail-* may be declared. */
function rootBlock(css) {
  const start = css.indexOf(':root {');
  assert.notEqual(start, -1, `no :root block in ${CSS_REL}`);
  const end = css.indexOf('\n}', start);
  assert.notEqual(end, -1, ':root block is unterminated');
  return css.slice(start, end);
}

/** Every `--admin-rail-*: #hex;` declaration, as a name → hex map. */
function railTokens(block) {
  const out = {};
  for (const m of block.matchAll(/--(admin-rail-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const TOKENS = railTokens(rootBlock(CSS));
const v = (name) => TOKENS[name];

// ── the extraction is asserted BEFORE anything is concluded from it ─────────
test('rail tokens: the parse found the whole set', () => {
  // A regex that silently matched nothing would leave TOKENS empty, every
  // lookup would be undefined, every ratio NaN — and NaN fails a `>=`, so this
  // would go red anyway. It is asserted first regardless, because "12 pairs are
  // all NaN" is a much harder red to read than "the parse found 0 tokens".
  const expected = [
    'admin-rail-surface', 'admin-rail-divider', 'admin-rail-hover',
    'admin-rail-brand', 'admin-rail-item', 'admin-rail-group',
    'admin-rail-active-bg', 'admin-rail-active-fg', 'admin-rail-focus',
    'admin-rail-card', 'admin-rail-card-hover', 'admin-rail-card-fg',
    'admin-rail-card-muted',
  ];
  assert.deepEqual(Object.keys(TOKENS).sort(), [...expected].sort());
});

// ── C3: every text pair, >= 4.5:1 ───────────────────────────────────────────
//
// [label, foreground token, background token]. The list is the one the round
// brief names, in its order, so a reader can check it off against the spec.
const TEXT_PAIRS = [
  ['brand wordmark',   'admin-rail-brand',      'admin-rail-surface'],
  ['active label',     'admin-rail-active-fg',  'admin-rail-active-bg'],
  ['inactive label',   'admin-rail-item',       'admin-rail-surface'],
  ['group header',     'admin-rail-group',      'admin-rail-surface'],
  ['user name',        'admin-rail-card-fg',    'admin-rail-card'],
  ['user email',       'admin-rail-card-muted', 'admin-rail-card'],
  // The card lifts to its own hover colour, so both of its text pairs have a
  // second ground to clear — the same "the ratio checked is not the ratio
  // rendered" trap the nav rows have.
  ['user name, card hovered',  'admin-rail-card-fg',    'admin-rail-card-hover'],
  ['user email, card hovered', 'admin-rail-card-muted', 'admin-rail-card-hover'],
  // The theme toggle row is a rail row like any other and takes the item colour;
  // it is listed separately because the brief lists it separately.
  ['theme toggle label', 'admin-rail-item',     'admin-rail-surface'],
];

for (const [label, fg, bg] of TEXT_PAIRS) {
  test(`rail contrast: ${label} clears AA (4.5:1)`, () => {
    const ratio = contrastRatio(v(fg), v(bg));
    assert.ok(
      ratio >= AA_NORMAL,
      `${label}: --${fg} (${v(fg)}) on --${bg} (${v(bg)}) measures `
      + `${Number.isNaN(ratio) ? 'NaN' : ratio.toFixed(2)}:1, below the 4.5 floor`,
    );
  });
}

/**
 * The pair nobody lists and everybody forgets: a label keeps its colour on
 * hover but the GROUND BENEATH IT CHANGES, so the ratio that was checked is not
 * the ratio that renders.
 *
 * MEASURED, and it changed the design rather than the assertion. The group
 * header at --admin-rail-group (#8E97A5) on the hover fill (#1E3A5F) is
 * 3.90:1 — below AA. So the group header DOES NOT TAKE THE HOVER FILL: it
 * brightens its text to --admin-rail-brand instead and the ground stays the
 * rail. Only rows whose label is --admin-rail-item get the fill, and that pair
 * is checked below. test/render/adminRailPalette asserts the component actually
 * splits them that way, because this file cannot see which element gets which
 * class.
 */
const ON_HOVER_FILL = [
  ['inactive nav label', 'admin-rail-item'],
  // The brightened state of any row that lifts — the hover end of the transition.
  ['hovered row label', 'admin-rail-brand'],
];

for (const [label, fg] of ON_HOVER_FILL) {
  test(`rail contrast: ${label} clears AA on the hover fill`, () => {
    const ratio = contrastRatio(v(fg), v('admin-rail-hover'));
    assert.ok(ratio >= AA_NORMAL,
      `${label}: --${fg} (${v(fg)}) on --admin-rail-hover (${v('admin-rail-hover')}) `
      + `measures ${ratio.toFixed(2)}:1`);
  });
}

test('rail contrast: the group header colour is NOT safe on the hover fill', () => {
  // Stated as a fact rather than left implicit, because it is the reason the
  // group header is styled differently from every other row. If a future change
  // makes this pass, the split can be simplified — and this test says so
  // instead of quietly continuing to demand it.
  const ratio = contrastRatio(v('admin-rail-group'), v('admin-rail-hover'));
  assert.ok(ratio < AA_NORMAL,
    `--admin-rail-group on the hover fill now measures ${ratio.toFixed(2)}:1. It used `
    + 'to be 3.90, which is why the group header brightens its text instead of '
    + 'taking the fill. If this is genuinely >= 4.5 now, the split in GroupHeader '
    + 'can be revisited');
});

// ── non-text: the focus ring has to be SEEN ─────────────────────────────────
test('rail contrast: the focus ring clears the 3:1 non-text floor on the rail', () => {
  // WCAG 2.1 1.4.11. A2 and B5 both depend on a visible focus ring, and the
  // ring colour used everywhere else in the admin is tuned for a white
  // background — this is the assertion that says it was re-picked for the dark
  // one rather than inherited.
  const ratio = contrastRatio(v('admin-rail-focus'), v('admin-rail-surface'));
  assert.ok(ratio >= AA_LARGE, `focus ring on the rail measures ${ratio.toFixed(2)}:1`);
});

test('rail contrast: the active pill is distinguishable from the rail behind it', () => {
  const ratio = contrastRatio(v('admin-rail-active-bg'), v('admin-rail-surface'));
  assert.ok(ratio >= AA_LARGE, `active pill on the rail measures ${ratio.toFixed(2)}:1`);
});

// ── hierarchy: the group header must be DIMMER than the item label ──────────
test('rail contrast: the group header is dimmer than the item label, not equal to it', () => {
  // C3's second clause. The cheap way to pass the 4.5 floor is to make the
  // header as bright as the items, which passes the ratio and destroys the
  // hierarchy the header exists for. This asserts the ordering survived.
  const item = contrastRatio(v('admin-rail-item'), v('admin-rail-surface'));
  const group = contrastRatio(v('admin-rail-group'), v('admin-rail-surface'));
  assert.ok(group < item,
    `group header (${group.toFixed(2)}) is not dimmer than the item label (${item.toFixed(2)})`);
  assert.ok(group >= AA_NORMAL, 'and it still has to clear the floor');
});

// ── the theme ruling, at the token layer ────────────────────────────────────
test('rail tokens: not one of them is redeclared under .dark', () => {
  // The rail is theme-invariant BY DECLARATION. A `.dark` override would make
  // the exemption a lie without changing a single component, and no render test
  // would catch it because the render tier never resolves CSS variables.
  const darkBlocks = [...CSS.matchAll(/^\.dark[^{]*\{([\s\S]*?)^\}/gm)].map((m) => m[1]);
  assert.ok(darkBlocks.length > 0, 'no .dark block found — the scan is wrong');
  const offenders = [];
  for (const block of darkBlocks) {
    for (const m of block.matchAll(/--(admin-rail-[\w-]+)\s*:/g)) offenders.push(m[1]);
  }
  assert.deepEqual(offenders, [],
    'the admin rail renders the same surface in both themes; a dark override '
    + 'reintroduces exactly the half-theming this token set exists to prevent');
});

test('rail tokens: every value is a plain hex, resolvable without a browser', () => {
  // `var(--x)` chains, colour-mix() and relative colour syntax would all be
  // legal CSS and would all make this file unable to measure anything — the
  // ratios would silently become NaN and the reds would point at contrast
  // rather than at indirection.
  for (const [name, value] of Object.entries(TOKENS)) {
    assert.match(value, /^#[0-9a-fA-F]{6}$/, `--${name} is ${value}, not a 6-digit hex`);
  }
});

// ── CONTROL ─────────────────────────────────────────────────────────────────
test('CONTROL: the measurement can fail — the mockup grey does not clear AA', () => {
  // The two literals in this file, and they are here on purpose: without a
  // known-failing input, a table of eight passes is indistinguishable from a
  // table that cannot fail. #64748B is the mockup's group-header grey, which is
  // why the round had to pick a different one.
  const mockupGrey = contrastRatio('#64748B', v('admin-rail-surface'));
  assert.ok(mockupGrey < AA_NORMAL,
    `the mockup grey measures ${mockupGrey.toFixed(2)} — if this now passes, the `
    + 'rail surface changed and every ratio above needs re-reading');
  assert.ok(mockupGrey > 3, 'and it is a near miss, not an obviously broken input');
});

test('CONTROL: the parse reads the FILE, not a default baked into this test', () => {
  // If railTokens() silently returned a fixture, every assertion above would be
  // measuring the fixture. This shows the values came from globals.css.
  assert.ok(CSS.includes('--admin-rail-surface'), 'globals.css does not declare the token');
  assert.ok(CSS.includes(v('admin-rail-surface')), 'the parsed value is not in the file');
  assert.equal(railTokens('/* nothing here */').hasOwnProperty('admin-rail-surface'), false);
});
