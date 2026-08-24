import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { backgroundStyleFor, backgroundKindFor, backgroundPinFor } from '@/lib/pageBuilder/presets';

/**
 * ROUND 79 — an author's custom colour is verbatim in light and derived in dark.
 *
 * docs/custom-colour-dark-mode.md is the spec. The mechanism has two halves and
 * a test that only checked one would pass on a broken build:
 *
 *   THE RENDERER emits the author's hexes as custom properties plus a
 *   `data-pb-custom-bg` attribute. If it emitted a finished `background-color`
 *   again, dark mode would silently stop working and every markup assertion
 *   about "the colour is present" would still pass.
 *
 *   THE STYLESHEET turns those into a declaration, once per theme. If the dark
 *   rule were deleted the markup would be unchanged and only the rendering
 *   would differ.
 *
 * So both are asserted, and the stylesheet half is read from globals.css rather
 * than from a fixture — a fixture would prove the SHAPE is valid, which it
 * always was.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CSS = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');

/** The author's real stored colours — the ones the doc's table was measured on. */
const HERO = { from: '#f8e7d5', to: '#fefaf5', direction: 'to_bottom_left' };
const FLAT = { from: '#65819f' };

const section = (custom, extra = {}) => ({
  id: 's', type: 'heading', enabled: true,
  content: { text: 'หัวข้อ', level: 'h2' },
  settings: {
    background: 'default', spacingTop: 'none', spacingBottom: 'none',
    backgroundMode: 'custom', backgroundCustom: custom, ...extra,
  },
});
const render = (s) => renderToStaticMarkup(createElement(SectionRenderer, { section: s, depth: 0, resolvedData: {} }));

// ── 1. LIGHT MODE RENDERS WHAT THE AUTHOR TYPED ───────────────────────────

test('the author\'s exact hexes reach the page, unmodified', () => {
  const markup = render(section(HERO));
  for (const hex of [HERO.from, HERO.to]) {
    assert.ok(markup.includes(hex),
      `the author's colour ${hex} is not in the rendered markup at all`);
  }
  assert.match(markup, /data-pb-custom-bg="gradient"/,
    'the section is not marked as carrying a custom gradient, so no rule will paint it');
  assert.match(markup, /--pb-cbg-dir\s*:\s*to bottom left/,
    'the direction the author chose did not reach the page');
});

test('the LIGHT rule paints the author\'s value with no transform on it', () => {
  /**
   * This is the "light mode is unchanged" claim, checked where it is decided.
   * The light declarations must read the variables STRAIGHT — any `oklch(`,
   * `calc(` or filter in them would mean the author's colour is being altered
   * in the mode where it must not be.
   */
  const flat = /\[data-pb-custom-bg="flat"\]\s*\{([^}]*)\}/.exec(CSS);
  const grad = /\[data-pb-custom-bg="gradient"\]\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(flat, 'globals.css has no light rule for a flat custom background');
  assert.ok(grad, 'globals.css has no light rule for a custom gradient');

  assert.match(flat[1], /background-color:\s*var\(--pb-cbg-from\)/);
  assert.match(grad[1], /linear-gradient\(\s*var\(--pb-cbg-dir\),\s*var\(--pb-cbg-from\),\s*var\(--pb-cbg-to\)\s*\)/);
  for (const [name, body] of [['flat', flat[1]], ['gradient', grad[1]]]) {
    assert.equal(/oklch\(/.test(body), false,
      `the LIGHT ${name} rule derives the colour. Light mode must render the bytes the author typed.`);
  }
});

test('CONTROL: applying the derivation in light mode is caught', () => {
  /**
   * The assertion above is an absence check on a regex slice, and would pass
   * against an empty match. This runs the same predicate over a light rule that
   * DOES derive, and requires it to fail.
   */
  const wouldBeWrong = 'background-color: oklch(from var(--pb-cbg-from) calc(1 - l * 0.782314) c h);';
  assert.ok(/oklch\(/.test(wouldBeWrong), 'the control string stopped being a control');
  const flat = /\[data-pb-custom-bg="flat"\]\s*\{([^}]*)\}/.exec(CSS)[1];
  assert.notEqual(flat.trim(), wouldBeWrong.trim());
});

// ── 2. DARK MODE DERIVES ──────────────────────────────────────────────────

test('the DARK rule derives both stops through oklch, and is guarded', () => {
  const supports = /@supports \(background-color: oklch\(from white calc\(l\) c h\)\)\s*\{/.exec(CSS);
  assert.ok(supports, '@supports guard is gone — where relative colour syntax is unsupported the '
    + 'declaration becomes invalid at computed-value time and the surface goes TRANSPARENT, '
    + 'which is worse than the pre-round-79 behaviour it should degrade to');

  const darkFlat = /\.dark \[data-pb-custom-bg="flat"\]:not\(\[data-pb-bg-pin\]\)\s*\{([^}]*)\}/.exec(CSS);
  const darkGrad = /\.dark \[data-pb-custom-bg="gradient"\]:not\(\[data-pb-bg-pin\]\)\s*\{([^}]*)\}/.exec(CSS);
  assert.ok(darkFlat, 'no dark rule for a flat custom background');
  assert.ok(darkGrad, 'no dark rule for a custom gradient');

  // The anchored formula, with its constant. 0.782314 = 1 - L(#0D1B2A).
  const FORMULA = /oklch\(from var\(--pb-cbg-(?:from|to)\)\s*calc\(1 - l \* 0\.782314\) c h\)/g;
  assert.equal((darkFlat[1].match(FORMULA) ?? []).length, 1,
    'the dark flat rule does not derive its one stop with the anchored formula');
  assert.equal((darkGrad[1].match(FORMULA) ?? []).length, 2,
    'the dark gradient rule must derive BOTH stops — deriving one collapses the gradient');
});

test('CONTROL: a rule left pinned to the raw variable is named', () => {
  /**
   * If someone "simplified" the dark rule back to `var(--pb-cbg-from)`, the
   * markup would be unchanged and only the rendering would differ. The formula
   * check above must reject that string.
   */
  const FORMULA = /oklch\(from var\(--pb-cbg-(?:from|to)\)\s*calc\(1 - l \* 0\.782314\) c h\)/;
  assert.equal(FORMULA.test('background-color: var(--pb-cbg-from);'), false,
    'the formula check accepts an underived value, so it cannot tell derived from pinned');
  assert.equal(FORMULA.test('oklch(from var(--pb-cbg-from) calc(1 - l * 0.5) c h)'), false,
    'the formula check accepts a different constant, so the measured table would not describe '
    + 'what ships');
});

// ── 3. THE PIN ────────────────────────────────────────────────────────────

test('a PINNED section opts out, in the markup and in the selector', () => {
  const pinned = section(HERO, { backgroundPin: true });
  const markup = render(pinned);
  assert.match(markup, /data-pb-bg-pin/,
    'a pinned section carries no pin attribute, so the dark rule will still derive it');
  // The colour still reaches the page — pinning changes when it is derived,
  // not whether the author's choice arrives.
  assert.ok(markup.includes(HERO.from));
  // And the dark selectors exclude it.
  assert.match(CSS, /\.dark \[data-pb-custom-bg="flat"\]:not\(\[data-pb-bg-pin\]\)/);
  assert.match(CSS, /\.dark \[data-pb-custom-bg="gradient"\]:not\(\[data-pb-bg-pin\]\)/);
});

test('CONTROL: an UNPINNED section carries no pin attribute', () => {
  // Without this, the assertion above could be matching an attribute that is
  // always present, which would mean nothing is ever derived.
  const markup = render(section(HERO));
  assert.equal(/data-pb-bg-pin/.test(markup), false,
    'every section carries the pin attribute, so nothing is ever derived');
  assert.equal(backgroundPinFor(section(HERO).settings), undefined);
  assert.equal(backgroundPinFor(section(HERO, { backgroundPin: true }).settings), '');
});

test('ABSENT means derive, and that is the round-79 decision', () => {
  /**
   * Round 56 §H's rule is that an absent value renders what it rendered before.
   * This round breaks it deliberately: the point of the round is to change what
   * stored sections render, the author asked for it by name, and "absent means
   * pinned" would ship a feature that does nothing until every section is found
   * and re-edited. Pinned here so the break stays a decision.
   */
  const s = section(HERO).settings;
  assert.equal('backgroundPin' in s, false, 'the fixture already pins — this asserts nothing');
  assert.equal(backgroundPinFor(s), undefined,
    'an absent backgroundPin now emits the pin attribute, so absent means PINNED and the '
    + 'round-79 default has been reversed');
});

// ── 4. THE RESOLVERS ──────────────────────────────────────────────────────

test('the resolvers emit variables, not a finished declaration', () => {
  const grad = backgroundStyleFor(section(HERO).settings);
  assert.deepEqual(grad, {
    '--pb-cbg-from': '#f8e7d5', '--pb-cbg-to': '#fefaf5', '--pb-cbg-dir': 'to bottom left',
  });
  assert.equal(backgroundKindFor(section(HERO).settings), 'gradient');

  // One stop and two stops stay different statements: the flat case sets no
  // `--pb-cbg-to` at all, and the stylesheet selects on the KIND.
  const flat = backgroundStyleFor(section(FLAT).settings);
  assert.deepEqual(flat, { '--pb-cbg-from': '#65819f' });
  assert.equal(backgroundKindFor(section(FLAT).settings), 'flat');

  // A section with no custom background is untouched — nothing emitted.
  const plain = { ...section(HERO), settings: { background: 'default' } };
  assert.equal(backgroundStyleFor(plain.settings), undefined);
  assert.equal(backgroundKindFor(plain.settings), undefined);
  assert.equal(/data-pb-custom-bg/.test(render(plain)), false,
    'a section with no custom background emits the attribute anyway');
});
