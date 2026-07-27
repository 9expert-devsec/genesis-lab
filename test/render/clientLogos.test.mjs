import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ClientLogosSection from '@/components/portfolio/ClientLogosSection';

/**
 * Client logo strip — a monochrome white wall in dark mode.
 *
 * HISTORY, because two earlier shapes were tried and rejected:
 *   1. `dark:brightness-0 dark:invert` PLUS `dark:opacity-40`. The knockout
 *      was right; the opacity was the defect, turning the wall into ghosts.
 *   2. A light panel behind the rows, so logos could keep their colour. It
 *      read as a bright slab against the dark page, and the mask fade then
 *      terminated on the panel's hard edge — edge logos looked clipped.
 *
 * Now: white knockout at FULL opacity, no panel, no tiles, rows directly on
 * the section background. Light mode is untouched — original colour, full
 * opacity.
 *
 * THE EXCEPTION. `brightness(0)` maps every opaque pixel to the same white,
 * which erases any ENCLOSED counter-form: the gold tree inside SCB's purple
 * square, the '9' inside Praram 9's teal block, the seal inside Bank of
 * Thailand's roundel. Those logos collapse to featureless blobs, so they
 * carry `keepColorOnDark` and render in original colour. 11 of 42 today.
 *
 * The flag is DATA on the logo record, never a name list in the JSX — a
 * hardcoded array breaks silently the first time a company is renamed.
 */

const LOGOS = [
  { _id: 'a', company_name: 'SONY TECHNOLOGY (THAILAND) CO., LTD.', image_url: 'https://cdn.test/sony.png', display_order: 4 },
  { _id: 'b', company_name: 'THE SIAM COMMERCIAL BANK', image_url: 'https://cdn.test/scb.png', display_order: 27, keepColorOnDark: true },
  { _id: 'c', company_name: 'PANDORA PRODUCTION CO., LTD.', image_url: 'https://cdn.test/pandora.png', display_order: 9 },
];
const html = () => renderToStaticMarkup(createElement(ClientLogosSection, { logos: LOGOS }));
const SLOT_RE = /class="flex h-\[72px\][^"]*"/g;
const imgFor = (out, src) =>
  out.match(new RegExp(`<img[^>]*src="${src}"[^>]*>`))?.[0] ?? '';

// ── AC1: the wall ─────────────────────────────────────────────────

test('an unflagged logo is knocked out to white in dark mode', () => {
  const img = imgFor(html(), 'https://cdn.test/sony.png');
  assert.match(img, /dark:brightness-0/);
  assert.match(img, /dark:invert/);
});

test('the knockout is at FULL opacity — the ghosting was the defect', () => {
  const out = html();
  for (const banned of ['opacity-40', 'opacity-70', 'opacity-100', 'dark:opacity']) {
    assert.ok(!out.includes(banned), `"${banned}" must not come back — it is what made the wall ghosts`);
  }
});

test('no panel, no tile, no rounding anywhere', () => {
  const out = html();
  assert.ok(!out.includes('bg-9e-ice'), 'the rejected light panel must be gone');
  assert.ok(!out.includes('dark:rounded'), 'no tile rounding');
  for (const s of out.match(SLOT_RE) ?? []) {
    const offenders = s.replace(/class="|"$/g, '').split(/\s+/).filter((c) => /(^|:)(bg-|rounded)/.test(c));
    assert.deepEqual(offenders, [], `the slot must be a bare layout box, found: ${offenders}`);
  }
});

test('NO element carries a light surface in dark mode', () => {
  // Replaces the old "exactly one element carries the panel surface". The
  // section background in dark mode is the page background, full stop.
  const out = html();
  const darkSurfaces = [...out.matchAll(/dark:bg-(\S+?)["\s]/g)].map((m) => m[1]);
  for (const s of darkSurfaces) {
    assert.match(s, /\[var\(--page-bg\)\]/, `unexpected dark-mode surface: dark:bg-${s}`);
  }
});

test('the section background in dark mode is the page background', () => {
  const section = html().match(/<section[^>]*class="([^"]*)"/)[1];
  assert.match(section, /dark:bg-\[var\(--page-bg\)\]/);
});

// ── AC5: the exception flag, both directions ──────────────────────

test('CONTROL: a keepColorOnDark logo does NOT receive the filter', () => {
  const img = imgFor(html(), 'https://cdn.test/scb.png');
  assert.ok(img, 'the flagged logo should render');
  assert.ok(!img.includes('brightness-0'), `flagged logo was knocked out: ${img}`);
  assert.ok(!img.includes('invert'), `flagged logo was inverted: ${img}`);
});

test('CONTROL: an unflagged logo MUST receive it — neither direction is vacuous', () => {
  const out = html();
  const filtered = (out.match(/dark:brightness-0/g) ?? []).length;
  const imgs = (out.match(/<img/g) ?? []).length;
  // 3 logos x 3 marquee copies = 9 images; 1 of the 3 is flagged, so 6 filtered.
  assert.equal(imgs, 9);
  assert.equal(filtered, 6, 'exactly the two unflagged logos, across all three copies');
});

test('the flag is read from the record, not matched on company name', () => {
  // Renaming a company must not change its treatment.
  const renamed = renderToStaticMarkup(createElement(ClientLogosSection, {
    logos: [{ ...LOGOS[1], company_name: 'COMPLETELY DIFFERENT NAME LTD.' }],
  }));
  const img = imgFor(renamed, 'https://cdn.test/scb.png');
  assert.ok(!img.includes('brightness-0'), 'the flag must survive a rename');
});

test('a logo with no flag at all defaults to the knockout', () => {
  const out = renderToStaticMarkup(createElement(ClientLogosSection, {
    logos: [{ _id: 'z', company_name: 'NEW CO', image_url: 'https://cdn.test/new.png' }],
  }));
  assert.match(imgFor(out, 'https://cdn.test/new.png'), /dark:brightness-0/);
});

// ── AC3: light mode ───────────────────────────────────────────────

test('light mode carries no colour treatment at all', () => {
  // Every filter utility on the image is dark:-scoped, so light mode renders
  // original colour at full opacity exactly as before.
  const out = html();
  for (const img of out.match(/<img[^>]*>/g) ?? []) {
    const cls = img.match(/class="([^"]*)"/)[1];
    const unscoped = cls.split(/\s+/).filter((c) => !c.startsWith('dark:') && /^(brightness|invert|grayscale|opacity)/.test(c));
    assert.deepEqual(unscoped, [], `light mode must stay untreated, found: ${unscoped}`);
  }
});

test('the image keeps exactly its sizing classes plus the dark-only filter', () => {
  const cls = imgFor(html(), 'https://cdn.test/sony.png').match(/class="([^"]*)"/)[1];
  assert.equal(cls, 'h-auto max-h-[52px] w-auto max-w-[130px] object-contain dark:brightness-0 dark:invert');
  const flagged = imgFor(html(), 'https://cdn.test/scb.png').match(/class="([^"]*)"/)[1];
  assert.equal(flagged, 'h-auto max-h-[52px] w-auto max-w-[130px] object-contain');
});

// ── AC6: height parity, compensation removed ──────────────────────

const PX = (n) => n * 4;
const pyOf = (cls, dark) => {
  const dm = cls.match(/(?:^|\s)dark:py-(\d+)(?=\s|$)/);
  const bm = cls.match(/(?:^|\s)py-(\d+)(?=\s|$)/);
  if (dark && dm) return PX(Number(dm[1]));
  return bm ? PX(Number(bm[1])) : 0;
};

test('the section occupies the same total height in light and dark', () => {
  // With the panel gone there is nothing to compensate, so a theme-conditional
  // padding would itself be the reflow-on-toggle it was added to prevent.
  const out = html();
  const section = out.match(/<section[^>]*class="([^"]*)"/)[1];
  assert.equal(pyOf(section, false), 80, 'py-20');
  assert.equal(pyOf(section, true), 80, 'unchanged in dark — the dark:py-12 compensation is obsolete');
  assert.ok(!section.includes('dark:py-'), `the compensation must be removed: ${section}`);

  const rowsWrapper = out.match(/class="mt-14[^"]*"/)?.[0] ?? '';
  assert.ok(!rowsWrapper.includes('py-'), 'the rows wrapper adds no padding in either mode');
});

// ── AC4: the mask fades to the section background ─────────────────

/**
 * A `mask-image` sets the alpha of the element it is on, so the fade reveals
 * whatever is behind. With the panel removed, that is the section background,
 * and the fade lands on the page colour instead of a panel edge.
 *
 * Verified by pixel compositing: a continuous white bar under the same 8%
 * alpha ramp, composited on #0D1B2A, reads [13,27,42] at x=0 and ramps
 * [53,65,77] -> [134,141,148] -> [255,255,255], with a largest adjacent-pixel
 * step of 6/255 across the 48px fade. A hard edge would be a single step of
 * ~235. This test pins the structural precondition: nothing is layered
 * between the masked row and the section.
 */
test('nothing is layered between the masked row and the section background', () => {
  const out = html();
  const beforeMask = out.slice(0, out.indexOf('mask-image'));
  const wrappers = [...beforeMask.matchAll(/<div class="([^"]*)"/g)].map((m) => m[1]);
  for (const w of wrappers) {
    assert.ok(!/(^|\s)(dark:)?bg-/.test(w), `a background between section and row would catch the fade: "${w}"`);
  }
});

test('the edge mask and marquee rhythm are unchanged', () => {
  const out = html();
  assert.match(out, /gap-12/);
  assert.match(out, /width:max-content/);
  assert.match(out, /will-change-transform/);
  const mask = 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)';
  assert.ok(out.includes(`mask-image:${mask}`));
  assert.ok(out.includes(`-webkit-mask-image:${mask}`));
});

test('the slot keeps its exact 72x140 size', () => {
  for (const s of html().match(SLOT_RE) ?? []) {
    assert.match(s, /h-\[72px\]/);
    assert.match(s, /w-\[140px\]/);
  }
});

test('an empty logo set renders nothing', () => {
  assert.equal(renderToStaticMarkup(createElement(ClientLogosSection, { logos: [] })), '');
});
