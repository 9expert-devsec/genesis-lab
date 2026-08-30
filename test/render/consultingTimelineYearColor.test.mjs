import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import ConsultingSection from '@/components/portfolio/ConsultingSection';

/**
 * Teeny ticket, round 3 (rounds 1 and 2 fixed dark mode's collapsed and active
 * colors respectively — see their history for that).
 *
 * Round 3: light mode's collapsed year label used text-[var(--surface-border)]
 * (~1.28:1 on white) — a border/divider var reused as text, the same root
 * cause round 1 fixed on the dark side. The obvious swap targets, the
 * 9e-slate-lt-* family (light mode's declared counterpart to 9e-slate-dp-*),
 * turned out to be a background/border TINT scale, not a text-shade one — every
 * step tops out at 1.78:1 on white (see round 3's report for the full table).
 * Fixed instead with 9e-slate-dp-100 (4.40:1) — a token from the DARK-mode
 * "dp" family reused for a light-mode class, deliberately. text-2xl font-black
 * is WCAG "large text" (≥24px), so 3:1 is the applicable AA floor here, not
 * 4.5:1 — the same large-text point that applied to the active row in round 2.
 * dp-100 clears 3:1 while staying strictly dimmer than the active row's
 * text-9e-slate-dp-50 (5.47:1), which round 1/2 never touched.
 *
 * Contrast figures throughout are computed from the hex values declared in
 * tailwind.config.js / globals.css, per the WCAG relative-luminance formula —
 * this suite has no browser, so nothing here is sampled from a render.
 */

const docOf = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

// activeIdx defaults to 0 (useState(0), no props), so a bare render already
// carries one active row and three collapsed rows — exactly the shapes the
// ticket reported ("2024 - Present" active; "2026", "2026", "Enterprise" collapsed).
const doc = docOf(renderToStaticMarkup(createElement(ConsultingSection)));
const yearLabels = [...doc.querySelectorAll('span[class*="font-black"]')];

function luminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const f = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(hexA, hexB) {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

// Literal, not imported — a change to tailwind.config.js cannot silently
// rewrite what this test believes it is checking.
const HEX = {
  '9e-slate-dp-50': '#5E6A7E',
  '9e-slate-dp-100': '#6E798B',
  '9e-slate-dp-200': '#7E8898',
  '9e-air': '#48B0FF',
};
const DARK_ACTIVE_BG = '#132638';    // dark:bg-9e-card — the active row's own bg
const DARK_COLLAPSED_BG = '#0D1B2A'; // dark:bg-[var(--page-bg)] — collapsed rows carry no highlight
const LIGHT_BG = '#FFFFFF';          // bg-white on <section>; both rows sit on it (collapsed is bg-transparent)

const darkToken = (className) => className.match(/dark:text-([\w-]+)/)?.[1];
// The BASE (non-dark:) text-9e-* token — bounded so it cannot match "dark:text-…"
// (preceded by ':', not whitespace/start) or a size utility like "text-3xl".
const lightToken = (className) => className.match(/(?:^|\s)text-(9e-[\w-]+)(?:\s|$)/)?.[1];

/** The dark-mode ordering claim: both clear AA (4.5:1), and active outranks collapsed. */
function assertDarkOrdering(activeClassName, collapsedClassName) {
  const activeRatio = contrast(HEX[darkToken(activeClassName)], DARK_ACTIVE_BG);
  const collapsedRatio = contrast(HEX[darkToken(collapsedClassName)], DARK_COLLAPSED_BG);
  assert.ok(activeRatio >= 4.5, `active dark contrast ${activeRatio.toFixed(2)} must clear 4.5:1`);
  assert.ok(collapsedRatio >= 4.5, `collapsed dark contrast ${collapsedRatio.toFixed(2)} must clear 4.5:1`);
  assert.ok(
    activeRatio > collapsedRatio,
    `active (${activeRatio.toFixed(2)}) must stay MORE prominent than collapsed (${collapsedRatio.toFixed(2)})`,
  );
}

/**
 * The light-mode ordering claim: both clear the WCAG LARGE-TEXT floor (3:1 —
 * both rows are text-2xl/text-3xl font-black, well past the 18.66px-bold
 * threshold), and active outranks collapsed. Deliberately 3:1, not 4.5:1: see
 * the file header for why the stricter floor doesn't apply to this element.
 */
function assertLightOrdering(activeClassName, collapsedClassName) {
  const activeRatio = contrast(HEX[lightToken(activeClassName)], LIGHT_BG);
  const collapsedRatio = contrast(HEX[lightToken(collapsedClassName)], LIGHT_BG);
  assert.ok(activeRatio >= 3, `active light contrast ${activeRatio.toFixed(2)} must clear the 3:1 large-text floor`);
  assert.ok(collapsedRatio >= 3, `collapsed light contrast ${collapsedRatio.toFixed(2)} must clear the 3:1 large-text floor`);
  assert.ok(
    activeRatio > collapsedRatio,
    `active (${activeRatio.toFixed(2)}) must stay MORE prominent than collapsed (${collapsedRatio.toFixed(2)})`,
  );
}

test('the timeline renders one active year label and three collapsed ones', () => {
  assert.equal(yearLabels.length, 4);
  assert.equal(yearLabels[0].textContent, '2024 - Present');
  assert.deepEqual(yearLabels.slice(1).map((el) => el.textContent), ['2026', '2026', 'Enterprise']);
});

test('dark mode: active and collapsed both clear AA, and active stays the more prominent of the two', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  assert.match(activeClass, /\btext-9e-slate-dp-50\b/); // light-mode base, untouched
  assert.match(activeClass, /\bdark:text-9e-air\b/);
  assert.match(activeClass, /\btext-3xl\b/);

  for (const collapsed of yearLabels.slice(1)) {
    const collapsedClass = collapsed.getAttribute('class');
    assert.match(collapsedClass, /\bdark:text-9e-slate-dp-200\b/);
    assert.match(collapsedClass, /\btext-2xl\b/);
    assert.doesNotMatch(collapsedClass, /\bdark:text-9e-border\b/); // the original faint token
    assertDarkOrdering(activeClass, collapsedClass);
  }
});

test('light mode: active and collapsed both clear the large-text floor, and active stays the more prominent of the two', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  assert.match(activeClass, /\btext-9e-slate-dp-50\b/);
  assert.match(activeClass, /\btext-3xl\b/);

  for (const collapsed of yearLabels.slice(1)) {
    const collapsedClass = collapsed.getAttribute('class');
    assert.match(collapsedClass, /\btext-9e-slate-dp-100\b/);
    assert.match(collapsedClass, /\btext-2xl\b/);
    // the faint border-token-as-text bug this round removes must not come back
    assert.doesNotMatch(collapsedClass, /text-\[var\(--surface-border\)\]/);
    assertLightOrdering(activeClass, collapsedClass);
  }
});

test('control: swapping which row gets which dark treatment reddens the ordering check, then is restored', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  const collapsedClass = yearLabels[1].getAttribute('class');
  const activeToken = darkToken(activeClass);
  const collapsedToken = darkToken(collapsedClass);

  const swappedActive = activeClass.replace(`dark:text-${activeToken}`, `dark:text-${collapsedToken}`);
  const swappedCollapsed = collapsedClass.replace(`dark:text-${collapsedToken}`, `dark:text-${activeToken}`);

  assert.throws(() => assertDarkOrdering(swappedActive, swappedCollapsed));
  // restored: the real, unswapped classes pass again
  assert.doesNotThrow(() => assertDarkOrdering(activeClass, collapsedClass));
});

test('control: swapping which row gets which light treatment reddens the ordering check, then is restored', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  const collapsedClass = yearLabels[1].getAttribute('class');
  const activeToken = lightToken(activeClass);
  const collapsedToken = lightToken(collapsedClass);

  const swappedActive = activeClass.replace(`text-${activeToken}`, `text-${collapsedToken}`);
  const swappedCollapsed = collapsedClass.replace(`text-${collapsedToken}`, `text-${activeToken}`);

  assert.throws(() => assertLightOrdering(swappedActive, swappedCollapsed));
  // restored: the real, unswapped classes pass again
  assert.doesNotThrow(() => assertLightOrdering(activeClass, collapsedClass));
});
