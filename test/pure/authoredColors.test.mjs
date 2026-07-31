import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_BG_DARK,
  PAGE_BG_LIGHT,
  MIN_CONTRAST,
  adjustLightnessForContrast,
  classifyColor,
  contrastRatio,
  hslToRgb,
  hueDelta,
  normalizeAuthoredColors,
  parseColor,
  relativeLuminance,
  resolveAuthoredColor,
  rgbToOklab,
} from '@/lib/articles/normalizeAuthoredColors';

/**
 * Authored inline colours in article bodies — the render-time classifier.
 *
 * The whole correctness argument for this fix is "the classifier flags exactly
 * the colours that are lost on the dark page and nothing else". Two halves of
 * that claim need controls that can independently fail:
 *
 *   - it must FIRE: colours that genuinely fail on the dark background are
 *     classified `dark` (otherwise the bug is not fixed);
 *   - it must NOT OVERFIRE: colours that read acceptably on BOTH themes stay
 *     `mid` and are left alone (otherwise it is a blunt strip that destroys
 *     authorial intent, which is worse than the bug).
 *
 * A first attempt used a flat `luminance < 0.18` cut-off. It passed the
 * fire half and failed the overfire half — it swallowed #C62828 and #1565C0,
 * which clear 3:1 on both themes. The threshold is now derived from the actual
 * --page-bg token; the accent cases below are what pins that down.
 */

const WHITE = [255, 255, 255];
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// ── Controls that must FIRE ────────────────────────────────────────
// Each reads fine on white and is genuinely lost on the dark page. If the
// threshold is ever loosened past these, the original bug is back.
const MUST_BE_DARK = [
  ['rgb(13, 27, 42)', [13, 27, 42]],   // 9e-navy — the editor default leak, 1.00:1
  ['#4D4DE6', [77, 77, 230]],          // indigo accent present in the corpus, 2.92:1
  ['#00695C', [0, 105, 92]],           // dark teal, 2.63:1
  ['#7B1FA2', [123, 31, 162]],         // dark purple, 2.12:1
];

for (const [label, rgb] of MUST_BE_DARK) {
  test(`classifies ${label} as dark (fails 3:1 on the dark page)`, () => {
    const ratio = contrastRatio(rgb, PAGE_BG_DARK);
    assert.ok(
      ratio < MIN_CONTRAST,
      `fixture is wrong, not the code: ${label} is ${ratio.toFixed(2)}:1 on the dark page`
    );
    assert.equal(classifyColor(label), 'dark');
  });
}

// ── Controls that must NOT fire ────────────────────────────────────
// Author-chosen accents that clear 3:1 against BOTH page backgrounds. These
// must survive untouched or the fix is a blunt strip.
const MUST_BE_MID = [
  ['#C62828', [198, 40, 40]],   // red      5.62:1 light / 3.09:1 dark
  ['#1565C0', [21, 101, 192]],  // blue     5.75:1 light / 3.03:1 dark
  ['#EF5350', [239, 83, 80]],   // salmon   3.49:1 light / 4.99:1 dark
  ['#00897B', [0, 137, 123]],   // teal     4.32:1 light / 4.03:1 dark
];

for (const [hex, rgb] of MUST_BE_MID) {
  test(`preserves the mid-tone accent ${hex} (passes 3:1 on both themes)`, () => {
    const onLight = contrastRatio(rgb, WHITE);
    const onDark = contrastRatio(rgb, PAGE_BG_DARK);
    assert.ok(
      onLight >= 3 && onDark >= 3,
      `fixture is wrong, not the code: ${hex} is ${onLight.toFixed(2)}:1 light / ${onDark.toFixed(2)}:1 dark`
    );
    assert.equal(classifyColor(hex), 'mid');
  });
}

/**
 * CONTROL — the adjustment is CONDITIONAL.
 *
 * A colour clearing the floor in both themes needs no replacement in either,
 * so nothing is emitted and the body comes back byte-identical. If every
 * colour moved, the technique would be a global repaint rather than a fix.
 */
test('CONTROL: a colour passing in BOTH themes is emitted byte-identical', () => {
  const src = '<p><span style="color: #C62828;">accent</span></p>';
  assert.equal(resolveAuthoredColor('#C62828'), null, 'nothing to resolve');
  assert.equal(normalizeAuthoredColors(src), src, 'and therefore nothing to emit');
});

test('CONTROL: the inverse — a colour failing one theme IS adjusted', () => {
  // Without this the byte-identical assertion above could pass by doing
  // nothing at all, ever.
  const src = '<p><span style="color: #4de6e6;">accent</span></p>';
  const out = normalizeAuthoredColors(src);
  assert.notEqual(out, src);
  assert.match(out, /data-authored-fg="light"/);
  assert.match(out, /--authored-fg-light:#[0-9a-f]{6}/);
  assert.ok(out.includes('color:#4de6e6'), 'the authored declaration survives untouched');
});

/**
 * THE TOKEN-DRIFT CONTROL.
 *
 * The threshold must be a function of the dark page background, not a baked-in
 * luminance. Re-theming --page-bg has to move the boundary with it; if someone
 * later replaces the derivation with a hardcoded number, classification silently
 * stops tracking the theme and this is the test that says so.
 *
 * Same colour, three backgrounds, three different verdicts.
 */
test('the dark boundary is derived from the background, not hardcoded', () => {
  const SUBJECT = '#1565C0'; // 3.03:1 on the real dark page -> mid by a hair

  // Against the real token: survives.
  assert.equal(classifyColor(SUBJECT, { darkBg: PAGE_BG_DARK }), 'mid');

  // Against a LIGHTER dark theme, the same colour loses contrast and must flip.
  assert.equal(classifyColor(SUBJECT, { darkBg: [40, 60, 80] }), 'dark');

  // Against a pure-black theme it gains contrast and must stay mid.
  assert.equal(classifyColor(SUBJECT, { darkBg: [0, 0, 0] }), 'mid');
});

test('the boundary moves monotonically with the background luminance', () => {
  // A colour sitting just above the cut-off on the real token must fall below
  // it on any lighter background, for every subject we care about.
  const lighter = [40, 60, 80];
  assert.ok(relativeLuminance(lighter) > relativeLuminance(PAGE_BG_DARK));
  for (const [hex] of MUST_BE_MID) {
    const onReal = contrastRatio(hexToRgb(hex), PAGE_BG_DARK);
    const onLighter = contrastRatio(hexToRgb(hex), lighter);
    assert.ok(
      onLighter < onReal,
      `${hex}: expected contrast to drop on a lighter background (${onReal.toFixed(2)} -> ${onLighter.toFixed(2)})`
    );
  }
});

test('the exact cut-off is MIN_CONTRAST, checked from both sides', () => {
  // Bracket the boundary: 0.1312 luminance == 3:1 against #0D1B2A.
  const justBelow = '#767676'; // grey, verify then assert
  const ratio = contrastRatio(hexToRgb(justBelow), PAGE_BG_DARK);
  assert.equal(
    classifyColor(justBelow),
    ratio < MIN_CONTRAST ? 'dark' : 'mid',
    `classification must follow the ${MIN_CONTRAST}:1 rule (measured ${ratio.toFixed(3)}:1)`
  );
});

// ── Colour parsing ─────────────────────────────────────────────────

test('parses every notation Tiptap or a hand-edit can emit', () => {
  assert.deepEqual(parseColor('#0d1b2a'), [13, 27, 42, 1]);
  assert.deepEqual(parseColor('#0D1B2A'), [13, 27, 42, 1]);
  assert.deepEqual(parseColor('#abc'), [170, 187, 204, 1]);
  assert.deepEqual(parseColor('rgb(13, 27, 42)'), [13, 27, 42, 1]);
  assert.deepEqual(parseColor('rgb(13 27 42)'), [13, 27, 42, 1]);
  assert.deepEqual(parseColor('white'), [255, 255, 255, 1]);
  assert.deepEqual(parseColor('hsl(0, 0%, 100%)'), [255, 255, 255, 1]);
  assert.equal(parseColor('rgba(13, 27, 42, 0.5)')[3], 0.5);
});

test('declines to classify anything it cannot resolve', () => {
  // Returning null means "leave the author alone", which is the safe default.
  for (const v of ['var(--x)', 'currentColor', 'transparent', 'inherit',
                   'linear-gradient(red, blue)', '', '   ', 'notacolour', '#12345']) {
    assert.equal(classifyColor(v), null, `expected null for ${JSON.stringify(v)}`);
  }
});

test('declines to classify translucent colours (composite is unknowable)', () => {
  assert.equal(classifyColor('rgba(13, 27, 42, 0.3)'), null);
  assert.equal(classifyColor('#0D1B2A4D'), null);
  // ...but a fully opaque alpha is fine
  assert.equal(classifyColor('rgba(13, 27, 42, 1)'), 'dark');
});

test('relative luminance matches the WCAG reference values', () => {
  assert.ok(Math.abs(relativeLuminance([255, 255, 255]) - 1) < 1e-9);
  assert.ok(Math.abs(relativeLuminance([0, 0, 0])) < 1e-9);
  assert.ok(Math.abs(relativeLuminance([13, 27, 42]) - 0.01044) < 5e-4);
  assert.ok(Math.abs(contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-9);
});

// ── The HTML transform ─────────────────────────────────────────────

test('bodies with no inline colour are returned byte-identical', () => {
  const html = '<p>hello</p><pre><code>const a = 1 &lt; 2;</code></pre>';
  assert.equal(normalizeAuthoredColors(html), html);
});

test('a body where nothing is CLASSIFIED is returned byte-identical too', () => {
  // Stronger than the guard above: these all reach the parser (they contain a
  // colour-ish declaration) but classify to nothing, so they must come back as
  // the original bytes rather than a re-serialised equivalent. Without this,
  // `<br>` quietly becomes `<br />` for articles the transform had no opinion
  // about — churn with no benefit.
  for (const html of [
    '<p style="background: url(a.png) no-repeat">x<br>y</p>',
    '<p style="color: var(--x)">x<br>y</p>',
    '<p style="color: rgba(13, 27, 42, 0.3)">x<br>y</p>',
    '<p style="background-color: transparent">x<br>y</p>',
  ]) {
    assert.equal(normalizeAuthoredColors(html), html, `expected byte-identical for: ${html}`);
  }
});

test('code blocks are untouched even inside a body that IS transformed', () => {
  const code = '<pre><code>const a = 1 &lt; 2;\nif (a) { b(); }</code></pre>';
  const out = normalizeAuthoredColors(
    `<p><span style="color: rgb(13, 27, 42);">t</span></p>${code}`
  );
  assert.ok(out.includes(code), 'code block must survive verbatim');
  assert.ok(out.includes('1 &lt; 2;'), 'entities must not be decoded or double-encoded');
});

test('the authored declaration is never removed, only annotated', () => {
  const out = normalizeAuthoredColors('<span style="color: rgb(13, 27, 42);">x</span>');
  assert.ok(out.includes('data-authored-fg="dark"'));
  assert.ok(/color\s*:\s*rgb\(13, 27, 42\)/.test(out), 'declaration must still be present');
});

test('nested coloured spans are classified independently', () => {
  const out = normalizeAuthoredColors(
    '<span style="color: rgb(13, 27, 42);">a<span style="color:#4de6e6">b</span>c</span>'
  );
  assert.ok(out.includes('data-authored-fg="dark"'), 'the navy fails on the dark page');
  assert.ok(out.includes('data-authored-fg="light"'), 'the cyan fails on white');
});

test('a semicolon inside a quoted attribute is not mis-parsed', () => {
  // The reason this uses a parser and not a regex.
  const out = normalizeAuthoredColors('<a title="a;b" style="color: rgb(13, 27, 42);">x</a>');
  assert.ok(out.includes('title="a;b"'));
  assert.ok(out.includes('data-authored-fg="dark"'));
});

test('the last declaration wins, matching the CSS cascade', () => {
  const out = normalizeAuthoredColors('<i style="color:#fff;color:#0D1B2A">x</i>');
  assert.ok(out.includes('data-authored-fg="dark"'));
  assert.ok(!out.includes('data-authored-fg="light"'));
});

test('background-color is classified on its own axis', () => {
  const out = normalizeAuthoredColors('<mark style="background-color: #0D1B2A;">x</mark>');
  assert.ok(out.includes('data-authored-bg="dark"'));
  assert.ok(!out.includes('data-authored-fg='));
});

test('the `background` shorthand counts only when it is a bare colour', () => {
  assert.ok(
    normalizeAuthoredColors('<p style="background: #0D1B2A">x</p>').includes('data-authored-bg="dark"')
  );
  assert.ok(
    !normalizeAuthoredColors('<p style="background: url(a.png) no-repeat">x</p>').includes('data-authored-bg')
  );
});

test('output is deterministic — a hydration-safety requirement', () => {
  const html = '<p><span style="color: rgb(13, 27, 42);">a</span>'
    + '<span style="color:#C62828">b</span>&nbsp;&mdash;</p>';
  const runs = new Set(Array.from({ length: 25 }, () => normalizeAuthoredColors(html)));
  assert.equal(runs.size, 1);
});

test('empty and nullish bodies are handled without throwing', () => {
  assert.equal(normalizeAuthoredColors(''), '');
  assert.equal(normalizeAuthoredColors(null), '');
  assert.equal(normalizeAuthoredColors(undefined), '');
});

test('CONTROL: the classifier is capable of returning each verdict', () => {
  // If any bucket became unreachable, the tests above could pass vacuously.
  assert.equal(classifyColor('#0D1B2A'), 'dark');
  assert.equal(classifyColor('#C62828'), 'mid');
  assert.equal(classifyColor('#FFFFFF'), 'light');
  assert.equal(classifyColor('var(--x)'), null);
});

/**
 * ── LIGHTNESS ADJUSTMENT — hue preserved, legibility gained ────────
 *
 * The old behaviour was a keep/discard verdict: a failing colour was flattened
 * to the prose ink, throwing away the colour the author chose. Now the failing
 * theme gets a replacement that holds HSL hue and saturation and moves only
 * lightness until it clears the 3:1 floor.
 *
 * HUE TOLERANCE — two tiers, both measured in OKLCH (HSL hue is held exactly
 * by construction, but HSL is not perceptually uniform, so "same HSL hue" is
 * not "same perceived hue"):
 *
 *   UNIVERSAL  <= 12 deg, for any colour at any hue. Sized by the known
 *              worst case: HSL lightening drags saturated blues toward violet.
 *              #0000FF measures 9.14 deg and #4000FF 10.57 deg. Named hue
 *              sectors in OKLCH span roughly 40-60 deg, so 12 keeps every
 *              adjustment inside its own colour family — blue stays blue.
 *   CORPUS     <= 4 deg, for the colours actually in the article corpus. The
 *              measured maximum there is 3.09 deg, so this is the tight guard
 *              that catches a regression on real content rather than on a
 *              synthetic edge.
 *
 * A JND for hue is roughly 1-2 deg, so 12 deg IS perceptible on a large flat
 * area — it is a bound on "still recognisably the same colour", not on
 * "indistinguishable".
 */
const HUE_TOLERANCE_UNIVERSAL = 12;
const HUE_TOLERANCE_CORPUS = 4;
const chromaOf = (rgb) => { const [, a, b] = rgbToOklab(rgb); return Math.hypot(a, b); };

// Every distinct authored colour in the live corpus, with its measured role.
const CORPUS = [
  ['rgb(77, 153, 230)', 'light'],
  ['rgb(77, 230, 230)', 'light'],
  ['rgb(13, 27, 42)', 'dark'],
  ['rgb(77, 77, 230)', 'dark'],
  ['rgb(25, 181, 254)', 'light'],
  ['rgb(36, 207, 207)', 'light'],
];

for (const [value, expectedMode] of CORPUS) {
  test(`corpus colour ${value} is adjusted for ${expectedMode} and clears the floor`, () => {
    const r = resolveAuthoredColor(value);
    assert.ok(r, `${value} should need an adjustment`);
    assert.equal(r.mode, expectedMode);
    const bg = expectedMode === 'dark' ? PAGE_BG_DARK : PAGE_BG_LIGHT;
    const after = expectedMode === 'dark' ? r.dark : r.light;
    assert.ok(
      contrastRatio(after, bg) >= MIN_CONTRAST,
      `${value} -> ${after} is only ${contrastRatio(after, bg).toFixed(2)}:1`
    );
  });

  test(`corpus colour ${value} keeps its hue within ${HUE_TOLERANCE_CORPUS} deg`, () => {
    const r = resolveAuthoredColor(value);
    const before = parseColor(value).slice(0, 3);
    const after = r.mode === 'dark' ? r.dark : r.light;
    const d = hueDelta(before, after);
    assert.ok(
      d <= HUE_TOLERANCE_CORPUS,
      `${value} drifted ${d.toFixed(2)} deg in OKLCH — past the ${HUE_TOLERANCE_CORPUS} deg corpus tolerance`
    );
  });
}

/**
 * THE HUE-DRIFT CONTROL. Swept across the whole hue circle, so it constrains
 * the algorithm rather than the six colours that happen to be in the corpus.
 * An adjustment that over-corrects — scaling RGB channels, or nudging hue to
 * reach the floor faster — blows past the tolerance here.
 */
test(`no adjustment drifts more than ${HUE_TOLERANCE_UNIVERSAL} deg at any hue`, () => {
  const offenders = [];
  for (let h = 0; h < 360; h += 5) {
    for (const [s, l] of [[100, 50], [70, 40], [90, 60], [50, 30]]) {
      const rgb = hslToRgb(h, s, l);
      const r = resolveAuthoredColor(
        '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('')
      );
      if (!r) continue;
      const after = r.mode === 'dark' ? r.dark : r.light;
      // An achromatic colour has no hue to preserve; OKLCH hue is undefined
      // there and reports noise. Assert it stays achromatic instead.
      if (chromaOf(rgb) < 0.01) {
        assert.ok(chromaOf(after) < 0.02, `achromatic input gained chroma: ${rgb} -> ${after}`);
        continue;
      }
      const d = hueDelta(rgb, after);
      if (d > HUE_TOLERANCE_UNIVERSAL) {
        offenders.push(`hsl(${h},${s}%,${l}%) drifted ${d.toFixed(2)} deg`);
      }
    }
  }
  assert.deepEqual(offenders, [], `hue drift beyond tolerance:\n  ${offenders.join('\n  ')}`);
});

test('every adjustment across the hue circle actually clears the floor', () => {
  // The tolerance test above would be satisfiable by not adjusting at all.
  const misses = [];
  for (let h = 0; h < 360; h += 5) {
    const rgb = hslToRgb(h, 100, 50);
    const hex = '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
    const r = resolveAuthoredColor(hex);
    if (!r) continue;
    const bg = r.mode === 'dark' ? PAGE_BG_DARK : PAGE_BG_LIGHT;
    const after = r.mode === 'dark' ? r.dark : r.light;
    if (contrastRatio(after, bg) < MIN_CONTRAST) misses.push(hex);
  }
  assert.deepEqual(misses, [], `these never reached ${MIN_CONTRAST}:1: ${misses}`);
});

test('the adjustment is minimal — it stops at the floor, it does not overshoot', () => {
  // Moving further than necessary is its own defect: it costs chroma and
  // drifts hue for no legibility gain.
  for (const [value] of CORPUS) {
    const r = resolveAuthoredColor(value);
    const bg = r.mode === 'dark' ? PAGE_BG_DARK : PAGE_BG_LIGHT;
    const after = r.mode === 'dark' ? r.dark : r.light;
    const got = contrastRatio(after, bg);
    assert.ok(got >= MIN_CONTRAST, `${value} under floor`);
    assert.ok(got < MIN_CONTRAST + 0.35, `${value} overshot to ${got.toFixed(2)}:1`);
  }
});

test('the passing theme gets the ORIGINAL colour back, not an adjusted one', () => {
  const r = resolveAuthoredColor('rgb(77, 230, 230)');   // fails light only
  assert.deepEqual(r.dark, r.original, 'dark already cleared the floor — leave it alone');
  assert.notDeepEqual(r.light, r.original, 'light is the theme that needed help');
});

test('both per-theme values are emitted so each mode has something to read', () => {
  const out = normalizeAuthoredColors('<span style="color: rgb(13, 27, 42)">x</span>');
  assert.match(out, /--authored-fg-light:#[0-9a-f]{6}/);
  assert.match(out, /--authored-fg-dark:#[0-9a-f]{6}/);
});

test('background-color is adjusted on its own axis', () => {
  const out = normalizeAuthoredColors('<mark style="background-color: #0D1B2A;">x</mark>');
  assert.match(out, /data-authored-bg="dark"/);
  assert.match(out, /--authored-bg-dark:#[0-9a-f]{6}/);
  assert.ok(!out.includes('--authored-fg'), 'no foreground was declared');
});

test('the backgrounds are injectable, so the adjustment tracks the tokens', () => {
  const value = '#4de6e6';
  const againstWhite = resolveAuthoredColor(value);
  const againstGrey = resolveAuthoredColor(value, { lightBg: [128, 128, 128] });
  assert.notDeepEqual(
    againstWhite.light, againstGrey.light,
    'a different light background must produce a different replacement'
  );
});

test('adjustLightnessForContrast returns the input untouched when it passes', () => {
  const rgb = [198, 40, 40];
  assert.equal(adjustLightnessForContrast(rgb, PAGE_BG_LIGHT), rgb);
});
