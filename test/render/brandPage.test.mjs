import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { readSourceForScanning } from '../sourceScan.mjs';
import BrandPage from '@/app/(public)/brand/page';
import { BRAND_PALETTE } from '@/lib/brand/palette';
import { LOGO_SHAPES, LOGO_VARIANTS, WALLPAPER } from '@/app/(public)/brand/brandContent';

/**
 * What /brand ACTUALLY renders — read off the markup, not off the source.
 *
 * The page is a brand REFERENCE: its whole job is to be the one place a value
 * is copied out of. Two properties make it that, and neither is visible in a
 * screenshot of a single theme:
 *
 *   1. every colour it prints comes from src/lib/brand/palette.js, so it cannot
 *      drift from the theme (the other half of that is the parity guard in
 *      test/pure/brandPalette.test.mjs, which compares palette to
 *      tailwind.config.js);
 *   2. the tile behind each logo variant does NOT follow the theme, because it
 *      is the guideline being demonstrated rather than decoration.
 *
 * (2) is the one that would rot quietly. "Make the page dark-mode consistent"
 * is a reasonable-sounding edit that would put `dark:bg-*` on the tile and make
 * the page teach the opposite of what its own text says — with nothing broken,
 * nothing thrown, and a navy logo invisible on navy.
 *
 * Parsed with JSDOM rather than regexed: nearly every assertion here is about a
 * particular ELEMENT's attributes (is THIS img lazy? does THIS tile carry a
 * dark: class?), and a substring search across the whole document answers a
 * different question.
 */

const doc = () => {
  const html = renderToStaticMarkup(createElement(BrandPage));
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
};

const logoImages = (d) => [...d.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.includes('/files/ci-svg/'));

test('all fifteen logo cards render — three shapes x five inks, from the loop', () => {
  const images = logoImages(doc());
  assert.equal(images.length, LOGO_SHAPES.length * LOGO_VARIANTS.length);
  assert.equal(images.length, 15, 'the guideline ships five inks of three shapes');

  const srcs = images.map((i) => i.getAttribute('src'));
  assert.equal(new Set(srcs).size, 15, 'fifteen DISTINCT files, not one repeated');
  for (const shape of LOGO_SHAPES) {
    for (const variant of LOGO_VARIANTS) {
      assert.ok(
        srcs.includes(`/files/ci-svg/${shape.key}-${variant.key}.svg`),
        `missing ${shape.key}-${variant.key}`,
      );
    }
  }
});

test('THE TILE DOES NOT FLIP WITH THE THEME', () => {
  const d = doc();
  const tiles = logoImages(d).map((img) => img.parentElement);
  assert.equal(tiles.length, 15);

  for (const [index, tile] of tiles.entries()) {
    const variant = LOGO_VARIANTS[index % LOGO_VARIANTS.length];
    const classes = tile.className;

    // Not "the class list happens to contain no dark:" — the assertion is that
    // the tile's GROUND is unconditional. A `dark:` anything on this element is
    // the regression, whatever utility it decorates.
    assert.ok(
      !/(^|\s)dark:/.test(classes),
      `the ${variant.key} tile carries a dark: variant (${classes}). The tile is ` +
        `the guideline being demonstrated: a Cloud Base logo is the knockout and ` +
        `is legible ONLY on dark, a Deep Navy logo ONLY on light. Inverting the ` +
        `tile with the theme shows navy-on-navy and makes the page teach the ` +
        `mistake it forbids three sections further down.`,
    );

    const wantsDark = variant.tile === 'dark';
    assert.equal(
      /(^|\s)bg-9e-navy(\s|$)/.test(classes),
      wantsDark,
      `${variant.key} should sit on a ${variant.tile} tile`,
    );
    assert.equal(
      /(^|\s)bg-white(\s|$)/.test(classes),
      !wantsDark,
      `${variant.key} should sit on a ${variant.tile} tile`,
    );
  }
});

test('the tile assignment is the guideline pairing, not an alternating pattern', () => {
  // Named explicitly so a future edit that "tidies" the list into light/dark/
  // light/dark has to argue with this line rather than with a loop.
  const byKey = Object.fromEntries(LOGO_VARIANTS.map((v) => [v.key, v.tile]));
  assert.deepEqual(byKey, {
    nineblue: 'light',
    deepnavy: 'light',
    cloud: 'dark',
    statedeep: 'light',
    statelight: 'dark',
  });
});

test('every printed hex comes from the palette or is one of the two logo inks', () => {
  const html = renderToStaticMarkup(createElement(BrandPage));
  const printed = new Set((html.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase()));

  const allowed = new Set([
    ...BRAND_PALETTE.map((c) => c.hex.toUpperCase()),
    // Logo INK variants. They are allowed in the markup — the logo cards print
    // them — and are deliberately absent from the palette and from the swatch
    // grid, which is asserted in test/pure/brandPalette.test.mjs.
    '#5E6A7E',
    '#B7C3D4',
  ]);

  for (const hex of printed) {
    assert.ok(allowed.has(hex), `${hex} is rendered but is not a palette colour or a logo ink`);
  }
  // The floor: if the swatch grid stopped rendering entirely the loop above
  // would pass over nothing.
  for (const color of BRAND_PALETTE) {
    assert.ok(printed.has(color.hex.toUpperCase()), `${color.name} is not printed anywhere`);
  }
});

test('the swatch chips are painted from the palette, in palette order', () => {
  const d = doc();
  const chips = [...d.querySelectorAll('[style*="background-color"]')];
  assert.equal(chips.length, BRAND_PALETTE.length, 'one chip per brand colour');

  chips.forEach((chip, i) => {
    const expected = BRAND_PALETTE[i].hex.toLowerCase();
    // JSDOM normalises the inline colour to rgb(); compare on the decoded
    // triplet rather than on however the serialiser chose to spell it.
    const [r, g, b] = BRAND_PALETTE[i].rgb;
    const style = chip.getAttribute('style').replace(/\s/g, '').toLowerCase();
    assert.ok(
      style.includes(expected) || style.includes(`rgb(${r},${g},${b})`),
      `chip ${i} paints ${style}, expected ${expected}`,
    );
  });
});

test('page.jsx holds no colour literal of its own', () => {
  // Comments and imports stripped, per the standing rule in test/sourceScan.mjs
  // — a docstring that quotes a hex would otherwise satisfy a "does not
  // contain" assertion about the code.
  const src = readSourceForScanning('src/app/(public)/brand/page.jsx');
  const hexes = src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
  assert.deepEqual(
    hexes,
    [],
    `page.jsx contains hex literal(s): ${hexes.join(', ')}. Colours belong to ` +
      `src/lib/brand/palette.js, which is parity-checked against the theme; a ` +
      `literal here is a copy nothing compares.`,
  );
});

test('the minimum-size table is a real table with four data rows', () => {
  const d = doc();
  const table = d.querySelector('table');
  assert.ok(table, 'tabular reference values render as a table, not as divs');
  assert.equal(table.querySelectorAll('thead th').length, 4);
  assert.equal(table.querySelectorAll('tbody tr').length, 4);
  for (const th of table.querySelectorAll('thead th')) {
    assert.equal(th.getAttribute('scope'), 'col');
  }
  assert.match(table.textContent, /160 px/);
  assert.match(table.textContent, /8 mm/);
});

test('the wallpaper preview is the downscaled variant, lazy, and reserves its box', () => {
  const d = doc();
  const img = [...d.querySelectorAll('img')].find((i) =>
    i.getAttribute('src')?.includes('wallpaper'),
  );
  assert.ok(img, 'the wallpaper preview renders');

  // The stored asset is 8000 x 4500 / ~4.7 MB. Pointing the preview at it is
  // what the content reference does and is the thing this page must not do.
  assert.equal(img.getAttribute('src'), WALLPAPER.previewHref);
  assert.notEqual(img.getAttribute('src'), WALLPAPER.downloadHref);
  assert.match(img.getAttribute('src'), /^\/_img\/w800\//, 'goes through the w800 variant');
  assert.equal(img.getAttribute('loading'), 'lazy');
  assert.equal(img.getAttribute('width'), String(WALLPAPER.width));
  assert.equal(img.getAttribute('height'), String(WALLPAPER.height));

  // ...while the download link still hands over the full-resolution original.
  const link = [...d.querySelectorAll('a')].find(
    (a) => a.getAttribute('href') === WALLPAPER.downloadHref,
  );
  assert.ok(link, 'the download button points at the stored asset, not at the thumbnail');
});

test('every logo image is lazy and carries a Thai alt naming its ink', () => {
  for (const img of logoImages(doc())) {
    assert.equal(img.getAttribute('loading'), 'lazy');
    const alt = img.getAttribute('alt') ?? '';
    assert.ok(alt.includes('สี'), `alt "${alt}" should name the colour variant`);
    assert.ok(alt.length > 5, 'alt is not a placeholder');
  }
});

test('each logo card offers both an SVG and a PNG download', () => {
  const d = doc();
  const hrefs = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  for (const shape of LOGO_SHAPES) {
    for (const variant of LOGO_VARIANTS) {
      assert.ok(hrefs.includes(`/files/ci-svg/${shape.key}-${variant.key}.svg`));
      assert.ok(hrefs.includes(`/files/ci/${shape.key}-${variant.key}.png`));
    }
  }
});

test('the heading outline runs h1 then h2 — no level is skipped', () => {
  const d = doc();
  assert.equal(d.querySelectorAll('h1').length, 1, 'the page owns exactly one h1');
  // Ten section headings: colour system, three logo shapes, minimum size,
  // backgrounds, incorrect usage, meaning, wallpaper.
  const h2s = [...d.querySelectorAll('h2')];
  assert.ok(h2s.length >= 8, `expected the guideline sections as h2, saw ${h2s.length}`);
  // The reference's markup starts at h3 because a CMS supplied the title above
  // it. Porting that verbatim would leave a hole in the outline.
  const h3sBeforeAnyH2 = d.querySelector('h3, h2');
  assert.equal(h3sBeforeAnyH2.tagName, 'H2', 'the first sub-heading is an h2, not an h3');
});

test('no SVG is routed through next/image, which would refuse it', () => {
  // next.config.mjs does not set `dangerouslyAllowSVG`, so the optimizer rejects
  // an SVG source outright. The stub in test/loader.mjs renders next/image as an
  // <img> too, so the markup alone cannot tell them apart — the source can.
  const src = readSourceForScanning('src/app/(public)/brand/_components/LogoVariantGrid.jsx');
  assert.ok(!/next\/image/.test(src), 'LogoVariantGrid must use a plain <img> for SVG sources');
});
