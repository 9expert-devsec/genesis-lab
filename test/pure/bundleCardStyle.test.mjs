import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bundleGlowFor,
  cardBorderFor,
  BUNDLE_GLOW_LEFT_DEFAULT,
  BUNDLE_GLOW_RIGHT_DEFAULT,
  BUNDLE_BORDER_COLOR_DEFAULT,
  BUNDLE_BORDER_WIDTH_DEFAULT,
  BUNDLE_BORDER_WIDTHS,
  BUNDLE_SURFACE_CLASS,
  BUNDLE_BORDER_CLASS,
  SECTION_STYLE_CAPS,
} from '@/lib/pageBuilder/presets';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo. The selectable-card round.
import {
  bundleCardThemeFor,
  withoutDarkVariants,
  BUNDLE_CARD_THEME_DEFAULT,
} from '@/lib/pageBuilder/presets';
import { BUNDLE_CARD_THEMES } from '@/lib/schemas/pageBuilder';

/**
 * The navy bundle card's two new caps, at the helper boundary.
 *
 * ── WHAT THESE TESTS ARE FOR, AND WHAT THEY ARE NOT ───────────────────────
 * They assert the RESOLUTION rule — valid hex honoured, anything else falls to
 * the declared default, border off emits nothing — because that rule is the
 * whole safety story for a value an author types and a seeded document can
 * carry arbitrarily. They do NOT assert the rendered markup; the renderer's own
 * tier does that, and duplicating it here would make two places to update for
 * one change.
 *
 * The defaults are compared against the EXPORTED constants rather than against
 * literals. A literal here would be a second declaration of the colour, so a
 * change to the default would need editing in two places and would pass with
 * the test still asserting the old one — which is the drift this suite keeps
 * closing, not a style preference.
 */

const CAP_TYPE = 'promotion_bundle';
const NO_CAP_TYPE = 'price_card'; // declares cardStyle/buttonStyle, NOT these two

/**
 * ── EVERY GLOW TEST BELOW NOW NAMES THE NAVY THEME, AND MUST ──────────────
 * The selectable-card round made the glows navy-ONLY: `bundleGlowFor` returns
 * nothing for a light card, and light is the resolved default. So a glow test
 * that omitted the theme would be asserting the light branch while reading like
 * it asserts the colours — a test that passes for the wrong reason.
 *
 * Spread through `NAVY` rather than written into each literal, so the day a
 * third style lands there is one place to look. The light branch has its own
 * tests further down, where it is the subject rather than an accident.
 */
const NAVY = { bundleCardTheme: 'navy' };

// ── bundleGlow ──────────────────────────────────────────────────────────────

test('bundleGlow: a valid #RRGGBB pair is honoured verbatim', () => {
  const { className, vars } = bundleGlowFor(CAP_TYPE, {
    ...NAVY,
    bundleGlowLeft: '#AABBCC',
    bundleGlowRight: '#001122',
  });
  assert.equal(className, BUNDLE_SURFACE_CLASS);
  assert.equal(vars['--bundle-glow-left'], '#AABBCC');
  assert.equal(vars['--bundle-glow-right'], '#001122');
});

test('bundleGlow: lower-case and mixed-case hex are both accepted', () => {
  const { vars } = bundleGlowFor(CAP_TYPE, {
    ...NAVY,
    bundleGlowLeft: '#aabbcc',
    bundleGlowRight: '#AaBbCc',
  });
  assert.equal(vars['--bundle-glow-left'], '#aabbcc');
  assert.equal(vars['--bundle-glow-right'], '#AaBbCc');
});

test('bundleGlow: a navy card with no colours stored falls back to both defaults', () => {
  for (const style of [NAVY, { ...NAVY, bundleGlowLeft: undefined, bundleGlowRight: undefined }]) {
    const { className, vars } = bundleGlowFor(CAP_TYPE, style);
    assert.equal(className, BUNDLE_SURFACE_CLASS, 'the navy base is needed even with nothing stored');
    assert.equal(vars['--bundle-glow-left'], BUNDLE_GLOW_LEFT_DEFAULT);
    assert.equal(vars['--bundle-glow-right'], BUNDLE_GLOW_RIGHT_DEFAULT);
  }
});

test('bundleGlow: every INVALID shape falls back to the default, never to empty', () => {
  // The shapes a text input, a bad paste or a seeded document can actually
  // produce. `#FFF` is the one worth naming: it is a legal CSS colour and this
  // system still refuses it, because HEX_COLOR_RE is six digits exactly and a
  // three-digit value would make the stored vocabulary two shapes wide.
  const bad = ['', '   ', '#FFF', '#GGHHII', 'FFFFFF', '#1234567', 'red',
               'rgb(0,0,0)', 0, 1, true, false, [], {}, null, NaN,
               '#FFFFFF;background:url(x)'];
  for (const v of bad) {
    const { className, vars } = bundleGlowFor(CAP_TYPE, { ...NAVY, bundleGlowLeft: v, bundleGlowRight: v });
    assert.equal(className, BUNDLE_SURFACE_CLASS);
    assert.equal(vars['--bundle-glow-left'], BUNDLE_GLOW_LEFT_DEFAULT, `left should reject ${JSON.stringify(v)}`);
    assert.equal(vars['--bundle-glow-right'], BUNDLE_GLOW_RIGHT_DEFAULT, `right should reject ${JSON.stringify(v)}`);
  }
});

test('bundleGlow: one bad side does not drag the good side to its default', () => {
  const { vars } = bundleGlowFor(CAP_TYPE, { ...NAVY, bundleGlowLeft: '#123456', bundleGlowRight: 'nope' });
  assert.equal(vars['--bundle-glow-left'], '#123456');
  assert.equal(vars['--bundle-glow-right'], BUNDLE_GLOW_RIGHT_DEFAULT);
});

test('bundleGlow: THE GATE — a type without the cap reads nothing', () => {
  const { className, vars } = bundleGlowFor(NO_CAP_TYPE, {
    ...NAVY,
    bundleGlowLeft: '#AABBCC',
    bundleGlowRight: '#001122',
  });
  assert.equal(className, '');
  assert.deepEqual(vars, {}, 'a type without the cap must not read the prop (2C.3)');
});

// ── cardBorder ──────────────────────────────────────────────────────────────

test('cardBorder: OFF by default — no class and NO border variables', () => {
  for (const style of [undefined, null, {}, { cardBorderOn: false }]) {
    const { className, vars } = cardBorderFor(CAP_TYPE, style);
    assert.equal(className, '', 'an off border must leave no class in the markup');
    assert.deepEqual(vars, {}, 'an off border must emit no variables at all');
  }
});

test('cardBorder: only a literal `true` turns it on — truthiness is not enough', () => {
  // The field is .optional() with no default, so `undefined` must read as OFF.
  // These are the values that would switch it on under a truthy check and must
  // not under this one.
  for (const v of [1, 'true', 'on', [], {}]) {
    const { className, vars } = cardBorderFor(CAP_TYPE, { cardBorderOn: v });
    assert.equal(className, '', `cardBorderOn=${JSON.stringify(v)} must not enable the border`);
    assert.deepEqual(vars, {});
  }
});

test('cardBorder: ON with nothing else stored takes both defaults', () => {
  const { className, vars } = cardBorderFor(CAP_TYPE, { cardBorderOn: true });
  assert.equal(className, BUNDLE_BORDER_CLASS);
  assert.equal(vars['--bundle-border-color'], BUNDLE_BORDER_COLOR_DEFAULT);
  assert.equal(vars['--bundle-border-width'], `${BUNDLE_BORDER_WIDTH_DEFAULT}px`);
});

test('cardBorder: ON honours a valid colour and every width in the vocabulary', () => {
  for (const w of BUNDLE_BORDER_WIDTHS) {
    const { className, vars } = cardBorderFor(CAP_TYPE, {
      cardBorderOn: true, cardBorderColor: '#0F0F0F', cardBorderWidth: w,
    });
    assert.equal(className, BUNDLE_BORDER_CLASS);
    assert.equal(vars['--bundle-border-color'], '#0F0F0F');
    assert.equal(vars['--bundle-border-width'], `${w}px`);
  }
});

test('cardBorder: an INVALID colour falls back to the default, border still on', () => {
  for (const v of ['', '#FFF', 'white', 42, null, undefined, {}]) {
    const { className, vars } = cardBorderFor(CAP_TYPE, { cardBorderOn: true, cardBorderColor: v });
    assert.equal(className, BUNDLE_BORDER_CLASS, 'a bad colour must not silently disable the border');
    assert.equal(vars['--bundle-border-color'], BUNDLE_BORDER_COLOR_DEFAULT);
  }
});

test('cardBorder: an out-of-vocabulary width falls back to the default', () => {
  // 0 and 5 bracket the 1..4 range; the rest are the shapes a select bug or a
  // seeded document produces. `'2'` is the one that matters: the schema refuses
  // a string, so a panel that forgot its Number() cast must not render 2px.
  for (const v of [0, 5, -1, 1.5, '2', '', null, NaN, Infinity, true, [2], {}]) {
    const { vars } = cardBorderFor(CAP_TYPE, { cardBorderOn: true, cardBorderWidth: v });
    assert.equal(
      vars['--bundle-border-width'], `${BUNDLE_BORDER_WIDTH_DEFAULT}px`,
      `width ${JSON.stringify(v)} should fall back`,
    );
  }
});

test('cardBorder: a stored colour is KEPT but inert while the toggle is off', () => {
  const { className, vars } = cardBorderFor(CAP_TYPE, {
    cardBorderOn: false, cardBorderColor: '#123456', cardBorderWidth: 4,
  });
  assert.equal(className, '');
  assert.deepEqual(vars, {}, 'off means off, whatever else is stored');
});

test('cardBorder: THE GATE — a type without the cap reads nothing even when on', () => {
  const { className, vars } = cardBorderFor(NO_CAP_TYPE, {
    cardBorderOn: true, cardBorderColor: '#123456', cardBorderWidth: 3,
  });
  assert.equal(className, '');
  assert.deepEqual(vars, {});
});

// ── the declaration itself ──────────────────────────────────────────────────

test('promotion_bundle still does NOT declare cardStyle', () => {
  // The caps ARRAY is asserted in full further down (theme first). This one
  // survives as the narrower claim the navy round made and this round keeps:
  // whatever the list grows to, `cardStyle` is not in it.
  assert.ok(!SECTION_STYLE_CAPS.promotion_bundle.includes('cardStyle'));
});

test('the two new caps are declared by promotion_bundle ALONE', () => {
  // A second type picking up `bundleGlow` would be reading the bundle's navy
  // surface onto a section that has none — the caps are the gate, so this is
  // where that is caught.
  for (const cap of ['bundleGlow', 'cardBorder']) {
    const owners = Object.entries(SECTION_STYLE_CAPS)
      .filter(([, props]) => props.includes(cap))
      .map(([type]) => type);
    assert.deepEqual(owners, ['promotion_bundle'], `${cap} must be promotion_bundle's alone`);
  }
});

test('control: the defaults are real six-digit hex, so a fallback is never a broken style', () => {
  for (const c of [BUNDLE_GLOW_LEFT_DEFAULT, BUNDLE_GLOW_RIGHT_DEFAULT, BUNDLE_BORDER_COLOR_DEFAULT]) {
    assert.match(c, /^#[0-9a-fA-F]{6}$/);
  }
  assert.ok(BUNDLE_BORDER_WIDTHS.includes(BUNDLE_BORDER_WIDTH_DEFAULT));
});

// ── the whole-card style, and the gate it puts on the glows ─────────────────

test('bundleCardTheme: MISSING resolves to light — the pre-navy card', () => {
  for (const style of [undefined, null, {}]) {
    assert.equal(bundleCardThemeFor(CAP_TYPE, style), BUNDLE_CARD_THEME_DEFAULT);
  }
  assert.equal(BUNDLE_CARD_THEME_DEFAULT, 'light', 'the default must be the look stored sections were authored against');
});

test('bundleCardTheme: both vocabulary values resolve to themselves', () => {
  for (const v of BUNDLE_CARD_THEMES) {
    assert.equal(bundleCardThemeFor(CAP_TYPE, { bundleCardTheme: v }), v);
  }
});

test('bundleCardTheme: every out-of-vocabulary value resolves to light', () => {
  // 'white' is the one worth naming: it is what an author would call the first
  // option (the panel labels it สีขาว) and it is NOT the stored token, so a
  // hand-seeded document carrying it must land on the default rather than
  // silently rendering navy.
  for (const v of ['white', 'Navy', 'NAVY', 'dark', '', ' light', 0, 1, true, [], {}, null]) {
    assert.equal(
      bundleCardThemeFor(CAP_TYPE, { bundleCardTheme: v }), BUNDLE_CARD_THEME_DEFAULT,
      `${JSON.stringify(v)} must resolve to the default`,
    );
  }
});

test('bundleCardTheme: THE GATE — a type without the cap still gets a usable theme', () => {
  // Unlike the colour helpers this returns the DEFAULT rather than an empty
  // value: every caller branches on it and there is no "no theme" rendering.
  assert.equal(bundleCardThemeFor(NO_CAP_TYPE, { bundleCardTheme: 'navy' }), BUNDLE_CARD_THEME_DEFAULT);
});

test('bundleGlow: a LIGHT card emits no surface class and NO glow variables', () => {
  for (const style of [undefined, {}, { bundleCardTheme: 'light' }, { bundleCardTheme: 'nonsense' }]) {
    const { className, vars } = bundleGlowFor(CAP_TYPE, style);
    assert.equal(className, '', 'the navy base must not reach a light card');
    assert.deepEqual(vars, {}, 'a light card must emit no glow variables');
  }
});

test("bundleGlow: a light card KEEPS the author's stored colours, it just ignores them", () => {
  const stored = { bundleCardTheme: 'light', bundleGlowLeft: '#112233', bundleGlowRight: '#445566' };
  assert.deepEqual(bundleGlowFor(CAP_TYPE, stored).vars, {}, 'light ignores them');
  // The same object, switched to navy, gets the pair back — which is the
  // statement that nothing was cleared.
  const { vars } = bundleGlowFor(CAP_TYPE, { ...stored, bundleCardTheme: 'navy' });
  assert.equal(vars['--bundle-glow-left'], '#112233');
  assert.equal(vars['--bundle-glow-right'], '#445566');
});

test('cardBorder applies to BOTH styles', () => {
  for (const theme of BUNDLE_CARD_THEMES) {
    const { className, vars } = cardBorderFor(CAP_TYPE, { bundleCardTheme: theme, cardBorderOn: true });
    assert.equal(className, BUNDLE_BORDER_CLASS, `the border must work on ${theme}`);
    assert.equal(vars['--bundle-border-color'], BUNDLE_BORDER_COLOR_DEFAULT);
  }
});

test('promotion_bundle declares the FOUR caps in order, theme first', () => {
  assert.deepEqual(
    SECTION_STYLE_CAPS.promotion_bundle,
    ['bundleCardTheme', 'bundleGlow', 'cardBorder', 'buttonStyle'],
  );
});

// ── withoutDarkVariants ─────────────────────────────────────────────────────

test('withoutDarkVariants: drops every dark: token and keeps the rest in order', () => {
  assert.equal(withoutDarkVariants('bg-9e-ice dark:bg-9e-navy'), 'bg-9e-ice');
  assert.equal(
    withoutDarkVariants('text-sm font-bold text-amber-700 dark:text-amber-400'),
    'text-sm font-bold text-amber-700',
  );
});

test('withoutDarkVariants: the badge forms reduce to exactly their light halves', () => {
  // The four `soft` strings resolveDerivedRoundBadge can produce. Asserted as
  // literals here ON PURPOSE: this is the claim that stripping yields the light
  // form, and it can only be made against the actual strings. If the badge
  // palette changes these fail and the helper still works — which is the point,
  // the test is pinning the REDUCTION, not the colours.
  assert.equal(withoutDarkVariants('bg-[#39b980]/10 text-[#39b980] dark:bg-[#39b980]/20'),
    'bg-[#39b980]/10 text-[#39b980]');
  assert.equal(withoutDarkVariants('bg-[#ffc94a]/15 text-[#d4a017] dark:bg-[#ffc94a]/20 dark:text-[#ffc94a]'),
    'bg-[#ffc94a]/15 text-[#d4a017]');
  assert.equal(withoutDarkVariants('bg-[#ff4b55]/10 text-[#ff4b55] dark:bg-[#ff4b55]/20'),
    'bg-[#ff4b55]/10 text-[#ff4b55]');
  assert.equal(withoutDarkVariants('bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'),
    'bg-slate-100 text-slate-600');
});

test('withoutDarkVariants: survives the shapes a class string actually arrives in', () => {
  assert.equal(withoutDarkVariants(''), '');
  assert.equal(withoutDarkVariants('   '), '');
  assert.equal(withoutDarkVariants('  a   dark:b   c  '), 'a c', 'collapses the whitespace it splits on');
  assert.equal(withoutDarkVariants('dark:only'), '', 'an all-dark string reduces to nothing');
  for (const v of [undefined, null, 0, 1, true, [], {}]) {
    assert.equal(withoutDarkVariants(v), '', `${JSON.stringify(v)} must not throw`);
  }
});

test('withoutDarkVariants: does NOT eat a class that merely contains "dark"', () => {
  // `group-hover:dark:x` is not a top-level dark: token and `bg-darkblue` is
  // not one either. Only the prefix counts.
  assert.equal(withoutDarkVariants('bg-darkblue text-dark'), 'bg-darkblue text-dark');
  assert.equal(withoutDarkVariants('lg:dark:bg-x keep'), 'lg:dark:bg-x keep');
});
