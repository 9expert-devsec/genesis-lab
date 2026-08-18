import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { readSource } from '../sourceScan.mjs';
import { HeroSection } from '@/app/_components/home/HeroSection';
import tailwindConfig from '../../tailwind.config.js';

/**
 * The hero's ambient motion — the decorative sky and the floating mascot.
 *
 * WHAT THIS FILE CANNOT SEE, and it is nearly everything a person means by
 * "does the animation work":
 *   · MOTION. jsdom runs no animations and computes no layout. Nothing here
 *     observes an element move, a streak cross the frame, or a star fade.
 *   · SMOOTHNESS or FRAME COST. Measured once, by hand, in a real browser
 *     (60fps at 1440 and at 390); no test re-runs that and none can.
 *   · WHETHER IT LOOKS GOOD. Timing, density and subtlety are judgement.
 *   · Whether the compiled stylesheet really contains the rules. This file
 *     checks that every class RESOLVES TO A CONFIG ENTRY, which is the source-
 *     level proxy; the compiled-CSS evidence is in the round's report.
 *
 * What it does pin is the set of properties that are cheap to break silently:
 * the decoration staying inert (aria-hidden, pointer-events-none), the budget,
 * the animated properties, the reduced-motion kill switch, and — the one that
 * matters most — the hero staying a server component.
 */

const html = renderToStaticMarkup(createElement(HeroSection, {}));
const doc = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;

const HERO = readSource('src/app/_components/home/HeroSection.jsx');
const GLOBALS = readSource('src/app/globals.css');
const ANIM = tailwindConfig.theme.extend.animation;
const KEYFRAMES = tailwindConfig.theme.extend.keyframes;

/** Every `animate-*` class token in the rendered markup. */
function animatedClasses(document) {
  const out = [];
  for (const el of document.querySelectorAll('[class]')) {
    for (const c of el.className.toString().split(/\s+/)) {
      if (c.startsWith('animate-')) out.push({ cls: c, el });
    }
  }
  return out;
}

const ANIMATED = animatedClasses(doc);

// ── The decoration stays inert ──────────────────────────────────────────────

test('the sky layer is hidden from assistive tech and cannot take a click', () => {
  const layer = doc.querySelector('[data-hero-motion="sky"]');
  assert.ok(layer, 'the ambient layer is gone');
  assert.equal(layer.getAttribute('aria-hidden'), 'true', 'the layer is announced by screen readers');
  assert.match(
    layer.className,
    /(^|\s)pointer-events-none(\s|$)/,
    'a full-bleed decorative layer without pointer-events-none swallows clicks on the CTAs — ' +
    'this repo has already shipped exactly that on a hero'
  );
  // It is inside the hero section, which is the element that clips it.
  const section = doc.querySelector('section');
  assert.ok(section.contains(layer), 'the layer escaped the hero section');
  assert.match(section.className, /(^|\s)overflow-hidden(\s|$)/, 'the hero stopped clipping its decoration');
});

test('the CTAs are not inside the decorative layer', () => {
  // The layer covers them (inset-0), so the only thing keeping them clickable
  // is pointer-events-none above. This pins that they are siblings, not
  // children — a child would inherit the dead pointer events.
  const layer = doc.querySelector('[data-hero-motion="sky"]');
  for (const a of doc.querySelectorAll('a')) {
    assert.equal(layer.contains(a), false, `a CTA (${a.getAttribute('href')}) is inside the decorative layer`);
  }
});

test('every animated element is decoration, and there are at most eight', () => {
  assert.ok(ANIMATED.length > 0, 'nothing is animated at all');
  assert.ok(
    ANIMATED.length <= 8,
    `${ANIMATED.length} animated elements — the budget is 8. Each one is a compositor ` +
    'layer and a wake-up per frame.'
  );
  const layer = doc.querySelector('[data-hero-motion="sky"]');
  for (const { cls, el } of ANIMATED) {
    const isDecor = layer.contains(el) || el.getAttribute('data-hero-motion') === 'mascot';
    assert.ok(isDecor, `${cls} is on an element that is neither in the sky layer nor the mascot`);
  }
});

test('nothing carries will-change — the budget allows 2 and this uses 0', () => {
  // Chrome composites a running transform/opacity animation without the hint;
  // six speculative layers would cost memory for a repaint that is not
  // happening. If a future change adds it, this is where the count is capped.
  const hinted = ANIMATED.filter(({ el }) => /will-change/.test(el.className.toString()));
  assert.ok(hinted.length <= 2, `${hinted.length} elements hint will-change; at most 2 are allowed`);
});

test('every decorative element carries the reduced-motion hook', () => {
  const layer = doc.querySelector('[data-hero-motion="sky"]');
  assert.equal(doc.querySelectorAll('[data-hero-motion="streak"]').length, 3, 'expected three streaks');
  assert.ok(doc.querySelector('[data-hero-motion="mascot"]'), 'the mascot lost its motion hook');
  // Every animated element is covered by `[data-hero-motion], [data-hero-motion] *`.
  for (const { cls, el } of ANIMATED) {
    const covered = el.hasAttribute('data-hero-motion') || el.closest('[data-hero-motion]');
    assert.ok(covered, `${cls} sits outside the reduced-motion selector and would keep moving`);
  }
  assert.ok(layer.querySelector('span'), 'the layer renders no decoration');
});

// ── Every class resolves to a real rule ─────────────────────────────────────

test('every animate-* class in the markup is a declared utility', () => {
  // THE FAILURE THIS EXISTS FOR: a class that is in the markup but generates no
  // CSS. This repo shipped one, with 3325 green tests, because every one of
  // them asserted the class STRING was present and none asserted a RULE was.
  // Config membership is the source-level proxy; the compiled stylesheet was
  // checked by hand in the same round.
  for (const { cls } of ANIMATED) {
    const key = cls.replace(/^animate-/, '');
    assert.ok(
      Object.prototype.hasOwnProperty.call(ANIM, key),
      `${cls} has no entry in tailwind.config theme.extend.animation → it emits NO CSS`
    );
  }
});

test('every declared animation points at a keyframe that exists', () => {
  for (const [name, shorthand] of Object.entries(ANIM)) {
    const keyframeName = shorthand.split(/\s+/)[0];
    assert.ok(
      Object.prototype.hasOwnProperty.call(KEYFRAMES, keyframeName),
      `animation "${name}" references @keyframes ${keyframeName}, which is not declared`
    );
  }
});

test('the keyframes animate ONLY transform and opacity', () => {
  // Anything else — top/left/width/height/filter/box-shadow — forces layout or
  // a paint of the 2880px background photo on every frame.
  const allowed = new Set(['transform', 'opacity']);
  for (const [name, steps] of Object.entries(KEYFRAMES)) {
    for (const [offset, decls] of Object.entries(steps)) {
      for (const prop of Object.keys(decls)) {
        assert.ok(
          allowed.has(prop),
          `@keyframes ${name} ${offset} animates "${prop}" — only transform and opacity are allowed`
        );
      }
    }
  }
});

test('the mascot drifts vertically only, and never resizes', () => {
  const float = KEYFRAMES['hero-float'];
  assert.ok(float, 'the float keyframe is gone');
  for (const [offset, decls] of Object.entries(float)) {
    const t = decls.transform ?? '';
    assert.ok(!/scale/.test(t), `float ${offset} scales the mascot`);
    const m = t.match(/translate3d\(\s*([^,]+),\s*([^,]+),/);
    assert.ok(m, `float ${offset} is not a translate3d`);
    assert.equal(m[1].trim(), '0', `float ${offset} drifts horizontally — the measured clearance to the copy is 49px`);
    const y = parseFloat(m[2]);
    assert.ok(Math.abs(y) <= 8, `float ${offset} moves ${y}px; the brief is 6-8px`);
    // DOWNWARD (or zero), never up: the moon's painted bottom is flush with the
    // hero's lower boundary and lifting it opens a gap under a cut edge.
    assert.ok(y >= 0, `float ${offset} lifts the mascot by ${-y}px, exposing its cut bottom edge`);
  }
});

/**
 * An interpolation INSIDE an animation class token — `animate-9e-${x}-a`.
 *
 * The pattern stops at the first whitespace or quote, so it fires only when the
 * `${` lands within the class name itself; `` `animate-9e-float ${extra}` `` is
 * a complete literal followed by an unrelated expression and is not flagged.
 *
 * WRITTEN THIS WAY BECAUSE THE FIRST VERSION COULD NOT FAIL. It matched
 * `animate-${` literally, so the deliberate break `animate-9e-${'shoot'}-a`
 * sailed past it — and nothing else in this file can see that break either:
 * the rendered markup still reads `animate-9e-shoot-a`, which IS a declared
 * utility, so the config-membership test passes too. Tailwind never sees the
 * literal, emits no rule, and the element simply does not move.
 */
const INTERPOLATED_ANIMATE = /animate-[^\s`'"]*\$\{/;

test('no animation class is assembled by interpolation', () => {
  assert.ok(
    !INTERPOLATED_ANIMATE.test(HERO.code),
    'an interpolated animation class emits markup and no CSS — nothing else here can see it'
  );
  assert.ok(!/animate-[^\s`'"]*'\s*\+/.test(HERO.code), 'an animation class built by concatenation');
});

test('CONTROL: the interpolation probe fires on the real shape', () => {
  // Both the break this file was tested with and the plainer form, and NOT on
  // the two legitimate shapes.
  assert.equal(INTERPOLATED_ANIMATE.test("`animate-9e-${'shoot'}-a absolute`"), true);
  assert.equal(INTERPOLATED_ANIMATE.test('`animate-${name}`'), true);
  assert.equal(INTERPOLATED_ANIMATE.test('`animate-9e-float ${extra}`'), false);
  assert.equal(INTERPOLATED_ANIMATE.test('"animate-9e-float"'), false);
});

// ── Reduced motion ──────────────────────────────────────────────────────────

test('reduced motion switches the decoration OFF, not slower', () => {
  // Read RAW: the subject is a CSS rule, and the scrubber would keep it, but
  // the surrounding explanation is a comment — see test/run.mjs on the one
  // sanctioned exception for comment-subject guards.
  const block = GLOBALS.raw.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n  \}\n/);
  assert.ok(block, 'the reduced-motion media block is gone from globals.css');
  assert.match(
    block[0],
    /\[data-hero-motion\],\s*\n\s*\[data-hero-motion\] \* \{\s*\n\s*animation: none !important;/,
    'the hero decoration is no longer switched off under reduced motion'
  );
  assert.match(
    block[0],
    /\[data-hero-motion='streak'\] \{\s*\n\s*opacity: 0 !important;/,
    'with the animation removed a streak falls back to opacity 1 and freezes mid-sky'
  );
});

// ── THE LOAD-BEARING GUARD ──────────────────────────────────────────────────

test('the hero is STILL a server component', () => {
  // The regression that matters: a future starfield done in JavaScript. The
  // general "hero ships no client JS" guard lives in test/fs/heroOverlayOptIn;
  // this one is stated again here, in the decoration's own file, because the
  // decoration is what would tempt someone to convert the component.
  assert.ok(!HERO.raw.includes("'use client'"), 'HeroSection became a client component');
  assert.ok(!HERO.raw.includes('"use client"'), 'HeroSection became a client component');
  assert.ok(
    !/\buseState\b|\buseEffect\b|\brequestAnimationFrame\b|\bmatchMedia\b/.test(HERO.code),
    'the ambient layer grew a JavaScript driver — it is meant to be CSS only'
  );
  assert.ok(!/<canvas/.test(HERO.code), 'a canvas appeared in the hero');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the markup probes can tell present from absent', () => {
  // Each matcher answers NO on markup that lacks the thing, so a green run is
  // a fact about the component and not about a matcher that matches anything.
  const empty = new JSDOM('<!doctype html><body><div></div></body>').window.document;
  assert.equal(empty.querySelector('[data-hero-motion="sky"]'), null);
  assert.equal(animatedClasses(empty).length, 0);
  // …and the real document is not empty, so the assertions above ran on content.
  assert.equal(ANIMATED.length, 7, 'expected 3 streaks + 3 stars + the mascot');
  assert.ok(html.length > 2000, 'the hero rendered almost nothing — nothing was checked');
});

test('CONTROL: the config probes fail on a broken config, not just on a good one', () => {
  // A dangling keyframe reference is the shape that emits a class with no
  // usable rule; show the check catches it.
  const brokenAnim = { 'x': 'no-such-keyframe 1s linear infinite' };
  const missing = Object.entries(brokenAnim)
    .filter(([, s]) => !Object.prototype.hasOwnProperty.call(KEYFRAMES, s.split(/\s+/)[0]));
  assert.equal(missing.length, 1, 'a dangling keyframe reference is not detected');
  // A banned property inside a keyframe is caught too.
  const banned = { bad: { '50%': { top: '10px' } } };
  const offenders = Object.entries(banned).flatMap(([n, steps]) =>
    Object.entries(steps).flatMap(([o, d]) => Object.keys(d).filter((p) => !['transform', 'opacity'].includes(p))));
  assert.deepEqual(offenders, ['top']);
});

test('CONTROL: the reduced-motion probe reads a rule, not prose', () => {
  // The pattern requires the declaration, so a comment mentioning the selector
  // cannot satisfy it.
  const prose = '@media (prefers-reduced-motion: reduce) {\n  /* [data-hero-motion] should stop */\n  }\n';
  assert.ok(
    !/\[data-hero-motion\],\s*\n\s*\[data-hero-motion\] \* \{\s*\n\s*animation: none !important;/.test(prose),
    'the reduced-motion probe is satisfied by a comment'
  );
});
