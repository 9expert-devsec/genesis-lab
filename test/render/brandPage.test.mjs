import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readSourceForScanning, ROOT as SRC_ROOT } from '../sourceScan.mjs';
import BrandPage from '@/app/(public)/brand/page';
import {
  BrandAssetExplorer,
  LogoCardRow,
} from '@/app/(public)/brand/_components/BrandAssetExplorer';
import { BRAND_PALETTE } from '@/lib/brand/palette';
import {
  BRAND_SECTIONS,
  LOGO_SHAPES,
  LOGO_VARIANTS,
  WALLPAPER,
} from '@/app/(public)/brand/brandContent';

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
 *   2. the tile behind the logo cards does NOT follow the theme — it follows
 *      the SELECTED INK, because it is the guideline being demonstrated rather
 *      than decoration.
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
 *
 * ── TWO WAYS OF DRIVING THE PAGE, AND WHY BOTH ARE HERE ─────────────────────
 * Section 06 is now three cards and one shared colour picker, and the picker is
 * the page's only client component. `renderToStaticMarkup` answers everything
 * about the page AS SERVED — which ink it opens on, that there are three cards
 * and not fifteen, what the rest of the page renders — but it cannot press a
 * button, so on its own it can only ever see Nine Blue.
 *
 * So the ink-dependent claims are made twice, deliberately, and the two are not
 * the same claim:
 *
 *   · LogoCardRow is mounted directly, once per ink, to assert the tile pairing
 *     for all five. That is the RULE — the mapping from ink to ground — and it
 *     is checked without a click because a click is not what makes it true.
 *   · BrandAssetExplorer is then mounted into a real JSDOM and each of the five
 *     swatches is really clicked, which is the only thing that proves the
 *     selection is WIRED: that pressing State Light re-points all three images,
 *     re-grounds all three tiles, moves aria-pressed, and rewrites the hrefs.
 *
 * WHAT IS STILL NOT COVERED, said plainly rather than implied by a green: no
 * assertion here touches hydration (this mounts a client root directly, it does
 * not replay Next's server HTML and hydrate it), keyboard activation (the
 * clicks are dispatched MouseEvents; Enter/Space are native <button> behaviour
 * that is taken on trust), focus movement, or anything visual — that a ring is
 * actually drawn, that the tile is a colour a human would call dark, or that
 * the artwork inside it is legible. The class names are asserted; the pixels
 * are not.
 */

const doc = () => {
  const html = renderToStaticMarkup(createElement(BrandPage));
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
};

const logoImages = (d) => [...d.querySelectorAll('img')].filter((i) => i.getAttribute('src')?.includes('/files/ci-svg/'));

/** The colour picker's five buttons, read off whatever document is passed. */
const inkButtons = (d) => [...d.querySelectorAll('[role="group"] button[aria-pressed]')];

const inkByKey = Object.fromEntries(LOGO_VARIANTS.map((v) => [v.key, v]));

/**
 * Assert the ground of one tile: the right one of the two, and NOTHING
 * conditional on the theme.
 *
 * Shared by the static per-ink pass and the click-driven one so both are
 * measuring the same property with the same strictness — a second, looser copy
 * inside the interaction test is exactly how one of the two quietly stops
 * meaning anything.
 */
function assertTileGround(tile, variant, where) {
  const classes = tile.className;

  // Not "the class list happens to contain no dark:" — the assertion is that
  // the tile's GROUND is unconditional. A `dark:` anything on this element is
  // the regression, whatever utility it decorates.
  assert.ok(
    !/(^|\s)dark:/.test(classes),
    `${where}: the ${variant.key} tile carries a dark: variant (${classes}). The ` +
      `tile is the guideline being demonstrated: a Cloud Base logo is the ` +
      `knockout and is legible ONLY on dark, a Deep Navy logo ONLY on light. ` +
      `Inverting the tile with the theme shows navy-on-navy and makes the page ` +
      `teach the mistake it forbids three sections further up.`,
  );

  const wantsDark = variant.tile === 'dark';
  assert.equal(
    /(^|\s)bg-9e-navy(\s|$)/.test(classes),
    wantsDark,
    `${where}: ${variant.key} should sit on a ${variant.tile} tile`,
  );
  assert.equal(
    /(^|\s)bg-white(\s|$)/.test(classes),
    !wantsDark,
    `${where}: ${variant.key} should sit on a ${variant.tile} tile`,
  );
}

/**
 * Mount a real React root in a real DOM, FULLY SYNCHRONOUSLY.
 *
 * The globals swap follows test/render/imageLightbox exactly, and for the
 * reason recorded there at length: test/run.mjs runs these files with
 * `isolation: 'none'` AND `concurrency: true`, so an `await` taken while
 * `globalThis.document` is swapped hands a foreign document to whatever else is
 * mid-flight. Every mount here is synchronous end to end; `flushSync` is what
 * makes that possible.
 */
function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    raf: globalThis.requestAnimationFrame,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

  const root = createRoot(dom.window.document.getElementById('root'));
  const api = {
    doc: dom.window.document,
    render: () => flushSync(() => root.render(createElement(BrandAssetExplorer))),
    /** A click that really bubbles, so React's root listener can see it. */
    click: (el) =>
      flushSync(() =>
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })),
      ),
  };
  try {
    return run(api);
  } finally {
    // Unmount INSIDE the swap — React touches `document` during teardown, and
    // doing it after the restore throws on a detached tree.
    try { flushSync(() => root.unmount()); } catch { /* already torn down */ }
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.requestAnimationFrame = prev.raf;
  }
}

// ── SECTION 06: THREE CARDS AND ONE PICKER ──────────────────────────────────

test('section 06 renders THREE cards — one per logo form, not one per file', () => {
  const images = logoImages(doc());

  // The EXACT count, not a floor. The shape this replaced rendered fifteen and
  // was correct at every "at least three" assertion anyone could write about
  // it, so a floor here would pass on the very regression it exists to catch.
  assert.equal(
    images.length,
    3,
    `section 06 rendered ${images.length} logo tiles. It is three cards sharing ` +
      `one colour picker — one per logo form — not one card per file.`,
  );
  assert.equal(images.length, LOGO_SHAPES.length, 'one card per shape in LOGO_SHAPES');

  const srcs = images.map((i) => i.getAttribute('src'));
  assert.equal(new Set(srcs).size, 3, 'three DISTINCT files, not one repeated');
});

test('the page opens on Nine Blue, and every card points at the -nineblue files', () => {
  const d = doc();

  // Document order matters: the cards read Signature · Symbol · Square, which
  // is the order the guideline introduces them in.
  assert.deepEqual(
    logoImages(d).map((i) => i.getAttribute('src')),
    [
      '/files/ci-svg/signature-nineblue.svg',
      '/files/ci-svg/symbol-nineblue.svg',
      '/files/ci-svg/square-nineblue.svg',
    ],
  );

  const hrefs = [...d.querySelectorAll('a')].map((a) => a.getAttribute('href'));
  for (const shape of LOGO_SHAPES) {
    assert.ok(
      hrefs.includes(`/files/ci-svg/${shape.key}-nineblue.svg`),
      `no SVG download for ${shape.key}-nineblue`,
    );
    assert.ok(
      hrefs.includes(`/files/ci/${shape.key}-nineblue.png`),
      `no PNG download for ${shape.key}-nineblue`,
    );
  }

  // ...and NO other ink's file is anywhere in the served markup. Rendering all
  // fifteen and hiding twelve with CSS would satisfy every assertion above.
  const otherInks = LOGO_VARIANTS.filter((v) => v.key !== 'nineblue');
  for (const href of hrefs.filter(Boolean)) {
    for (const variant of otherInks) {
      assert.ok(
        !href.endsWith(`-${variant.key}.svg`) && !href.endsWith(`-${variant.key}.png`),
        `${href} ships in the default render, but only Nine Blue is selected`,
      );
    }
  }

  // The visitor is told WHICH file each button hands over, before they click.
  const text = d.getElementById('brand-assets').textContent;
  for (const shape of LOGO_SHAPES) {
    assert.ok(text.includes(`${shape.key}-nineblue`), `the ${shape.key} card omits its file stem`);
  }
  assert.ok(text.includes(inkByKey.nineblue.name), 'the cards name the selected colour');
  assert.ok(text.includes(inkByKey.nineblue.hex), 'the cards print the selected hex');
});

test('all five inks are offered as named, keyboard-operable options', () => {
  const d = doc();
  const buttons = inkButtons(d);

  assert.equal(buttons.length, 5, 'five approved inks, five swatches');
  assert.equal(buttons.length, LOGO_VARIANTS.length);

  // The NAME, not just a coloured circle. Two of the five inks are greys many
  // readers cannot tell apart, and a screen reader is handed nothing at all by
  // a background colour.
  assert.deepEqual(
    buttons.map((b) => b.textContent.replace(/✓/g, '').trim()),
    LOGO_VARIANTS.map((v) => v.name),
  );

  for (const button of buttons) {
    assert.equal(button.tagName, 'BUTTON', 'a real button, not a div with a handler');
    assert.equal(button.getAttribute('type'), 'button', 'not a submit inside some future form');
    assert.equal(
      button.getAttribute('tabindex'),
      null,
      'no tabindex — the native tab order is the keyboard model here',
    );
  }

  // Selection is exposed to assistive tech, and exactly one option carries it.
  const pressed = buttons.filter((b) => b.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed.length, 1, 'exactly one ink is selected at a time');
  assert.equal(pressed[0].textContent.replace(/✓/g, '').trim(), inkByKey.nineblue.name);

  // ...and it is not carried by colour alone: the selected button is also the
  // one wearing a ring and a check mark.
  assert.match(pressed[0].className, /(^|\s)ring-2(\s|$)/, 'the selected swatch wears a ring');
  assert.ok(pressed[0].textContent.includes('✓'), 'the selected swatch is check-marked');

  const group = d.querySelector('[role="group"][aria-labelledby]');
  assert.ok(group, 'the five swatches are one labelled group');
  assert.ok(
    d.getElementById(group.getAttribute('aria-labelledby'))?.textContent.trim(),
    'the group label points at an element with text',
  );
});

test('THE TILE FOLLOWS THE SELECTED INK, AND NEVER THE THEME — all five', () => {
  // Mounted per ink rather than clicked, because the pairing is a RULE about
  // the ink and not a consequence of pressing anything. All five, not a sample:
  // one wrong pairing renders a white logo on a white tile and throws nothing.
  for (const variant of LOGO_VARIANTS) {
    const html = renderToStaticMarkup(createElement(LogoCardRow, { variant }));
    const d = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
    const tiles = logoImages(d).map((img) => img.parentElement);
    assert.equal(tiles.length, 3, `${variant.key}: three cards`);
    for (const tile of tiles) assertTileGround(tile, variant, `LogoCardRow[${variant.key}]`);
  }
});

test('clicking each swatch re-points all three cards and re-grounds all three tiles', () => {
  withDom((m) => {
    m.render();

    for (const variant of LOGO_VARIANTS) {
      const button = inkButtons(m.doc).find(
        (b) => b.textContent.replace(/✓/g, '').trim() === variant.name,
      );
      assert.ok(button, `no swatch labelled ${variant.name}`);
      m.click(button);

      const images = logoImages(m.doc);
      assert.equal(images.length, 3, `${variant.key}: still three cards after the click`);

      // Every card moved — the picker is SHARED, so a click that repainted only
      // the first card would be the bug worth catching here.
      assert.deepEqual(
        images.map((i) => i.getAttribute('src')),
        LOGO_SHAPES.map((s) => `/files/ci-svg/${s.key}-${variant.key}.svg`),
        `${variant.key}: the previews did not all follow the picker`,
      );

      const hrefs = [...m.doc.querySelectorAll('a')].map((a) => a.getAttribute('href'));
      for (const shape of LOGO_SHAPES) {
        assert.ok(hrefs.includes(`/files/ci-svg/${shape.key}-${variant.key}.svg`));
        assert.ok(hrefs.includes(`/files/ci/${shape.key}-${variant.key}.png`));
        // No `download` attribute, in either state — the delivery layer sends
        // these as attachments and a second copy of that ruling here would be
        // the weaker one.
        assert.equal(
          m.doc.querySelector(`a[href="/files/ci/${shape.key}-${variant.key}.png"]`)
            .getAttribute('download'),
          null,
        );
      }

      for (const img of images) {
        assertTileGround(img.parentElement, variant, `after clicking ${variant.name}`);
        assert.ok(
          (img.getAttribute('alt') ?? '').includes(variant.name),
          `the alt still names the previous ink: ${img.getAttribute('alt')}`,
        );
      }

      const pressed = inkButtons(m.doc).filter((b) => b.getAttribute('aria-pressed') === 'true');
      assert.equal(pressed.length, 1, `${variant.key}: exactly one swatch stays pressed`);
      assert.equal(pressed[0].textContent.replace(/✓/g, '').trim(), variant.name);

      const stems = m.doc.body.textContent;
      for (const shape of LOGO_SHAPES) {
        assert.ok(
          stems.includes(`${shape.key}-${variant.key}`),
          `${shape.key} card does not print its ${variant.key} file stem`,
        );
      }
    }
  });
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
  // SCOPED TO SECTION 04, and that scope is the point rather than a convenience.
  // Section 06's ink picker paints five dots the same way — inline, from data,
  // for the reason ColorSwatchGrid records — and two of those five inks are
  // deliberately NOT palette colours. A document-wide count would therefore
  // read eleven chips and go red on a correct page, and "fix" it by relaxing to
  // a floor, which would stop noticing a palette colour that fell out of the
  // grid. The claim here is about the BRAND PALETTE grid; ask it there.
  const chips = [...d.getElementById('colors').querySelectorAll('[style*="background-color"]')];
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

test('no JSX on this page holds a colour literal of its own', () => {
  // Comments and imports stripped, per the standing rule in test/sourceScan.mjs
  // — a docstring that quotes a hex would otherwise satisfy a "does not
  // contain" assertion about the code.
  //
  // EVERY component, not just page.jsx. The section rebuild moved most of the
  // markup out of the page file, so a scan of page.jsx alone would now pass
  // over a page whose swatches were hardcoded one directory down. The data
  // modules are deliberately NOT scanned: brandContent.js is where the two logo
  // inks (State Deep / State Light) are declared exactly once, on purpose.
  const files = [
    'src/app/(public)/brand/page.jsx',
    ...readdirSync(path.join(SRC_ROOT, 'src/app/(public)/brand/_components'))
      .filter((f) => f.endsWith('.jsx'))
      .map((f) => `src/app/(public)/brand/_components/${f}`),
  ];
  assert.ok(files.length >= 7, `only ${files.length} files scanned — did the tree move?`);

  const offenders = [];
  for (const file of files) {
    const hexes = readSourceForScanning(file).match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    if (hexes.length) offenders.push(`${file}: ${hexes.join(', ')}`);
  }
  assert.deepEqual(
    offenders,
    [],
    `colour literal(s) in JSX:\n  ${offenders.join('\n  ')}\nColours belong to ` +
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

test('each logo card offers an SVG and a PNG, as plain anchors', () => {
  const d = doc();
  const links = [...d.querySelectorAll('a')].filter((a) =>
    /^\/files\/ci(-svg)?\//.test(a.getAttribute('href') ?? ''),
  );
  // Three cards x two formats. The wallpaper's own download link lives under
  // /files/ci/ too and is matched by the filter, so it is excluded by name
  // rather than by trimming the pattern until the number came out right.
  const logoLinks = links.filter((a) => !a.getAttribute('href').includes('wallpaper'));
  assert.equal(logoLinks.length, LOGO_SHAPES.length * 2);

  for (const a of logoLinks) {
    // NO `download` attribute, here or on the wallpaper. next.config.mjs sends
    // the originals under these two roots as attachments already; adding the
    // attribute would be a second, weaker statement of that in a place the
    // delivery tests do not read.
    assert.equal(a.getAttribute('download'), null, `${a.getAttribute('href')} carries download=`);
  }
});

test('the heading outline runs h1 then h2 then h3 — no level is skipped', () => {
  const d = doc();
  assert.equal(d.querySelectorAll('h1').length, 1, 'the page owns exactly one h1');
  const h2s = [...d.querySelectorAll('h2')];
  assert.equal(
    h2s.length,
    BRAND_SECTIONS.length,
    `one h2 per section and no more — saw ${h2s.length} for ${BRAND_SECTIONS.length} sections`,
  );
  // The guideline's own markup starts at h3 because a CMS supplied the title
  // above it. Porting that verbatim would leave a hole in the outline.
  const firstSubHeading = d.querySelector('h2, h3');
  assert.equal(firstSubHeading.tagName, 'H2', 'the first sub-heading is an h2, not an h3');
});

// ── THE SIX SECTIONS ────────────────────────────────────────────────────────

test('all six sections render, IN ORDER, with the ids that get shared as links', () => {
  const d = doc();

  // Read the ids off the document in DOCUMENT ORDER rather than looking each
  // one up: an assertion that only checks presence passes on a page whose
  // sections have been shuffled, and the numbering would then disagree with the
  // rail. Order is part of the contract here.
  const rendered = [...d.querySelectorAll('[id]')]
    .map((el) => el.id)
    .filter((id) => BRAND_SECTIONS.some((s) => s.id === id));

  assert.deepEqual(
    rendered,
    BRAND_SECTIONS.map((s) => s.id),
    'the sections on the page do not match BRAND_SECTIONS in order',
  );

  // The ids are PUBLIC API — people paste these anchors into chat — so the
  // expected list is spelled out once here rather than derived, which is what
  // makes a rename go red instead of quietly following the module.
  assert.deepEqual(rendered, [
    'brand-story',
    'logo',
    'logo-usage',
    'colors',
    'do-and-dont',
    'brand-assets',
  ]);

  // Each section's own <h2> carries its English title, and its number is
  // present but hidden from assistive tech (the title already carries the
  // meaning; "zero one Brand Story" is noise in a heading).
  for (const section of BRAND_SECTIONS) {
    const el = d.getElementById(section.id);
    const heading = el.querySelector('h2');
    assert.equal(heading.textContent.trim(), section.title, `${section.id} heading`);
    const number = el.querySelector('[aria-hidden="true"]');
    assert.equal(number.textContent.trim(), section.number, `${section.id} number`);
  }
});

test('the section rail links to every section, and only to sections', () => {
  const d = doc();
  const anchors = [...d.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href'));
  assert.ok(anchors.length > 0, 'no in-page anchors at all — the rail did not render');

  for (const section of BRAND_SECTIONS) {
    assert.ok(anchors.includes(`#${section.id}`), `the rail has no link to #${section.id}`);
  }
  // Every in-page anchor resolves to something that exists. A rail entry
  // pointing at a removed section is a dead link that nothing else would catch.
  for (const href of new Set(anchors)) {
    assert.ok(d.getElementById(href.slice(1)), `${href} points at no element on the page`);
  }
});

test('TYPOGRAPHY AND GRADIENTS APPEAR NOWHERE — they were cut deliberately', () => {
  // ── WHY THIS GUARD EXISTS ─────────────────────────────────────────────────
  // The guideline's table of contents lists chapter 04, "TYPOGRAPHY & GRAPHIC
  // LANGUAGE", at pages 27-29. The document is 26 pages long and ends at 3.1 —
  // the chapter was never written. Gradients appear once in the whole document,
  // as a prohibition.
  //
  // So anyone comparing this page against that contents page will read the gap
  // as an omission and "restore" two sections that have no source text, which
  // means inventing brand policy. This assertion is what turns that from a
  // plausible-looking fix into a red test with a reason attached.
  //
  // When the chapter is actually written, DELETE THIS TEST DELIBERATELY — do
  // not weaken it to make a new section pass.
  const html = renderToStaticMarkup(createElement(BrandPage));

  for (const word of ['Typography', 'Gradient']) {
    assert.ok(
      !new RegExp(word, 'i').test(html),
      `"${word}" appears on the page. Chapter 04 was never written and gradients ` +
        `are a single prohibition, not a section — see BRAND_SECTIONS in ` +
        `brandContent.js before adding either back.`,
    );
  }

  // ...and the section list itself does not carry a placeholder for them, which
  // would render as nothing today and as a section the moment someone filled it.
  for (const section of BRAND_SECTIONS) {
    assert.ok(!/typograph|gradient/i.test(section.id), `${section.id} is a placeholder`);
    assert.ok(!/typograph|gradient/i.test(section.title), `${section.title} is a placeholder`);
  }
});

test('no SVG is routed through next/image, which would refuse it', () => {
  // next.config.mjs does not set `dangerouslyAllowSVG`, so the optimizer rejects
  // an SVG source outright. The stub in test/loader.mjs renders next/image as an
  // <img> too, so the markup alone cannot tell them apart — the source can.
  const src = readSourceForScanning('src/app/(public)/brand/_components/BrandAssetExplorer.jsx');
  assert.ok(!/next\/image/.test(src), 'BrandAssetExplorer must use a plain <img> for SVG sources');
});
