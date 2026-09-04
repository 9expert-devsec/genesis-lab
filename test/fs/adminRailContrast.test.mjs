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

/**
 * Comments out, because ROUND D made them dangerous here.
 *
 * The value matcher below is bounded on `;` rather than on `#hex`, since a
 * declaration can now be `var(--9e-navy)`. That looser bound can run through a
 * comment, and the comments in this block discuss declarations BY NAME —
 * "= --9e-slate-dp-400", ".dark --surface-raised" — precisely the text a
 * name:value matcher is looking for. Stripping first is defect 1 in
 * test/sourceScan.mjs's header, pre-empted for a matcher that has to live in
 * this file rather than in the shared reader.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** A top-level block, `{`…`\n}`, starting at the first occurrence of `head`. */
function block(css, head) {
  const start = css.indexOf(head);
  assert.notEqual(start, -1, `no ${head.trim()} block in ${CSS_REL}`);
  const end = css.indexOf('\n}', start);
  assert.notEqual(end, -1, `${head.trim()} block is unterminated`);
  return css.slice(start, end);
}

/** The `:root` block — the only place --admin-rail-* may be declared. */
const rootBlock = (css) => block(css, ':root {');
/** The `.dark` block — where the theme-aware half of the palette is redeclared. */
const darkBlock = (css) => block(css, '.dark {');

/**
 * EVERY `--name: value;` in a block, value verbatim and untrimmed of var().
 *
 * It strips comments ITSELF rather than relying on its caller to hand it clean
 * text. Stripping in `block()` would have worked for the two call sites here
 * and left the control below — which hands it a comment on purpose — testing a
 * different function from the one the file uses.
 */
function declarations(blk) {
  const out = {};
  for (const m of stripComments(blk).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

const ROOT_DECLS = declarations(rootBlock(CSS));
const DARK_DECLS = declarations(darkBlock(CSS));

/**
 * Follow a `var()` chain down to the literal it ends at.
 *
 * ROUND D1. Eight of the thirteen rail tokens are now `var(--9e-…)` rather than
 * a copied hex, so this file can no longer read a colour straight off the
 * declaration — it has to resolve one level (or several; the chain is followed
 * rather than assumed to be flat) exactly as the browser would.
 *
 * IT RESOLVES AGAINST `:root` ONLY, and that is the point rather than a
 * limitation: a rail token is allowed to reference a variable that has no
 * `.dark` declaration, and nothing else. A reference this function cannot
 * resolve inside :root is a reference the rail must not have.
 */
function resolveColor(value, decls, seen = []) {
  const raw = String(value).trim();
  const ref = raw.match(/^var\(\s*--([\w-]+)\s*\)$/);
  if (!ref) return raw;
  const name = ref[1];
  assert.ok(!seen.includes(name), `var() cycle: --${[...seen, name].join(' -> --')}`);
  const next = decls[name];
  assert.notEqual(next, undefined,
    `--${name} is referenced by a rail token but is not declared on :root`);
  return resolveColor(next, decls, [...seen, name]);
}

/** Every `--admin-rail-*` declaration, VERBATIM — `#hex` or `var(--x)`. */
const RAW = Object.fromEntries(
  Object.entries(ROOT_DECLS).filter(([name]) => name.startsWith('admin-rail-')),
);

/** The same set, resolved to the colour a browser would paint. */
const TOKENS = Object.fromEntries(
  Object.entries(RAW).map(([name, value]) => [name, resolveColor(value, ROOT_DECLS)]),
);
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
    // Round D3: the nav list's scrollbar.
    'admin-rail-scroll-track', 'admin-rail-scroll-thumb',
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

// ── D3: the scrollbar, which is non-text UI and has to be FOUND ─────────────
//
// Three pairs, and they are not the same requirement stated three ways:
//
//   · the THUMB against the rail is the 1.4.11 pair — it is the control, and
//     3:1 is the floor for a non-text control;
//   · the THUMB against its own TRACK is what tells the admin WHERE in the list
//     they are. A thumb that clears the rail but vanishes into its own groove
//     is a scrollbar you can see and cannot read;
//   · the TRACK against the rail is the one that must be present WITHOUT being
//     loud. It is deliberately quiet — a track at thumb-level contrast draws a
//     permanent stripe down a 240px rail whether or not anything is scrolling —
//     so its floor is stated as "distinguishable", not as 3:1, and the ceiling
//     below is as load-bearing as the floor.

test('rail contrast: the scrollbar thumb clears the 3:1 non-text floor on the rail', () => {
  const ratio = contrastRatio(v('admin-rail-scroll-thumb'), v('admin-rail-surface'));
  assert.ok(ratio >= AA_LARGE,
    `the thumb measures ${ratio.toFixed(2)}:1 on the rail — WCAG 2.1 1.4.11 puts the `
    + 'floor for a non-text control at 3:1, and a scrollbar nobody can find is the '
    + 'same defect as the pale default this replaced');
});

test('rail contrast: the thumb is distinguishable from its own track', () => {
  const ratio = contrastRatio(v('admin-rail-scroll-thumb'), v('admin-rail-scroll-track'));
  assert.ok(ratio >= AA_LARGE,
    `thumb on track measures ${ratio.toFixed(2)}:1. This is the pair that carries `
    + '"where am I in the list" — without it the bar is visible and unreadable');
});

test('rail contrast: the track is distinguishable from the rail, and QUIETER than the thumb', () => {
  const trackOnRail = contrastRatio(v('admin-rail-scroll-track'), v('admin-rail-surface'));
  const thumbOnRail = contrastRatio(v('admin-rail-scroll-thumb'), v('admin-rail-surface'));
  assert.ok(trackOnRail > 1.2,
    `the track measures ${trackOnRail.toFixed(2)}:1 on the rail — at 1.00 it IS the rail, `
    + 'and the bar loses the groove that shows how long the list is');
  // The ceiling, and it is a real requirement rather than a nicety: a track as
  // loud as the thumb is a stripe down the rail that never goes away, and the
  // thumb stops reading as the thing that moves.
  assert.ok(trackOnRail < thumbOnRail / 2,
    `the track (${trackOnRail.toFixed(2)}:1) is no longer clearly quieter than the thumb `
    + `(${thumbOnRail.toFixed(2)}:1) — the groove is competing with the affordance`);
});

test('CONTROL: the scrollbar pairs would fail if the colours were the rail itself', () => {
  // Three assertions above are `>=` against tokens read from the same file. If
  // the parse had picked up the wrong names, every one would measure the rail
  // against itself — 1.00:1 — and go red for the wrong reason. This shows the
  // ratios move, and in which direction, when the input really is the rail.
  assert.equal(contrastRatio(v('admin-rail-surface'), v('admin-rail-surface')), 1);
  assert.ok(contrastRatio(v('admin-rail-scroll-thumb'), v('admin-rail-surface')) > 1);
  assert.notEqual(v('admin-rail-scroll-thumb'), v('admin-rail-scroll-track'));
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

test('rail tokens: every value RESOLVES to a plain hex, without a browser', () => {
  // Was "every value IS a plain hex" before round D1 rebound eight of them to
  // `var(--9e-…)`. The requirement did not change, only where it is enforced:
  // colour-mix(), relative colour syntax and a var() pointing at either would
  // all be legal CSS and would all leave this file unable to measure anything —
  // the ratios would silently become NaN and the reds would point at contrast
  // rather than at indirection.
  for (const [name, value] of Object.entries(TOKENS)) {
    assert.match(value, /^#[0-9a-fA-F]{6}$/,
      `--${name} is declared ${RAW[name]} and resolves to ${value}, not a 6-digit hex`);
  }
});

// ── D1: WHERE EACH TOKEN'S VALUE COMES FROM ─────────────────────────────────
//
// Round C wrote thirteen hex literals and named each source in a comment. A
// comment cannot resolve, so the day --9e-navy changed, the rail kept the old
// navy and nothing said a word. D1 replaced most of those comments with the one
// thing a stylesheet CAN enforce — `var()` — and the three tests below are the
// enforcement for the rest.
//
// The categories are stated in globals.css beside the declarations. Restated
// here as DATA rather than prose, so the split is asserted rather than believed.

/** name → the `--9e-*` variable it must be bound to with `var()`. */
const REBOUND = {
  'admin-rail-surface': '9e-navy',
  'admin-rail-divider': '9e-border',
  'admin-rail-brand': '9e-ice',
  'admin-rail-active-bg': '9e-action',
  'admin-rail-active-fg': '9e-ice',
  'admin-rail-focus': '9e-air',
  'admin-rail-card': '9e-ice',
  'admin-rail-card-fg': '9e-navy',
  'admin-rail-scroll-track': '9e-border',
};

/**
 * name → the source it copies, for the tokens that must stay literal.
 *
 * `dark` says WHERE the source's other declaration lives, and it is what
 * separates the two reasons a token is literal:
 *
 *   · `dark: 'differs'` — category 2. The source has a `.dark` value that is a
 *     DIFFERENT colour, so a var() would flip the rail. Nothing to cross-check;
 *     what is asserted is that the source really does differ, so the exemption
 *     stays earned rather than inherited.
 *   · `dark: 'same'` — category 3. The source is declared twice with the SAME
 *     value. Identical today, and this is the assertion that says so tomorrow.
 *
 * `from` names WHICH of the source's two declarations the value was copied
 * from, and it is not decoration: --admin-rail-hover took --surface-raised's
 * DARK value (#1E3A5F) while --admin-rail-card-hover took --surface's LIGHT one
 * (#FFFFFF). A table that assumed either would check the wrong half for the
 * other, and would have to be loosened until it checked nothing.
 */
const LITERAL = {
  'admin-rail-hover': { source: 'surface-raised', dark: 'differs', from: 'dark' },
  'admin-rail-card-hover': { source: 'surface', dark: 'differs', from: 'root' },
  'admin-rail-item': { source: '9e-slate-dp-400', dark: 'same', from: 'root' },
  'admin-rail-group': { source: '9e-slate-dp-300', dark: 'same', from: 'root' },
  'admin-rail-card-muted': { source: '9e-slate-dp-50', dark: 'same', from: 'root' },
  'admin-rail-scroll-thumb': { source: '9e-slate-dp-200', dark: 'same', from: 'root' },
};

test('D1: the split covers every token exactly once — no third bucket', () => {
  // Both tables below are hand-written lists. If a fourteenth token is added
  // and named in neither, it is governed by nothing and both tests pass.
  assert.deepEqual(
    [...Object.keys(REBOUND), ...Object.keys(LITERAL)].sort(),
    Object.keys(TOKENS).sort(),
  );
});

test('D1: every rebound token is a var() at its named source — not a copy of it', () => {
  for (const [name, source] of Object.entries(REBOUND)) {
    assert.equal(RAW[name], `var(--${source})`,
      `--${name} is declared ${RAW[name]}. It must REFERENCE --${source}: a copied `
      + 'hex means the day the CI palette moves, the rail silently does not');
    // And the source really is theme-invariant BY DECLARATION, which is the
    // whole licence for referencing it. A `.dark` value appearing here later
    // would make the reference a flip, and this is where that gets caught.
    assert.equal(DARK_DECLS[source], undefined,
      `--${source} gained a .dark declaration, so --${name} now flips with the theme`);
  }
});

test('D1: every literal token still equals the source it copies, in BOTH blocks', () => {
  // THE POINT OF THIS TEST. Five tokens cannot use var() — two because the
  // source flips, three because the source is declared twice and a variable
  // with a `.dark` declaration is theme-aware whatever its current value. That
  // leaves them as copies, which is the exact drift D1 exists to end. So the
  // copy is checked instead of trusted, and a palette change that fails to
  // reach the rail goes red here rather than going unnoticed.
  for (const [name, { source, dark, from }] of Object.entries(LITERAL)) {
    const light = ROOT_DECLS[source];
    assert.notEqual(light, undefined, `--${source} is no longer declared on :root`);
    const copied = from === 'dark' ? DARK_DECLS[source] : light;
    assert.notEqual(copied, undefined, `--${source} is no longer declared in the ${from} block`);
    assert.equal(TOKENS[name], resolveColor(copied, ROOT_DECLS),
      `--${name} is ${TOKENS[name]} but the ${from} declaration of --${source} is now `
      + `${copied} — the copy has drifted`);

    if (dark === 'same') {
      assert.equal(DARK_DECLS[source], light,
        `--${source} used to be identical in :root and .dark, and is not any more `
        + `(:root ${light}, .dark ${DARK_DECLS[source]}). Decide which value the rail `
        + 'wants and say so at the declaration — do not let it drift');
    } else {
      assert.notEqual(DARK_DECLS[source], undefined,
        `--${source} no longer has a .dark declaration, so --${name} could now be a var()`);
      assert.notEqual(DARK_DECLS[source], light,
        `--${source} is now the same in both themes, so --${name} could now be a var()`);
    }
  }
});

test('D1: the rebinding changed NO computed value', () => {
  // The thirteen colours as round C declared them, byte for byte, BEFORE the
  // var() rebinding. The file's header argues against a hardcoded palette and
  // is right to — but this is not a contrast table, it is a CHANGE DETECTOR for
  // one refactor whose entire claim was "same values, different declaration".
  // Without it, a rebinding that pointed --admin-rail-focus at --9e-action
  // instead of --9e-air would keep every ratio above the floor and pass in
  // silence, because both clear 3:1.
  //
  // A deliberate CI palette change moves these numbers, and that is the
  // intended behaviour: it goes red, in the same commit that changed the
  // palette, with the ratios beside it to re-read — which is exactly what
  // round C's copied hexes could never do.
  assert.deepEqual(TOKENS, {
    'admin-rail-surface': '#0D1B2A',
    'admin-rail-divider': '#1A2D42',
    'admin-rail-hover': '#1E3A5F',
    'admin-rail-brand': '#F8FAFD',
    'admin-rail-item': '#9EA6B2',
    'admin-rail-group': '#8E97A5',
    'admin-rail-active-bg': '#005CFF',
    'admin-rail-active-fg': '#F8FAFD',
    'admin-rail-focus': '#48B0FF',
    'admin-rail-card': '#F8FAFD',
    'admin-rail-card-hover': '#FFFFFF',
    'admin-rail-card-fg': '#0D1B2A',
    'admin-rail-card-muted': '#5E6A7E',
    // Round D3 added these two AFTER the rebinding, so they are not part of
    // the "no computed value changed" claim — they are pinned here for the
    // same reason as the rest: so a change to them is a decision, not a drift.
    'admin-rail-scroll-track': '#1A2D42',
    'admin-rail-scroll-thumb': '#7E8898',
  });
});

test('CONTROL: the resolver really resolves, and really refuses', () => {
  // Every D1 assertion above runs through resolveColor. If it silently returned
  // its input, `var(--9e-navy)` would compare as the string it is and the
  // snapshot test would have gone red — but the two failure modes that would
  // NOT show up there are a resolver that cannot follow a chain, and one that
  // invents a value for a name nobody declared.
  const decls = { a: 'var(--b)', b: 'var(--c)', c: '#123456', loop: 'var(--loop)' };
  assert.equal(resolveColor('var(--a)', decls), '#123456', 'a two-hop chain is not followed');
  assert.equal(resolveColor('#ABCDEF', decls), '#ABCDEF', 'a literal was mangled');
  assert.throws(() => resolveColor('var(--nope)', decls), /not declared on :root/);
  assert.throws(() => resolveColor('var(--loop)', decls), /cycle/);
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
  // If declarations() silently returned a fixture, every assertion above would
  // be measuring the fixture. This shows the values came from globals.css.
  assert.ok(CSS.includes('--admin-rail-surface'), 'globals.css does not declare the token');
  assert.ok(CSS.includes(RAW['admin-rail-surface']), 'the parsed declaration is not in the file');
  assert.ok(CSS.includes(v('admin-rail-surface')), 'the resolved value is not in the file');
  assert.equal(Object.keys(declarations('/* --admin-rail-surface: #000; */')).length, 0,
    'declarations() reads commented-out text as a declaration');
  assert.equal(Object.keys(declarations('nothing here')).length, 0);
});

test('CONTROL: the two blocks are DIFFERENT parses, and both are non-empty', () => {
  // The D1 tests compare :root against .dark. If block() returned the same
  // slice twice — a plausible off-by-one on indexOf — 'same' would pass
  // trivially and 'differs' would fail for the wrong reason. And if either
  // parse came back empty, every `DARK_DECLS[x] === undefined` check would pass
  // against nothing at all, which is exactly how the rebound half would be
  // licensed by silence.
  assert.ok(Object.keys(ROOT_DECLS).length > 50, `:root parsed ${Object.keys(ROOT_DECLS).length}`);
  assert.ok(Object.keys(DARK_DECLS).length > 50, `.dark parsed ${Object.keys(DARK_DECLS).length}`);
  assert.equal(DARK_DECLS['9e-navy'], undefined, '--9e-navy is not supposed to be in .dark');
  assert.notEqual(ROOT_DECLS['surface'], DARK_DECLS['surface'],
    'the two blocks resolved to the same text — block() is reading one slice twice');
});
