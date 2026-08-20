/**
 * THE FACADE: nothing from YouTube's PLAYER is fetched until someone presses
 * play, and the inactive slides fetch no pictures at all.
 *
 * ── WHAT COUNTS AS "A YOUTUBE REQUEST" ──────────────────────────────────────
 * `i.ytimg.com/vi/<id>/maxresdefault.jpg` is the thumbnail and it is SUPPOSED
 * to load — it is the picture on the card. What must not load is the player:
 * youtube.com and youtube-nocookie.com, which is the ~1MB and the several round
 * trips the facade exists to defer. Counting every ytimg request as a violation
 * would make this harness fail on the feature working correctly.
 *
 * The second half is the one that was measured rather than assumed: every slide
 * is in the DOM so the grid can reserve the tallest height, and `loading=lazy`
 * does NOT save anything for a `visibility:hidden` slide — such an element
 * still has a layout box inside the viewport. So an inactive slide renders no
 * <img> at all, and this counts the thumbnails to prove it.
 */
import { launch, openPage, tape } from './cdp.mjs';

const PLAYER = /(^|\/\/)([a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com)\//i;
/**
 * The thumbnail, as it actually appears on the wire.
 *
 * NOT `i.ytimg.com` directly. next/image proxies every remote source through
 * `/_next/image?url=<encoded>`, so the ytimg host never appears as a request
 * origin and a matcher looking for it counts zero — which passes a
 * "no more than N thumbnails" assertion for entirely the wrong reason. That is
 * what the first version of this did.
 */
const THUMB = (u) => {
  const m = /\/_next\/image\?url=([^&]+)/.exec(u);
  const src = m ? decodeURIComponent(m[1]) : u;
  return /i\.ytimg\.com\/vi\//i.test(src) ? src : null;
};

const t = tape('youtube facade');
const { browser, close } = await launch();
const page = await openPage(browser, { width: 1440, height: 900 });

try {
  await page.goto('/', { waitMs: 6000 });
  await page.eval(() => {
    const r = document.querySelector('[data-fc-slider]').getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + r.top - 40, behavior: 'instant' });
  });
  await page.wait(2500);

  const playerBefore = page.requests.filter((u) => PLAYER.test(u));
  t.eq(playerBefore.length, 0,
    'ZERO player requests before the first click', playerBefore.slice(0, 3).join(' '));

  // The thumbnails that DID load: one per visible strip card plus, when the
  // featured slide is a video, the featured one. Never one per pool item.
  const thumbs = new Set(page.requests.map(THUMB).filter(Boolean));
  const imgCount = await page.eval(() => ({
    slides: document.querySelectorAll('[data-fc-slide]').length,
    imgsInInactive: document.querySelectorAll('[data-fc-slide="inactive"] img').length,
    imgsInActive: document.querySelectorAll('[data-fc-slide="active"] img').length,
  }));
  t.ok(imgCount.slides > 1, 'every slide is in the DOM', `${imgCount.slides} slides`);
  t.eq(imgCount.imgsInInactive, 0,
    'and an INACTIVE slide renders no <img> at all', `${imgCount.imgsInInactive}`);
  t.ok(imgCount.imgsInActive >= 1, 'while the active one does');
  t.ok(thumbs.size > 0,
    'the strip DID fetch YouTube thumbnails — the matcher is not blind',
    `${thumbs.size} distinct`);
  t.ok(thumbs.size <= imgCount.slides,
    'and no more of them than there are slides — not one per pool item twice',
    `${thumbs.size} distinct vs ${imgCount.slides} slides`);

  // ── PRESS PLAY ────────────────────────────────────────────────────────────
  const promoted = await (async () => {
    const n = await page.eval(() => document.querySelectorAll('[data-fc-strip-card]').length);
    for (let i = 0; i < n; i += 1) {
      await page.eval((j) => document.querySelectorAll('[data-fc-strip-card]')[j].click(), i);
      await page.wait(300);
      const ok = await page.eval(() =>
        Boolean(document.querySelector('[data-fc-slide="active"] [data-fc-card="split"] button')));
      if (ok) return i;
    }
    return null;
  })();
  t.ok(promoted !== null, 'a video slide with a play control is reachable', `card ${promoted}`);

  const stillZero = page.requests.filter((u) => PLAYER.test(u));
  t.eq(stillZero.length, 0,
    'still zero after landing ON a video slide — the facade is the resting state');

  // ── PRESS PLAY ON THE SLIDE THAT IS ACTIVE *NOW* ─────────────────────────
  // Read the active slide's id first and pin every later query to it. The
  // previous version re-resolved `[data-fc-slide="active"]` at each step, so if
  // the active slide changed between the click and the check it silently
  // examined a DIFFERENT card and reported "the iframe is not in the tree" —
  // which reads as the facade being broken. Measured: 13/13 in isolation, 11/13
  // once inside the full six-script run. Pinning the id makes the two cases
  // distinguishable instead of merging them into one confusing failure.
  const playedOn = await page.eval(() => {
    const slide = document.querySelector('[data-fc-slide="active"]');
    const btn = slide.querySelector('[data-fc-card="split"] button');
    btn.click();
    return slide.getAttribute('data-fc-slide-id')
      ?? [...document.querySelectorAll('[data-fc-slide]')].indexOf(slide);
  });
  await page.wait(3500);

  const after = page.requests.filter((u) => PLAYER.test(u));
  t.ok(after.length > 0, 'pressing play DOES mount the player', `${after.length} requests`);
  t.ok(after.some((u) => /youtube-nocookie\.com/.test(u)),
    'and it is the nocookie host, not youtube.com');

  const state = await page.eval((at) => {
    const slides = [...document.querySelectorAll('[data-fc-slide]')];
    const f = document.querySelector('[data-feature-video]');
    return {
      iframe: f ? { src: f.getAttribute('src'), title: Boolean(f.getAttribute('title')) } : null,
      stillActive: slides[at]?.getAttribute('data-fc-slide') === 'active',
      activeNow: slides.findIndex((s) => s.getAttribute('data-fc-slide') === 'active'),
      playedOn: at,
      paused: document.querySelector('[data-fc-slider]').getAttribute('data-fc-paused'),
      autoplay: document.querySelector('[data-fc-slider]').getAttribute('data-fc-autoplay'),
    };
  }, playedOn);

  // The diagnosis travels WITH the assertion. A bare "the iframe is in the
  // tree" failure cannot tell you whether the facade broke or the carousel
  // moved on, and those need opposite fixes.
  const why = `played on slide ${state.playedOn}, active now ${state.activeNow}, `
    + `paused=${state.paused} autoplay=${state.autoplay}`;
  t.ok(state.stillActive,
    'the slide play was pressed on is STILL the active one', why);
  t.ok(state.iframe, 'the iframe is in the tree', why);
  t.ok(state.iframe?.src.includes('autoplay=1'),
    'autoplay is honest — the mount only happened because someone pressed play',
    state.iframe ? '' : why);

  // ── LEAVING THE SLIDE DESTROYS IT ─────────────────────────────────────────
  await page.eval(() => document.querySelectorAll('[data-fc-controls] button')[2].click());
  await page.wait(900);
  t.eq(await page.eval(() => document.querySelectorAll('[data-feature-video]').length), 0,
    'advancing UNMOUNTS the player — no audio from a card nobody can see');
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
