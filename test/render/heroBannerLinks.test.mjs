import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HeroBannerCarousel } from '@/app/_components/home/HeroBannerCarousel';

/**
 * Every clickable surface of the hero carousel emits a REAL ANCHOR.
 *
 * ── WHY THIS IS A RENDER TEST ───────────────────────────────────────────────
 * The image slide used to navigate from an onClick on a `<div role="link">`.
 * That is not a link: no middle-click, no ctrl/cmd-click, no "open in new tab",
 * no status-bar preview, nothing for a crawler to follow — and, the reported
 * bug, nothing at all when the click was retargeted away from the div by the
 * carousel's pointer capture. A source grep cannot tell a real anchor from a
 * div with a click handler; the emitted markup can.
 *
 * The three slide types read ONE admin field (`link_url`) and must treat it
 * identically, so all three are asserted here rather than just the one that
 * broke.
 *
 * ── DESKTOP TYPES ONLY, AND WHY THAT IS COMPLETE ────────────────────────────
 * `useFilteredBanners` starts at isMobile=false and corrects in an effect,
 * which renderToStaticMarkup never runs — so only `image_desktop`,
 * `image_button_desktop` and `youtube` reach the markup. That is not a gap:
 * `image_mobile` shares a `case` block with `image_desktop` and
 * `image_button_mobile` with `image_button_desktop`, so the desktop render
 * exercises the identical code path. Splitting them would test the switch
 * statement, not the linking.
 *
 * ── ATTRIBUTE MATCHING RULE ─────────────────────────────────────────────────
 * Every assertion matches `attr="value"`, never a bare attribute NAME. Tailwind
 * state variants are attribute names followed by a colon — `disabled:opacity-30`,
 * `target:`, `open:` — and `:` is a non-word character, so `\btarget\b` happily
 * matches inside a class string and an "is it there" assertion passes for
 * entirely the wrong reason. This repo has been bitten by that twice.
 */

const IMAGE = 'https://res.cloudinary.com/demo/image/upload/banner.jpg';

/** Regex-safe literal. hrefs carry /, :, ?, + — all regex metacharacters. */
const lit = (s) => s.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');

const anchorTo = (html, href) => new RegExp(`<a\\b[^>]*href="${lit(href)}"`).test(html);

/**
 * Render one banner in its own carousel and return the markup plus anything
 * the render wrote to console.warn.
 *
 * The console patch is strictly SYNCHRONOUS — patch, render, restore, no await
 * in between. The runner is concurrency:true with isolation:'none', so a patch
 * held across an await point would swallow another test file's output.
 *
 * One banner per render keeps assertions unambiguous: with total === 1 the
 * carousel emits no dots and no prev/next buttons, so every anchor in the
 * output belongs to the slide under test.
 */
function renderBanners(banners) {
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  let html;
  try {
    html = renderToStaticMarkup(createElement(HeroBannerCarousel, { banners }));
  } finally {
    console.warn = original;
  }
  return { html, warnings };
}

const renderBanner = (banner) => renderBanners([banner]);

/**
 * Two banners, so `total > 1` and the dots/play-pause overlay actually renders.
 * Every other test here uses one banner precisely to keep that overlay OUT of
 * the markup; these two need it in.
 */
function renderBanner2Up() {
  return renderBanners([
    { _id: 'render-dots-1', type: 'image_desktop', title: 'ก', image_url: IMAGE, link_url: '/a' },
    { _id: 'render-dots-2', type: 'image_desktop', title: 'ข', image_url: IMAGE, link_url: '/b' },
  ]);
}

const imageBanner = (over) => ({
  _id: 'render-img',
  type: 'image_desktop',
  title: 'แบนเนอร์หน้าแรก',
  image_url: IMAGE,
  ...over,
});

// ── the full-image slide — the surface that was broken ──────────────────────

test('an internal image banner emits a real anchor, not role="link"', () => {
  const { html } = renderBanner(imageBanner({ _id: 'render-img-internal', link_url: '/course/excel' }));
  assert.equal(anchorTo(html, '/course/excel'), true, 'the image slide must be wrapped in an <a href>');
  assert.doesNotMatch(html, /role="link"/, 'the hand-rolled fake link is back');
  assert.doesNotMatch(html, /tabindex="0"/i, 'an <a href> is focusable natively — no hand-rolled tabIndex');
});

test('the anchor keeps the positioned box `<Image fill>` needs', () => {
  // `<Image fill>` is position:absolute. Its positioned ancestor used to be a
  // wrapper div INSIDE the click handler; the anchor replaced that wrapper, so
  // `relative w-full h-full` had to move onto the anchor. If it did not, the
  // image escapes to the nearest positioned ancestor (the track) and the slide
  // renders blank — a silent, total visual failure that no href assertion sees.
  const { html } = renderBanner(imageBanner({ _id: 'render-img-box', link_url: '/course/excel' }));
  const anchor = html.match(/<a\b[^>]*href="\/course\/excel"[^>]*>/);
  assert.ok(anchor, 'anchor not found');
  assert.match(anchor[0], /class="[^"]*\brelative\b/, 'the anchor must establish the positioning context');
  assert.match(anchor[0], /class="[^"]*\bw-full\b/);
  assert.match(anchor[0], /class="[^"]*\bh-full\b/);
});

test('an external image banner opens in a new tab, safely', () => {
  const { html } = renderBanner(
    imageBanner({ _id: 'render-img-external', link_url: 'https://9expert.co.th/promo' })
  );
  const anchor = html.match(/<a\b[^>]*href="https:\/\/9expert\.co\.th\/promo"[^>]*>/);
  assert.ok(anchor, 'external anchor not found');
  assert.match(anchor[0], /target="_blank"/);
  // Without rel=noopener the opened tab keeps a live window.opener handle back.
  assert.match(anchor[0], /rel="noopener noreferrer"/);
});

test('a mailto: banner is a plain anchor — no target, no rel', () => {
  const { html } = renderBanner(
    imageBanner({ _id: 'render-img-mailto', link_url: 'mailto:info@9expert.co.th' })
  );
  const anchor = html.match(/<a\b[^>]*href="mailto:info@9expert\.co\.th"[^>]*>/);
  assert.ok(anchor, 'mailto anchor not found');
  assert.doesNotMatch(anchor[0], /target="_blank"/, 'target=_blank on a mail handoff leaves a dead blank tab');
});

test('a dangerous link renders the slide UNLINKED, and says so', () => {
  const { html, warnings } = renderBanner(
    imageBanner({ _id: 'render-img-blocked', link_url: 'javascript:alert(1)' })
  );
  assert.doesNotMatch(html, /<a\b/, 'a refused link must produce no anchor at all');
  assert.doesNotMatch(html, /javascript:/i, 'the refused URL must not reach the markup in any attribute');
  // The banner itself still renders — refusing a link must not blank the slide.
  assert.match(html, new RegExp(`<img[^>]*src="${lit(IMAGE)}"`));
  assert.equal(warnings.length, 1, 'a silent drop is the defect class this guard exists for');
  assert.match(warnings[0], /render-img-blocked/, 'the warning must name the _id');
});

test('a banner with no link_url renders unlinked and unremarkably', () => {
  const { html, warnings } = renderBanner(imageBanner({ _id: 'render-img-nolink' }));
  assert.doesNotMatch(html, /<a\b/);
  assert.match(html, new RegExp(`<img[^>]*src="${lit(IMAGE)}"`));
  assert.equal(warnings.length, 0, 'no link_url is normal, not an error — it must not warn');
});

test('every banner anchor opts out of native dragging', () => {
  // An <a href> is a NATIVE DRAG SOURCE. Once the browser starts a link drag it
  // stops delivering pointermove, so the carousel's window listeners go silent
  // mid-gesture: the 5px threshold is never crossed, the slide does not move,
  // and the user drags a translucent ghost of the banner instead. The old
  // `<div role="link">` was not a drag source, so the anchor INTRODUCED this.
  //
  // This test sees the ATTRIBUTE only. That no ghost appears and that
  // pointermove keeps flowing are behavioural and unobservable here — see the
  // cannot-see list in test/fs/heroBannerPointerCapture.test.mjs.
  const cases = [
    ['internal', '/course/excel'],
    ['external', 'https://9expert.co.th/promo'],
    ['plain', 'mailto:info@9expert.co.th'],
  ];
  for (const [kind, link_url] of cases) {
    const { html } = renderBanner(imageBanner({ _id: `render-drag-${kind}`, link_url }));
    const anchor = html.match(/<a\b[^>]*>/);
    assert.ok(anchor, `${kind}: anchor not found`);
    assert.match(anchor[0], /draggable="false"/, `${kind}: anchor is still a drag source`);
  }
  // The <Image> inside keeps its OWN draggable={false} — an <img> is
  // independently draggable and the anchor's opt-out does not cover it. That
  // one is NOT asserted here and cannot be: test/stub-next-image.mjs renders
  // `{ src, alt }` and deliberately drops every other prop, so `draggable`
  // never reaches the markup under this loader no matter what the source says.
  // Asserting it would test the stub. It is pre-existing and untouched by this
  // commit; the anchor is the surface this change introduced.
});

test('the CTA anchors opt out too', () => {
  // Dragging a link's TEXT starts the same native drag as dragging an image.
  const { html: btn } = renderBanner({
    _id: 'render-drag-btn',
    type: 'image_button_desktop',
    title: 'แบนเนอร์ปุ่ม',
    image_url: IMAGE,
    link_url: '/schedule',
    link_text: 'ดูตารางอบรม',
  });
  assert.match(btn.match(/<a\b[^>]*>/)[0], /draggable="false"/, 'image_button CTA is a drag source');

  const { html: yt } = renderBanner({
    _id: 'render-drag-yt',
    type: 'youtube',
    title: 'วิดีโอแนะนำ',
    youtube_id: 'dQw4w9WgXcQ',
    link_url: 'https://9expert.co.th/course/powerbi',
    link_text: 'ดูรายละเอียด',
  });
  assert.match(yt.match(/<a\b[^>]*>/)[0], /draggable="false"/, 'youtube CTA is a drag source');
});

// ── the CTA slides — same field, same rules ─────────────────────────────────

test('the image_button CTA emits an anchor carrying its label', () => {
  const { html } = renderBanner({
    _id: 'render-btn',
    type: 'image_button_desktop',
    title: 'แบนเนอร์ปุ่ม',
    image_url: IMAGE,
    link_url: '/schedule',
    link_text: 'ดูตารางอบรม',
  });
  assert.equal(anchorTo(html, '/schedule'), true);
  assert.match(html, /<a\b[^>]*href="\/schedule"[^>]*>ดูตารางอบรม<\/a>/);
});

test('a dangerous image_button link hides the CTA rather than rendering it dead', () => {
  const { html, warnings } = renderBanner({
    _id: 'render-btn-blocked',
    type: 'image_button_desktop',
    title: 'แบนเนอร์ปุ่ม',
    image_url: IMAGE,
    link_url: 'vbscript:msgbox(1)',
    link_text: 'ดูตารางอบรม',
  });
  assert.doesNotMatch(html, /<a\b/);
  // A button that renders but does nothing is worse than no button: it looks
  // like the site is broken rather than like the banner has no link.
  assert.doesNotMatch(html, /ดูตารางอบรม/, 'a CTA with no destination must not be painted');
  assert.equal(warnings.length, 1);
});

test('the youtube slide CTA emits an anchor', () => {
  const { html } = renderBanner({
    _id: 'render-yt',
    type: 'youtube',
    title: 'วิดีโอแนะนำ',
    youtube_id: 'dQw4w9WgXcQ',
    link_url: 'https://9expert.co.th/course/powerbi',
    link_text: 'ดูรายละเอียด',
  });
  const anchor = html.match(/<a\b[^>]*href="https:\/\/9expert\.co\.th\/course\/powerbi"[^>]*>/);
  assert.ok(anchor, 'the youtube CTA must be an anchor');
  assert.match(anchor[0], /target="_blank"/);
  assert.match(anchor[0], /rel="noopener noreferrer"/);
  assert.match(html, /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ/);
});

test('a dangerous youtube CTA is dropped, the video is not', () => {
  const { html, warnings } = renderBanner({
    _id: 'render-yt-blocked',
    type: 'youtube',
    title: 'วิดีโอแนะนำ',
    youtube_id: 'dQw4w9WgXcQ',
    link_url: 'data:text/html,<script>alert(1)</script>',
    link_text: 'ดูรายละเอียด',
  });
  assert.doesNotMatch(html, /<a\b/);
  assert.match(html, /<iframe[^>]*youtube\.com\/embed/, 'refusing the CTA must not remove the video');
  assert.equal(warnings.length, 1);
});

test('the video card is interactive when nobody is dragging', () => {
  // The drag mitigation puts `pointer-events-none` on the video card, gated on
  // a movement-threshold flag. At rest that flag is false, so the iframe must
  // hit-test — otherwise a plain click-to-play resolves against an ancestor and
  // the video never plays. This is the ONE frame of that behaviour a static
  // render can observe; the rest is in the fs tier's "cannot see" list.
  const { html } = renderBanner({
    _id: 'render-yt-rest',
    type: 'youtube',
    title: 'วิดีโอแนะนำ',
    youtube_id: 'dQw4w9WgXcQ',
  });
  const card = html.match(/<div class="relative aspect-video[^"]*"/);
  assert.ok(card, 'video card wrapper not found');
  assert.doesNotMatch(card[0], /pointer-events-none/, 'the iframe is disabled at rest — click-to-play is dead');
});

// ── the dots overlay must not eat clicks meant for the slide ───────────────

test('the dots wrapper is click-through; only the pill itself is clickable', () => {
  // The dots row is `absolute left-0 right-0` — a full-width invisible strip
  // across the bottom of the hero. Without pointer-events-none on the wrapper
  // it intercepts every click landing in that strip, which on an image banner
  // is a large slice of the only clickable surface there is. The pill must then
  // opt back IN, or the dots and play/pause stop working.
  //
  // This is the same defect as the pointer-capture bug seen from the other
  // side: a click resolving against an ancestor instead of the link. It is CSS
  // rather than JS, so nothing else in this suite would notice it going away.
  const { html } = renderBanner2Up();
  const wrapper = html.match(/<div class="absolute bottom-5[^"]*"/);
  assert.ok(wrapper, 'dots wrapper not found — has the overlay been restructured?');
  assert.match(wrapper[0], /pointer-events-none/, 'the dots strip is intercepting clicks again');

  const pill = html.match(/<div class="flex items-center\s+bg-black\/25[^"]*"/);
  assert.ok(pill, 'dots pill not found');
  assert.match(pill[0], /pointer-events-auto/, 'the dots themselves are now unclickable');
});

test('CONTROL: the two pointer-events classes are told apart, not just found', () => {
  // `pointer-events-auto` CONTAINS neither string of the other, but a sloppy
  // matcher (/pointer-events/) would pass on both elements regardless of which
  // class each carries — i.e. it would pass with the wrapper and pill swapped,
  // which is the broken configuration.
  const { html } = renderBanner2Up();
  const wrapper = html.match(/<div class="absolute bottom-5[^"]*"/)[0];
  const pill = html.match(/<div class="flex items-center\s+bg-black\/25[^"]*"/)[0];
  assert.doesNotMatch(wrapper, /pointer-events-auto/, 'wrapper and pill are swapped');
  assert.doesNotMatch(pill, /pointer-events-none/, 'wrapper and pill are swapped');
});

// ── controls ────────────────────────────────────────────────────────────────

test('CONTROL: the anchor matcher is live and discriminating', () => {
  const { html } = renderBanner(imageBanner({ _id: 'render-ctl-anchor', link_url: '/course/excel' }));
  assert.equal(anchorTo(html, '/course/excel'), true, 'matcher failed on a link known to be present');
  assert.equal(anchorTo(html, '/course/never'), false, 'matcher passes for a link that is NOT present');
  // Every "no anchor" assertion in this file depends on `/<a\b/` being able to
  // find one. Prove it can, on real output.
  assert.match(html, /<a\b/);
});

test('CONTROL: the role="link" matcher would catch a regression', () => {
  // The strongest assertion in this file is a NEGATIVE one — that role="link"
  // is gone. A negative assertion with a dead matcher passes forever.
  const oldShape = '<div role="link" tabindex="0" class="block w-full h-full cursor-pointer">';
  assert.match(oldShape, /role="link"/);
  assert.match(oldShape, /tabindex="0"/i);
});
