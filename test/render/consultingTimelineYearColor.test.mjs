import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import ConsultingSection from '@/components/portfolio/ConsultingSection';

/**
 * Teeny ticket, round 2: round 1 fixed the collapsed-row year label's dark-mode
 * contrast (1.24:1 → 4.86:1 via dark:text-9e-slate-dp-200) but left the ACTIVE
 * row's color untouched at text-9e-slate-dp-50 with no dark: override — 2.82:1
 * against the active card's dark background, LOWER than the collapsed rows it
 * is supposed to outrank. Fixed by giving the active row its own dark:
 * override (dark:text-9e-air, 6.56:1) — the same "dark backgrounds only" brand
 * accent this component already uses for its dark-mode tag treatment (see
 * dark:text-9e-air on the tag pill below in ConsultingSection.jsx). Light mode
 * was never touched by either round: text-9e-slate-dp-50 already clears AA
 * there (5.47:1) and stays the base (non-dark:) class.
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
  '9e-slate-dp-200': '#7E8898',
  '9e-air': '#48B0FF',
};
const DARK_ACTIVE_BG = '#132638';    // dark:bg-9e-card — the active row's own bg
const DARK_COLLAPSED_BG = '#0D1B2A'; // dark:bg-[var(--page-bg)] — collapsed rows carry no highlight

const darkToken = (className) => className.match(/dark:text-([\w-]+)/)?.[1];

/** The ordering claim itself: both clear AA, and active outranks collapsed. */
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

test('light mode: the active row still clears AA (unchanged by either round)', () => {
  const activeClass = yearLabels[0].getAttribute('class');
  assert.match(activeClass, /\btext-9e-slate-dp-50\b/);
  const ratio = contrast(HEX['9e-slate-dp-50'], '#FFFFFF');
  assert.ok(ratio >= 4.5, `light active contrast ${ratio.toFixed(2)} must clear 4.5:1`);
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
