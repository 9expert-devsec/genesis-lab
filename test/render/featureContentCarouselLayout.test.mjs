import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { FeaturedContentSlider } from '@/app/_components/home/FeaturedContentSlider';
import {
  FEATURE_CONTENT_COPY,
  mapBannersToFeatureContent,
} from '@/lib/home/featureContentFromBanners';

/**
 * THE CAROUSEL'S SHAPE, as the Figma mockups define it.
 *
 * Figma file TLKzWZOYVUHl0PHUTseUD9 — `Desktop Featured Content Carousel
 * Mockup` (38:3012) and `Mobile Featured Content Carousel Mockup` (38:3231).
 *
 * ── WHAT THIS TIER CAN AND CANNOT SEE, STATED FIRST ─────────────────────────
 * renderToStaticMarkup runs no effects, performs no layout and applies no
 * stylesheet. So it CANNOT see that a card is 264px wide, that four of them fit
 * across a 1200px container, or that `lg:hidden` hides the hint on a desktop
 * viewport. Every one of those is measured in a real browser over CDP, and the
 * numbers are in the commit message.
 *
 * What it CAN see, and what is therefore pinned here, is the tree: the ORDER of
 * the three blocks, which classes carry the ratios, and that the focal point
 * actually reaches the image. Those are the parts a refactor silently reverses.
 *
 * ── THE ORDER IS THE LOAD-BEARING ONE ───────────────────────────────────────
 * The control row goes BELOW the stage and ABOVE the strip in both frames. It
 * has been at the top right of the section and below the strip before now, and
 * both of those looked perfectly reasonable in review. Its position is
 * expressed as "the first child of the strip region", which is a fact about the
 * tree and survives having no CSS.
 */

const imageBanner = (over = {}) => ({
  _id: 'img-1',
  type: 'image_desktop',
  title: 'Early Bird AI Digital Marketing Creator Masterclass',
  image_url: 'https://res.cloudinary.com/x/image/upload/v1/banner.jpg',
  link_url: 'https://genesis-lab.9expert.app/masterclass/mas-ai-dmc',
  active: true,
  weight: 0,
  ...over,
});

const videoBanner = (over = {}) => ({
  _id: 'vid-1',
  type: 'youtube',
  title: 'ลองใช้ Claude Cowork',
  youtube_id: 'abc123',
  slide_text: 'คำอธิบาย',
  link_url: 'https://www.youtube.com/watch?v=abc123',
  active: true,
  weight: 1,
  ...over,
});

function renderSlider(banners) {
  const items = mapBannersToFeatureContent(banners, {
    now: new Date('2026-08-20T00:00:00Z'),
  });
  assert.ok(items.length, 'fixture produced no items — the test would pass vacuously');
  const html = renderToStaticMarkup(
    createElement(FeaturedContentSlider, { copy: FEATURE_CONTENT_COPY, items })
  );
  const doc = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;
  return { html, doc, items };
}

/** A pool of ten, which is the live size and the size the mockup counts from. */
const pool = () => [
  ...Array.from({ length: 5 }, (_, i) =>
    imageBanner({ _id: `img-${i}`, weight: i * 2, title: `image ${i}` })),
  ...Array.from({ length: 5 }, (_, i) =>
    videoBanner({ _id: `vid-${i}`, weight: i * 2 + 1, youtube_id: `id${i}`, title: `video ${i}` })),
];

// ── THE THREE BLOCKS, IN ORDER ──────────────────────────────────────────────

test('the control row comes BELOW the stage and ABOVE the strip', () => {
  const { doc } = renderSlider(pool());
  const region = doc.querySelector('[data-fc-strip-region]');
  assert.ok(region, 'no strip region rendered');

  const kids = [...region.children];
  const rowAt = kids.findIndex((k) => k.querySelector('[data-fc-position-bar]'));
  const stripAt = kids.findIndex((k) => k.querySelector('[data-fc-strip]'));
  assert.ok(rowAt > -1, 'no control row');
  assert.ok(stripAt > -1, 'no strip');
  assert.ok(rowAt < stripAt, 'the control row must precede the strip');

  // …and the whole region comes after the stage, which is what puts the row
  // between them.
  const grid = doc.querySelector('[data-fc-slide]').parentElement;
  assert.equal(
    grid.compareDocumentPosition(region) & 4 /* DOCUMENT_POSITION_FOLLOWING */,
    4,
    'the strip region must follow the slide stack'
  );
});

test('the control row holds the buttons, then the track, then the counter', () => {
  const { doc } = renderSlider(pool());
  const row = doc.querySelector('[data-fc-position-bar]').parentElement;
  const kinds = [...row.children].map((c) =>
    c.getAttribute('data-fc-controls') !== null ? 'controls'
      : c.getAttribute('data-fc-position-bar') !== null ? 'track'
        : c.getAttribute('data-fc-counter') !== null ? 'counter' : '?');
  assert.deepEqual(kinds, ['controls', 'track', 'counter']);
});

test('there are exactly three controls, and they are real buttons', () => {
  const { doc } = renderSlider(pool());
  const btns = doc.querySelectorAll('[data-fc-controls] button');
  assert.equal(btns.length, 3, 'play, prev, next');
  for (const b of btns) {
    assert.equal(b.getAttribute('type'), 'button', 'never a submit inside a form');
    assert.ok(b.getAttribute('aria-label'), 'every control is named');
  }
});

test('the control row is NOT reversed at any width any more', () => {
  /**
   * It used to be `flex-row-reverse … lg:flex-row`, to keep the arrows off
   * FloatingActionDock's fixed bottom-right corner on a phone. Both mockup
   * frames put the buttons at the row's LEFT edge instead, so the reversal is
   * gone rather than merely still working — and the collision cannot come back,
   * because there is now no width at which these controls sit on the right.
   */
  const { doc } = renderSlider(pool());
  const row = doc.querySelector('[data-fc-position-bar]').parentElement;
  assert.equal(/flex-row-reverse/.test(row.className), false);
});

// ── THE COUNTER AND THE TRACK ARE ONE FACT ──────────────────────────────────

test('the counter reads the mockup\'s shape and the bar agrees with it', () => {
  const { doc } = renderSlider(pool());
  assert.equal(doc.querySelector('[data-fc-counter]').textContent, '01 / 10');
  assert.equal(doc.querySelector('[data-fc-position-thumb]').style.width, '10%');
});

test('the track is aria-hidden and the counter is NOT', () => {
  // The strip already conveys position properly — every card is a named button
  // and the active one carries aria-current — so a geometric ratio announced
  // again is noise. The counter is different: it is the only place the pool's
  // SIZE is stated.
  const { doc } = renderSlider(pool());
  assert.equal(doc.querySelector('[data-fc-position-bar]').getAttribute('aria-hidden'), 'true');
  assert.equal(doc.querySelector('[data-fc-counter]').getAttribute('aria-hidden'), null);
});

test('the counter uses tabular figures, so the row does not twitch', () => {
  const { doc } = renderSlider(pool());
  assert.match(doc.querySelector('[data-fc-counter]').className, /tabular-nums/);
});

// ── THE RATIOS ──────────────────────────────────────────────────────────────

test('the stage is 12:5 from lg, and its cap meets the ratio at 1200', () => {
  const { html } = renderSlider(pool());
  assert.match(html, /lg:aspect-\[12\/5\]/, 'the desktop stage is 12:5');
  assert.match(html, /lg:max-h-\[500px\]/, '1200 / 2.4 = 500 — the cap and the ratio meet');
  assert.equal(/lg:aspect-\[2\.5\/1\]/.test(html), false, 'the old 2.5:1 is gone');
});

test('the image card TOP-aligns its content below lg', () => {
  /**
   * `justify-center` here splits the reserved-height leftover into two equal
   * bands, one above the artwork and one below the copy. Measured at 375 while
   * it did: 81.13px above, 81.14px below — which frames the picture in empty
   * panel and reads as a failed render rather than as reserved space.
   *
   * `justify-start` collects the whole remainder underneath in one block, and
   * it is what the mobile mockup draws: the media container sits at y=0 inside
   * the card (38:3257), flush with its top edge.
   *
   * Asserted on the CLASS because that is what survives a tier with no
   * stylesheet. Where the pixels actually land is measured in test/browser.
   */
  const { doc } = renderSlider(pool());
  const card = doc.querySelector('[data-fc-card="image"]');
  assert.ok(card, 'no image card rendered');
  assert.match(card.className, /max-lg:justify-start/);
  assert.equal(/max-lg:justify-center/.test(card.className), false,
    'centring is overridden — the leftover collects at the bottom');
});

test('…while still stretching to fill the reserved height', () => {
  // The pairing matters: `justify-start` without `h-full` would shrink the card
  // to its content and leave raw page background under a short slide, which is
  // the thing the reservation exists to prevent.
  const { doc } = renderSlider(pool());
  const card = doc.querySelector('[data-fc-card="image"]');
  assert.match(card.className, /max-lg:h-full/);
  assert.match(card.className, /max-lg:flex-col/);
});

test('the image slide\'s artwork is 16:9 below lg', () => {
  const { doc } = renderSlider(pool());
  const art = doc.querySelector('[data-fc-art]');
  assert.ok(art, 'no artwork block');
  assert.match(art.className, /aspect-\[16\/9\]/);
  assert.equal(/aspect-\[2\.5\/1\]/.test(art.className), false, 'the old band shape is gone');
});

test('every strip thumbnail is 16:9', () => {
  const { doc } = renderSlider(pool());
  const cards = [...doc.querySelectorAll('[data-fc-strip-card]')];
  assert.equal(cards.length, 10, 'the strip is the whole pool');
  for (const c of cards) {
    assert.match(c.firstElementChild.className, /aspect-\[16\/9\]/);
  }
});

// ── THE CROP IS ANCHORED ────────────────────────────────────────────────────

test('a strip thumbnail is COVERED and anchored, not contained', () => {
  const { doc } = renderSlider(pool());
  const img = doc.querySelector('[data-fc-strip-card] img');
  assert.ok(img, 'no thumbnail image');
  assert.match(img.className, /object-cover/, 'the mockup says Cover, not contain');
  assert.equal(/object-contain/.test(img.className), false, 'the old ruling is reversed');
  assert.equal(img.style.objectPosition, '40% 50%',
    'the left-biased DEFAULT_FOCAL, because the record stores none — NOT 50% 50%');
});

test('the featured artwork is anchored from the same value', () => {
  const { doc } = renderSlider(pool());
  const img = doc.querySelector('[data-fc-art] img');
  assert.ok(img, 'no featured image');
  assert.match(img.className, /object-cover/);
  assert.equal(img.style.objectPosition, '40% 50%');
});

test('the stage and the strip agree on the default, not just on a stored value', () => {
  // They are two frames over ONE picture. A default resolved twice is the exact
  // shape of the bug where a record is cropped one way in the strip and another
  // way in the card that strip feeds.
  const { doc } = renderSlider(pool());
  assert.equal(
    doc.querySelector('[data-fc-art] img').style.objectPosition,
    doc.querySelector('[data-fc-strip-card] img').style.objectPosition
  );
});

test('a stored focal point reaches BOTH the stage and the strip', () => {
  // The two frames crop the same picture, so a focal point that reached only
  // one of them would show the record cropped two different ways on one screen.
  const { doc } = renderSlider([
    imageBanner({ image_focal: { x: 18, y: 62 } }),
    videoBanner(),
  ]);
  assert.equal(doc.querySelector('[data-fc-art] img').style.objectPosition, '18% 62%');
  assert.equal(
    doc.querySelector('[data-fc-strip-card] img').style.objectPosition,
    '18% 62%'
  );
});

test('CONTROL: object-position really comes from the record', () => {
  const a = renderSlider([imageBanner({ image_focal: { x: 5, y: 5 } }), videoBanner()]);
  const b = renderSlider([imageBanner({ image_focal: { x: 95, y: 95 } }), videoBanner()]);
  assert.notEqual(
    a.doc.querySelector('[data-fc-art] img').style.objectPosition,
    b.doc.querySelector('[data-fc-art] img').style.objectPosition
  );
});

// ── THE HINT, AND THE DIVERGENCE WE CHOSE ───────────────────────────────────

test('the mobile hint line is rendered, and is lg:hidden rather than absent', () => {
  const { doc } = renderSlider(pool());
  const hint = doc.querySelector('[data-fc-hint]');
  assert.ok(hint, 'the mobile mockup\'s closing line is missing');
  assert.ok(hint.textContent.startsWith('ปัดซ้าย–ขวา'), hint.textContent);
  assert.match(hint.className, /lg:hidden/,
    'a mouse does not swipe — the desktop frame draws no such line');
});

test('strip cards KEEP their description — the deliberate divergence', () => {
  /**
   * Both mockup frames draw a card body of chip + title and nothing else. The
   * description stays: it is the only thing distinguishing two records whose
   * titles begin with the same words, and the strip is the whole pool now
   * rather than three cards.
   */
  const { doc } = renderSlider(pool());
  const video = [...doc.querySelectorAll('[data-fc-strip-card]')]
    .find((c) => c.textContent.includes('คำอธิบาย'));
  assert.ok(video, 'no strip card carries its cardSubtitle');
});

test('a strip card still contains no anchor — it promotes, it does not navigate', () => {
  const { doc } = renderSlider(pool());
  for (const c of doc.querySelectorAll('[data-fc-strip-card]')) {
    assert.equal(c.querySelectorAll('a').length, 0);
  }
});

test('exactly one card is marked current, and it is the first', () => {
  const { doc } = renderSlider(pool());
  const current = [...doc.querySelectorAll('[data-fc-strip-card]')]
    .filter((c) => c.getAttribute('aria-current') === 'true');
  assert.equal(current.length, 1);
  assert.equal(current[0], doc.querySelector('[data-fc-strip-card]'));
});

// ── A POOL TOO SMALL FOR ANY OF IT ──────────────────────────────────────────

test('a single-item pool renders no control row, no track and no counter', () => {
  // There is nothing to move through, and `01 / 01` beside a full bar is ink
  // spent saying so.
  const { doc } = renderSlider([imageBanner()]);
  assert.ok(doc.querySelector('[data-fc-card="image"]'), 'the one card still renders');
  assert.equal(doc.querySelector('[data-fc-strip-region]'), null);
  assert.equal(doc.querySelector('[data-fc-counter]'), null);
  assert.equal(doc.querySelector('[data-fc-position-bar]'), null);
});
