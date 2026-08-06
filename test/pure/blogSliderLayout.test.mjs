import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BLOG_SLIDER_BREAKPOINTS,
  clampSlideIndex,
  perPageForWidth,
} from '@/lib/blogSliderLayout';
import { readSourceForScanning } from '../sourceScan.mjs';

// The landing slider's density, and keeping its index legal when that changes.
//
// ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
// BlogSlider showed 4 cards per view at EVERY width from md up, while the
// static grid it stands in for (used whenever there are <= 4 featured articles)
// went 2 -> 3 -> 4 across the same breakpoints. Five featured articles
// therefore rendered at roughly double the density of four, in the same
// section, and the md card was 172px — too narrow for the title and excerpt it
// already renders, never mind a chip.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

test('cards per view follows the grid it stands in for', () => {
  // Exact boundaries, not "roughly": an off-by-one here changes the layout for
  // every viewport sitting on a breakpoint.
  assert.equal(perPageForWidth(1279), 3, 'one pixel below xl is still 3');
  assert.equal(perPageForWidth(1280), 4, 'xl is 4 — matching xl:grid-cols-4');
  assert.equal(perPageForWidth(1023), 2, 'one pixel below lg is still 2');
  assert.equal(perPageForWidth(1024), 3, 'lg is 3 — matching lg:grid-cols-3');
  assert.equal(perPageForWidth(768), 2, 'md is 2 — matching sm:grid-cols-2');
  assert.equal(perPageForWidth(0), 2, 'total below md, where the slider is display:none anyway');
});

test('the JS breakpoints equal the ones Tailwind compiles the widths from', () => {
  // TWO SOURCES THAT HAVE TO AGREE. The card widths come from Tailwind's `lg:`
  // and `xl:` variants; the arrow arithmetic comes from this module. A silent
  // divergence shows up as an arrow that appears one breakpoint early and
  // nothing else — so the config is read here rather than transcribed.
  const cfg = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
  const screens = cfg.match(/screens:\s*\{([\s\S]*?)\}/)[1];
  const px = (name) => Number(screens.match(new RegExp(`${name}:\\s*'(\\d+)px'`))[1]);
  assert.equal(BLOG_SLIDER_BREAKPOINTS.lg, px('lg'), 'lg matches tailwind.config');
  assert.equal(BLOG_SLIDER_BREAKPOINTS.xl, px('xl'), 'xl matches tailwind.config');
  // Non-vacuity: the config really does declare them, and they are not equal.
  assert.equal(px('lg'), 1024);
  assert.equal(px('xl'), 1280);
});

test('the index is clamped when the page count shrinks under it', () => {
  // 6 articles. At md (perPage 2) the last page is index 4; widening to xl
  // (perPage 4) makes the last page index 2, and an unclamped 4 scrolls the
  // track to a blank slide.
  assert.equal(clampSlideIndex(4, 6, 4), 2, 'widening pulls the reader back to the real last page');
  assert.equal(clampSlideIndex(4, 6, 2), 4, 'and at the narrower width that index is legal');
  // Narrowing is the safe direction — maxIndex grows — but the clamp is total
  // rather than reasoning about which way can bite.
  assert.equal(clampSlideIndex(2, 6, 2), 2);
  // Degenerate: fewer items than a page.
  assert.equal(clampSlideIndex(3, 2, 4), 0, 'nothing to page through');
  assert.equal(clampSlideIndex(-1, 6, 4), 0, 'never negative');
});

test('CONTROL: without the clamp the reader lands past the end', () => {
  // The defect, replicated. Both versions render; only one renders content.
  const unclamped = (i) => i;
  assert.equal(unclamped(4), 4, 'the raw index survives the resize');
  assert.equal(clampSlideIndex(4, 6, 4), 2, 'the clamped one does not');
  // …and 4 really is past the end at perPage 4, so this is a live case.
  assert.ok(4 > Math.max(0, 6 - 4), 'index 4 exceeds maxIndex 2');
});

test('the slider takes its widths from CSS, not from JS', () => {
  // THE HYDRATION RULE. If the card width were computed from a JS perPage, the
  // server would render one number and the client another the moment the effect
  // ran. Responsive classes mean the layout is correct on the first paint with
  // no JavaScript at all, and the JS value is only ever used for the arrows.
  const section = src('src/app/_components/home/BlogSection.jsx');
  assert.match(section, /w-\[calc\(\(100%_-_16px\)\/2\)\]/, 'md width is a class');
  assert.match(section, /lg:w-\[calc\(\(100%_-_32px\)\/3\)\]/, 'lg width is a class');
  assert.match(section, /xl:w-\[calc\(\(100%_-_48px\)\/4\)\]/, 'xl width is a class');
  assert.ok(
    !/width: `calc\(\(100% - \$\{/.test(section),
    'the old JS-computed inline width is gone — that was the hydration hazard',
  );
  // The initial JS value is a constant, so server and client agree on render 1.
  assert.match(section, /useState\(4\)/, 'perPage starts from a fixed SSR value');
  assert.match(section, /perPageForWidth\(window\.innerWidth\)/, 'and is corrected in an effect');
  assert.match(section, /clampSlideIndex\(i, blogs\.length, perPage\)/, 'with the index clamped on change');
});
