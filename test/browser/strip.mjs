/**
 * THE STRIP AND ITS CONTROL ROW, measured against the two carousel mockups.
 *
 * Figma file TLKzWZOYVUHl0PHUTseUD9 — `Desktop Featured Content Carousel
 * Mockup` (38:3012) and `Mobile Featured Content Carousel Mockup` (38:3231).
 *
 * ── WHICH OF THE MOCKUP'S NUMBERS ARE BINDING, AND WHICH ARE NOT ────────────
 * The desktop frame is 1920 wide with a 1480 content column. This section's
 * content column is the repo's own `max-w-[1200px]` — the same normalisation
 * the section header already records for the previous 1440 artboard — so the
 * mockup's PIXEL widths do not transfer and its RATIOS do. What is asserted
 * below is therefore:
 *
 *   ratios exactly            16:9 thumbnails, the 12:5 stage
 *   counts exactly            four cards fully visible plus one peeking
 *   proportions within 1pp    card width as a share of the container
 *   pixels exactly            only where the number is an affordance rather
 *                             than layout: the 44/46px controls and their
 *                             pitch, the 5px track, the 16px gap
 */
import { launch, openPage, tape } from './cdp.mjs';

/**
 * The anchor a record with no stored focal point gets.
 *
 * SPELLED OUT HERE ON PURPOSE, as a literal rather than an import. This file
 * runs against the SERVED page, so importing the constant from the module that
 * page was built from would make the check tautological — it would compare the
 * value to itself and pass however badly the wiring is broken. Writing it out
 * is what makes it a check on what the browser actually received.
 *
 * It is deliberately NOT '50% 50%'. The sweep behind the number is on
 * DEFAULT_FOCAL in src/lib/home/featureContentFromBanners.js.
 */
const DEFAULT_FOCAL = '40% 50%';

const t = tape('strip');
const { browser, close } = await launch();

const HINT =
  'ปัดซ้าย–ขวา หรือเลือกการ์ด เพื่อดูการเปลี่ยนระหว่าง Banner และ Video Template';

const probe = () => ({
  order: [...document.querySelector('[data-fc-strip-region]').children].map((c) =>
    c.querySelector('[data-fc-position-bar]') ? 'controlRow'
      : c.querySelector('[data-fc-strip]') ? 'strip'
        : c.getAttribute('data-fc-hint') !== null ? 'hint' : '?'),
  stage: (() => {
    const el = document.querySelector('[data-fc-slide="active"] [data-fc-card]');
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, bottom: r.bottom, ratio: r.width / r.height };
  })(),
  art: (() => {
    const el = document.querySelector('[data-fc-slide="active"] [data-fc-art]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const img = el.querySelector('img');
    const cs = img ? getComputedStyle(img) : null;
    return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), ratio: r.width / r.height,
             fit: cs?.objectFit ?? null, pos: cs?.objectPosition ?? null };
  })(),
  row: (() => {
    const el = document.querySelector('[data-fc-strip-region]')
      .querySelector('[data-fc-position-bar]').parentElement;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  })(),
  btns: [...document.querySelectorAll('[data-fc-controls] button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height),
             left: +r.left.toFixed(1), right: +r.right.toFixed(1) };
  }),
  track: (() => {
    const el = document.querySelector('[data-fc-position-bar]');
    const r = el.getBoundingClientRect();
    return { h: +r.height.toFixed(1), w: +r.width.toFixed(1),
             fill: document.querySelector('[data-fc-position-thumb]').style.width,
             hidden: el.getAttribute('aria-hidden') };
  })(),
  counter: (() => {
    const el = document.querySelector('[data-fc-counter]');
    const r = el.getBoundingClientRect();
    return { text: el.textContent, right: +r.right.toFixed(1),
             hidden: el.getAttribute('aria-hidden') };
  })(),
  strip: (() => {
    const el = document.querySelector('[data-fc-strip]');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { top: r.top, left: r.left, right: r.right, w: +r.width.toFixed(1),
             scrollW: el.scrollWidth, clientW: el.clientWidth,
             snap: cs.scrollSnapType, padLeft: cs.scrollPaddingLeft,
             overflowX: cs.overflowX };
  })(),
  cards: [...document.querySelectorAll('[data-fc-strip-card]')].map((c) => {
    const r = c.getBoundingClientRect();
    const thumb = c.firstElementChild.getBoundingClientRect();
    const img = c.querySelector('img');
    const cs = img ? getComputedStyle(img) : null;
    return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1),
             thumbRatio: thumb.width / thumb.height,
             fit: cs?.objectFit ?? null, pos: cs?.objectPosition ?? null,
             current: c.getAttribute('aria-current'),
             anchors: c.querySelectorAll('a').length,
             hasChip: Boolean(c.querySelector('span[class*="rounded"]')),
             texts: [...c.querySelectorAll('p')].length };
  }),
  fades: {
    start: Boolean(document.querySelector('[data-fc-fade="start"]')),
    end: Boolean(document.querySelector('[data-fc-fade="end"]')),
  },
  hint: (() => {
    const el = document.querySelector('[data-fc-hint]');
    if (!el) return null;
    return { text: el.textContent, shown: getComputedStyle(el).display !== 'none' };
  })(),
  dock: (() => {
    const el = document.querySelector('[data-floating-dock]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  })(),
});

async function desktop() {
  const page = await openPage(browser, { width: 1440, height: 900 });
  await page.goto('/', { waitMs: 5500 });
  await page.eval(() => {
    const r = document.querySelector('[data-fc-slider]').getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - 40, behavior: 'instant' });
  });
  await page.wait(700);
  // Stop auto-slide so the geometry below is of a still page.
  await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[0].click());
  await page.wait(400);
  const p = await page.eval(probe);
  const C = p.strip.right - p.strip.left; // the container width

  // ── WHERE THE CONTROL ROW SITS ──────────────────────────────────────────
  t.eq(p.order.join(','), 'controlRow,strip,hint',
    '@1440 the control row comes BEFORE the strip in the tree');
  t.ok(p.row.top >= p.stage.bottom - 1,
    '@1440 …and BELOW the stage on screen', `row ${p.row.top.toFixed(0)} vs stage ${p.stage.bottom.toFixed(0)}`);
  t.ok(p.row.bottom <= p.strip.top + 1,
    '@1440 …and ABOVE the strip on screen', `row ${p.row.bottom.toFixed(0)} vs strip ${p.strip.top.toFixed(0)}`);

  // ── THE STAGE ───────────────────────────────────────────────────────────
  t.near(p.stage.ratio, 2.4, 0.01, '@1440 the stage is 12:5');
  t.eq(Math.round(p.stage.h), 500, '@1440 …and the ratio meets the cap at exactly 500');
  t.eq(p.art?.fit, 'cover', '@1440 the artwork covers the frame');
  t.eq(p.art?.pos, DEFAULT_FOCAL,
    '@1440 …anchored at DEFAULT_FOCAL, the record storing none');
  t.ok(p.art?.pos !== '50% 50%',
    '@1440 …and that default is NOT the CSS centre, which decapitates all five');

  // ── THE THREE BUTTONS ───────────────────────────────────────────────────
  t.eq(p.btns.length, 3, '@1440 three controls: play, prev, next');
  t.ok(p.btns.every((b) => b.w === 46 && b.h === 46), '@1440 each is 46×46',
    JSON.stringify(p.btns.map((b) => `${b.w}x${b.h}`)));
  t.eq(Math.round(p.btns[1].left - p.btns[0].left), 55, '@1440 pitch 55');
  t.eq(Math.round(p.btns[2].left - p.btns[1].left), 55, '@1440 …and 55 again, evenly');
  t.near(p.btns[0].left, p.strip.left, 1,
    '@1440 they are LEFT-aligned with the content column');

  // ── THE TRACK AND THE COUNTER ───────────────────────────────────────────
  t.eq(p.track.h, 5, '@1440 the progress track is 5px tall');
  t.eq(p.track.hidden, 'true', '@1440 …and aria-hidden — the strip already says this');
  t.near(p.track.w / C, 1230 / 1480, 0.03,
    '@1440 …and takes the mockup\'s share of the row', `${(p.track.w / C).toFixed(3)}`);
  t.eq(p.track.fill, '10%', '@1440 the fill is (index+1)/total, not a scroll offset');
  t.eq(p.counter.text, '01 / 10', '@1440 the counter reads the mockup\'s shape');
  t.eq(p.counter.hidden, null, '@1440 …and is NOT aria-hidden — it states the pool size');
  t.near(p.counter.right, p.strip.right, 1.5,
    '@1440 …right-aligned with the content column');

  // ── THE CARDS ───────────────────────────────────────────────────────────
  const card = p.cards[0];
  t.near(card.w / C, 330 / 1480, 0.01,
    '@1440 a card is the mockup\'s share of the container', `${(card.w / C).toFixed(4)}`);
  t.eq(Math.round(p.cards[1].left - p.cards[0].left) - Math.round(card.w), 16,
    '@1440 the gap between cards is 16px');
  t.ok(p.cards.every((c) => Math.abs(c.thumbRatio - 16 / 9) < 0.01),
    '@1440 EVERY thumbnail is 16:9', `${p.cards[0].thumbRatio.toFixed(4)}`);
  t.ok(p.cards.every((c) => c.fit === 'cover'),
    '@1440 …filled by cover, not letterboxed by contain');
  t.ok(p.cards.every((c) => c.pos === DEFAULT_FOCAL),
    '@1440 …and every thumbnail is anchored the same way', p.cards[0].pos);
  t.eq(p.cards[0].pos, p.art?.pos,
    '@1440 the strip and the stage crop the SAME picture the SAME way');
  const fully = p.cards.filter((c) => c.left >= p.strip.left - 1 && c.right <= p.strip.right + 1);
  const peek = p.cards.filter((c) => c.left < p.strip.right - 1 && c.right > p.strip.right + 1);
  t.eq(fully.length, 4, '@1440 FOUR cards are fully visible');
  t.eq(peek.length, 1, '@1440 …plus exactly one peeking past the edge');
  t.ok(p.cards.every((c) => c.anchors === 0),
    '@1440 a strip card contains no anchor — it promotes, it does not navigate');
  t.eq(p.cards.filter((c) => c.current === 'true').length, 1,
    '@1440 exactly one card carries aria-current');
  t.ok(p.cards.every((c) => c.hasChip), '@1440 every card body opens with its chip');
  t.ok(p.cards.some((c) => c.texts >= 2),
    '@1440 the description line is KEPT — the deliberate divergence from the mockup');

  // ── THE SCROLLER ────────────────────────────────────────────────────────
  t.ok(p.strip.scrollW > p.strip.clientW, '@1440 the strip really does overflow');
  t.ok(/mandatory/.test(p.strip.snap), '@1440 snapping is mandatory, not proximity');
  t.eq(p.strip.padLeft, '64px', '@1440 scroll-padding clears the 64px leading fade');
  t.eq(p.fades.start, false, '@1440 at rest there is no LEADING fade — nothing is behind it');
  t.eq(p.fades.end, true, '@1440 …and a trailing one, because there is');
  t.eq(p.hint?.shown, false, '@1440 the swipe hint is hidden — a mouse does not swipe');

  // Scroll to the end and the fades must swap.
  await page.eval(() => {
    const el = document.querySelector('[data-fc-strip]');
    el.scrollLeft = el.scrollWidth;
  });
  await page.wait(700);
  const atEnd = await page.eval(() => ({
    start: Boolean(document.querySelector('[data-fc-fade="start"]')),
    end: Boolean(document.querySelector('[data-fc-fade="end"]')),
  }));
  t.eq(atEnd.start, true, '@1440 scrolled to the end, the leading fade appears');
  t.eq(atEnd.end, false, '@1440 …and the trailing one goes — a fade must not lie');

  // Picking a card moves the stage and the counter together.
  await page.eval(() => document.querySelectorAll('[data-fc-strip-card]')[6].click());
  await page.wait(700);
  const after = await page.eval(() => ({
    counter: document.querySelector('[data-fc-counter]').textContent,
    fill: document.querySelector('[data-fc-position-thumb]').style.width,
    current: [...document.querySelectorAll('[data-fc-strip-card]')]
      .findIndex((c) => c.getAttribute('aria-current') === 'true'),
  }));
  t.eq(after.current, 6, '@1440 picking card 7 makes it the current one');
  t.eq(after.counter, '07 / 10', '@1440 …the counter follows');
  t.eq(after.fill, '70%', '@1440 …and so does the bar, from the same function');

  await page.close();
}

async function mobile() {
  const page = await openPage(browser, { width: 375, height: 812, mobile: true });
  await page.goto('/', { waitMs: 5500 });
  await page.eval(() => {
    const r = document.querySelector('[data-fc-strip-region]').getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - 200, behavior: 'instant' });
  });
  await page.wait(700);
  const p = await page.eval(probe);

  t.eq(p.order.join(','), 'controlRow,strip,hint',
    '@375 the control row comes BEFORE the strip here too');
  t.ok(p.row.bottom <= p.strip.top + 1, '@375 …and above it on screen');

  t.near(p.art?.ratio ?? 0, 16 / 9, 0.01, '@375 the stage media is 16:9');
  t.eq(Math.round(p.art?.w ?? 0), 341, '@375 …and still full-bleed inside the card');
  t.eq(p.art?.fit, 'cover', '@375 covered');
  t.eq(p.art?.pos, DEFAULT_FOCAL, '@375 …at DEFAULT_FOCAL');
  t.ok(p.cards.every((c) => c.pos === DEFAULT_FOCAL),
    '@375 …and so is every strip thumbnail', p.cards[0].pos);

  t.ok(p.btns.every((b) => b.w === 44 && b.h === 44), '@375 the controls are 44×44',
    JSON.stringify(p.btns.map((b) => `${b.w}x${b.h}`)));
  t.eq(Math.round(p.btns[1].left - p.btns[0].left), 51, '@375 pitch 51');
  t.eq(p.track.h, 5, '@375 the track is 5px here too');
  t.ok(p.counter.text?.includes(' / '), '@375 the counter is present', p.counter.text);

  // ── THE CONTROLS ARE CLEAR OF THE FIXED DOCK ────────────────────────────
  // FloatingActionDock is `fixed right-4` and owns the bottom-right corner.
  // The mockup puts these three at the row's LEFT edge, which is why the old
  // `flex-row-reverse` is gone rather than merely still working.
  t.ok(p.dock, '@375 the floating dock is on the page at all');
  if (p.dock) {
    const clash = p.btns.some((b) =>
      b.right > p.dock.left && b.left < p.dock.right);
    t.eq(clash, false, '@375 no control overlaps the fixed dock horizontally',
      `buttons end at ${p.btns[2].right}, dock starts at ${p.dock.left.toFixed(0)}`);
  }

  t.near(p.cards[0].w, 280, 1, '@375 a strip card is 280 wide');
  t.ok(p.cards.every((c) => Math.abs(c.thumbRatio - 16 / 9) < 0.01),
    '@375 every thumbnail is 16:9');
  t.ok(p.cards.every((c) => c.fit === 'cover'), '@375 …covered');
  t.near(p.strip.w, 375, 1,
    '@375 the strip bleeds to the viewport edge, so a card can scroll clear out');
  t.ok(p.cards.some((c) => c.right > p.strip.right),
    '@375 …and a card peeks past the section edge, as the mockup draws it');

  t.eq(p.hint?.shown, true, '@375 the swipe hint IS shown');
  t.eq(p.hint?.text, HINT, '@375 …and it is the mockup\'s sentence, verbatim');

  await page.close();
}

try {
  await desktop();
  await mobile();
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
