import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { InstructorQuote } from '@/app/_components/home/InstructorQuote';

/**
 * The motto band's background layer, as it actually renders.
 *
 * The section is a dark full-bleed panel: a lime opening quote mark, a white
 * Thai quotation, the CEO's name and title on the left, his portrait on the
 * right. Its background used to be ~100 lines of inline SVG — a flat #0D1B2A
 * rect with a circuit board drawn over it. It is now one wallpaper file.
 *
 * ══ WHAT THIS FILE PINS, AND WHY EACH ONE ═══════════════════════════════════
 *  1. THE ARTWORK IS ONE LAYER, AND IT IS THE WALLPAPER. The half-finished swap
 *     (new <img> in, old <svg> never removed) is the realistic failure: it
 *     renders both, stacked, and reads as "the background changed" at a glance.
 *  2. THE PORTRAIT IS A DIFFERENT ELEMENT. Both layers are now <img> in the
 *     markup — next/image is stubbed to a faithful <img> at this tier — so
 *     "there is an image" proves nothing. Every assertion here addresses one of
 *     them by src, and the portrait's own attributes are asserted unchanged.
 *  3. THE CROP RULE. `object-cover object-center` is the CSS spelling of the
 *     SVG's `preserveAspectRatio="xMidYMid slice"`. Losing `object-cover` is
 *     the quiet one: the art would stretch instead of crop, and a stretched
 *     photograph still fills the band.
 *  4. THE STACKING ORDER. Artwork first in document order with no z-index,
 *     content on `z-[2]`. Reverse them and the wallpaper paints over the quote.
 *
 * ══ WHAT THIS FILE CANNOT SEE ═══════════════════════════════════════════════
 * jsdom computes no layout and loads no images, so nothing here observes the
 * band's real height, which slice of the art a 390px viewport keeps, or whether
 * white-on-artwork is READABLE. Those are the two things that actually decide
 * whether this change is good, they were measured out-of-band by decoding the
 * PNG, and the remaining browser-only judgement is stated in the report.
 */

const WALLPAPER = '/motto/wallpaper-motto.png';
const PORTRAIT = '/people/Aj.Chalaivate.webp';

const html = renderToStaticMarkup(createElement(InstructorQuote, {}));
const doc = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;
const root = doc.querySelector('#r > *');

const wallpaper = doc.querySelector(`img[src="${WALLPAPER}"]`);
const portrait = doc.querySelector(`img[src="${PORTRAIT}"]`);

// ── One artwork layer, and it is the wallpaper ──────────────────────────────

test('the section paints the wallpaper, and paints it exactly once', () => {
  assert.ok(wallpaper, `no element renders ${WALLPAPER}`);
  assert.equal(
    doc.querySelectorAll(`img[src="${WALLPAPER}"]`).length, 1,
    'the wallpaper is rendered more than once',
  );
});

test('no circuit-board SVG is left underneath it', () => {
  // The stacked-layers failure. An <svg> anywhere in this section's markup can
  // only be the old background: the band draws no icons.
  assert.equal(doc.querySelectorAll('svg').length, 0, 'an SVG still renders inside the motto band');
  assert.ok(!html.includes('instructor-ng'), 'the old gradient ids are still in the markup');
  assert.ok(!html.includes('polyline'), 'the old circuit traces are still in the markup');
});

test('the artwork fills the band and crops rather than stretches', () => {
  /**
   * `object-cover` keeps the aspect ratio and overflows the short axis;
   * `object-center` decides what survives, and matches the `xMidYMid` the SVG
   * used. Without the first the photograph distorts to the band's box, which
   * still looks "full-bleed" in a screenshot and is the reason this is asserted
   * rather than assumed.
   */
  const cls = wallpaper.className;
  for (const need of ['absolute', 'inset-0', 'h-full', 'w-full', 'object-cover', 'object-center']) {
    assert.match(cls, new RegExp(`(^|\\s)${need.replace('-', '\\-')}(\\s|$)`), `the wallpaper lost \`${need}\``);
  }
  assert.ok(!/object-(contain|fill|none|scale-down)/.test(cls), 'a competing object-fit is set');
});

test('the artwork is inert decoration — no alt text, no clicks', () => {
  assert.equal(wallpaper.getAttribute('alt'), '', 'the background announces itself to screen readers');
  assert.equal(wallpaper.getAttribute('aria-hidden'), 'true', 'the background is not hidden from assistive tech');
  assert.match(
    wallpaper.className, /(^|\s)pointer-events-none(\s|$)/,
    'a full-bleed decorative layer without pointer-events-none swallows clicks on the text beneath it',
  );
});

test('the section keeps the old flat navy underneath, for the load and the 404', () => {
  // The SVG's base <rect fill="#0D1B2A"> went with the rest of it. That colour
  // is what the band was BEFORE the artwork drew, and a full-bleed element that
  // has not loaded leaves whatever is behind it showing — white page, white
  // text. Same hex, moved one level up.
  assert.match(root.className, /bg-\[#0D1B2A\]/, 'the band has no base colour beneath the wallpaper');
});

// ── The portrait is a separate element and is unchanged ─────────────────────

test('the CEO portrait still renders, from its own separate file', () => {
  assert.ok(portrait, `no element renders ${PORTRAIT}`);
  assert.notEqual(portrait, wallpaper, 'the portrait and the background resolved to one element');
  assert.equal(portrait.getAttribute('alt'), 'อ.ชไลเวท พิพัฒนพรรณวงศ์', 'the portrait alt text changed');
  assert.match(portrait.className, /object-contain/, 'the portrait crop changed');
  assert.match(portrait.className, /object-bottom/, 'the portrait no longer anchors to the bottom edge');
  assert.match(portrait.getAttribute('style') || '', /max-height:\s*425px/, 'the portrait height ceiling changed');
});

test('the band renders two images and only two — art and man', () => {
  const srcs = [...doc.querySelectorAll('img')].map((el) => el.getAttribute('src')).sort();
  assert.deepEqual(srcs, [WALLPAPER, PORTRAIT].sort(), `unexpected image set: ${srcs.join(', ')}`);
});

// ── Order and copy ──────────────────────────────────────────────────────────

test('the artwork sits behind the content, not over it', () => {
  const content = doc.querySelector('.z-\\[2\\]');
  assert.ok(content, 'the content layer lost its z-index');
  assert.ok(
    wallpaper.compareDocumentPosition(content) & 4,
    'the wallpaper renders AFTER the content — it would paint over the quote',
  );
  assert.ok(!/(^|\s)z-\[?\d/.test(wallpaper.className), 'the wallpaper claims its own z-index');
});

test('the scrim paints below lg and is switched off at lg and up', () => {
  /**
   * A ONE-BREAKPOINT scrim, and each half is a separate decision, so both are
   * pinned.
   *
   * BELOW lg it must paint. `object-cover object-center` on a band that is
   * taller than it is wide keeps only the middle ~14% of the 3:1 frame, which
   * is the lit limb — measured p95 3.5:1 for the white quote and ~2.9:1 for the
   * lime. Regressing this to a bare `hidden` puts the mobile text back on that.
   *
   * AT lg AND UP it must not. There the crop is vertical, the text column sits
   * on the empty left of the frame at 20.5:1, and an 80% navy wash would dull
   * the art for nothing.
   *
   * The mechanism is the absence of a base display class: a div is `block` by
   * default, so `lg:hidden` alone means "on below lg, off above". Adding a bare
   * `hidden` back would kill it at every width and the class would read as if
   * it still worked — which is exactly the shape of the bug this guards.
   */
  const scrim = doc.querySelector('.bg-\\[\\#0a1628\\]\\/80');
  assert.ok(scrim, 'the scrim element is gone');
  assert.match(
    scrim.className, /(^|\s)lg:hidden(\s|$)/,
    'the scrim no longer switches off at lg — the desktop art would be washed',
  );
  assert.ok(
    !/(^|\s)hidden(\s|$)/.test(scrim.className),
    'a bare `hidden` is back alongside `lg:hidden`; the scrim is off at EVERY width '
    + 'and the mobile quote is on the lit limb again',
  );
  assert.ok(
    !/(^|\s)(block|flex|grid|inline[\w-]*)(\s|$)/.test(scrim.className),
    'a base display utility would have to be re-checked against the lg override',
  );
});

test('the quote, the lime mark and the attribution are untouched', () => {
  // The swap was a background change. If any of this moved, it was not.
  assert.ok(html.includes('&quot;') || html.includes('“'), 'the opening quote mark is gone');
  assert.match(html, /text-9e-lime/, 'the lime accent is gone');
  assert.ok(html.includes('เราเป็นส่วนหนึ่งของการสนับสนุนบุคคลและองค์กร'), 'the quotation changed');
  assert.ok(html.includes('ให้เหนือคู่แข่ง'), 'the lime-highlighted phrase changed');
  assert.ok(html.includes('อ.ชไลเวท พิพัฒพรรณวงศ์'), 'the name changed');
  assert.ok(html.includes('ประธานเจ้าหน้าที่บริหาร'), 'the title changed');
  assert.match(html, /text-9e-ice/, 'the quote text colour changed');
});
