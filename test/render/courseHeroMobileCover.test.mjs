import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseHero } from '@/app/(public)/[...slug]/_components/CourseHero';

/**
 * The hero cover used to be desktop-only (`hidden ... lg:block`), so phones got
 * no cover, no gallery and no course video at all. The fix mounts the cover
 * zone TWICE inside the same flex container — a `lg:hidden` block first in
 * source, and the original `hidden lg:block` right-hand column — which is the
 * shape the masterclass hero already uses.
 *
 * Mounting it twice is what makes the id namespacing load-bearing. CoverSlider
 * used to build its YouTube iframe ids from a module constant (`yt-slide-${i}`),
 * so two mounts emitted the SAME id into one document; getElementById returns
 * the first match, and initPlayers would then attach the YT.Player to the wrong
 * iframe — quite possibly the display:none one. That failure is invisible in
 * static markup unless you look at the ids, so the ids are what this file looks
 * at.
 *
 * Every uniqueness/absence claim is paired with a CONTROL that fires the SAME
 * probe at markup which genuinely has the defect. A probe that has stopped
 * matching reality fails in its control instead of passing vacuously here.
 *
 * next/image is NOT stubbed in this runner (it throws on an unlisted host), so
 * the fixtures deliberately carry no cover url, no image slides and no program
 * icon: every branch exercised below renders iframes and plain divs only.
 */

const COURSE = {
  course_id: 'DA-PBI',
  course_name: 'Power BI Desktop',
  course_price: 12000,
  course_trainingdays: 2,
  course_traininghours: 12,
};

const YT_GALLERY = [{ type: 'youtube', videoId: 'dQw4w9WgXcQ', order: 1 }];

const render = (gallery) =>
  renderToStaticMarkup(
    createElement(CourseHero, { course: COURSE, heroColor: '#005CFF', gallery })
  );

// Pull the id off every iframe in document order.
const IFRAME_ID = /<iframe[^>]*\sid="([^"]*)"/g;
const iframeIdsIn = (html) => [...html.matchAll(IFRAME_ID)].map((m) => m[1]);

// The hero's elements, quoted EXACTLY as they ship — full attribute, closing
// quote included. React emits `class`, not `className`, so these are the
// rendered strings. Pinning the whole attribute rather than a prefix means a
// stray utility appearing or vanishing fails here instead of sliding past a
// substring match.
const SECTION = 'class="w-full lg:px-6 lg:py-6"';
const ROW = 'class="flex flex-col lg:flex-row lg:items-stretch lg:gap-6"';
const INFO_CARD =
  'class="min-w-0 flex flex-col justify-center bg-[var(--surface-raised)] p-6 lg:w-[40%] lg:flex-none lg:rounded-2xl lg:px-8 lg:py-6 lg:shadow-9e-sm lg:dark:ring-1 lg:dark:ring-inset lg:dark:ring-white/10"';
const MOBILE_SLOT = 'class="relative aspect-video w-full overflow-hidden lg:hidden"';
const DESKTOP_SLOT =
  'class="relative hidden min-w-0 flex-1 overflow-hidden rounded-2xl shadow-9e-sm lg:block lg:aspect-video lg:self-start"';
const PLACEHOLDER = 'class="absolute inset-0 flex items-center justify-center"';

// What those three elements shipped BEFORE the edge-to-edge change. These exist
// ONLY to drive the controls: each "nothing below lg does X" predicate is fired
// at the string that genuinely did X, so a predicate that has stopped matching
// reality fails its control rather than passing vacuously against the new one.
const WAS_SECTION = 'class="w-full px-4 py-6 lg:px-6"';
const WAS_ROW = 'class="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6"';
const WAS_CARD =
  'class="min-w-0 flex flex-col justify-center rounded-2xl bg-[var(--surface-raised)] p-6 shadow-9e-sm dark:ring-1 dark:ring-inset dark:ring-white/10 lg:w-[40%] lg:flex-none lg:px-8 lg:py-6 "';

// Utilities carrying no responsive prefix — i.e. the ones in force below lg.
// `lg:dark:ring-1` is lg-only; `dark:ring-1` is not.
const belowLg = (attr) =>
  attr
    .replace(/^class="/, '')
    .replace(/"$/, '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((u) => !u.startsWith('lg:'));

const hasBelowLg = (attr, re) => belowLg(attr).some((u) => re.test(u));

// ── (b) the cover exists on mobile at all ───────────────────────────────────

test('the cover zone is mounted in BOTH slots, mobile and desktop', () => {
  const html = render(YT_GALLERY);
  assert.ok(html.includes(MOBILE_SLOT), 'a lg:hidden cover slot ships');
  assert.ok(html.includes(DESKTOP_SLOT), 'the lg:block cover column still ships');
});

test('the mobile slot is full-width and unrounded; the desktop one keeps its clip', () => {
  // Full-bleed above the card vs. a clipped right-hand column is precisely why
  // one element with responsive classes could not do this job. As of the
  // edge-to-edge change "unrounded" has a stronger reason than matching the
  // masterclass slot: below lg the section has no padding, so this element is
  // flush to the left and right viewport edges and a corner radius there would
  // cut a notch out of the screen edge.
  //
  // Re-read the class strings OUT OF THE RENDER rather than inspecting the
  // constants above — asserting `!/rounded/` against a literal declared in this
  // file would hold no matter what the component shipped.
  const html = render(YT_GALLERY);
  const shipped = (slot) => html.match(new RegExp(slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))?.[0];

  const mobile = shipped(MOBILE_SLOT);
  const desktop = shipped(DESKTOP_SLOT);
  assert.ok(mobile, 'the mobile slot is in the render');
  assert.ok(desktop, 'the desktop slot is in the render');

  assert.equal(/rounded/.test(mobile), false, 'mobile cover is not rounded');
  assert.ok(mobile.includes('w-full'), 'mobile cover spans the container');
  assert.ok(/rounded-2xl/.test(desktop), 'desktop cover keeps rounded-2xl');
});

test('on mobile the cover comes BEFORE the info card in source order', () => {
  // The container is flex-col below lg, so source order IS paint order there —
  // this is what puts the cover on top without any order-* utility.
  const html = render(YT_GALLERY);
  const card = html.indexOf(INFO_CARD);
  const mobile = html.indexOf(MOBILE_SLOT);
  // Both anchors must be PRESENT before their order means anything: indexOf
  // returns -1 for a missing slot, and -1 is less than every real index, so a
  // bare `mobile < card` would go green precisely when the mobile cover had
  // been deleted. (Verified: it did.)
  assert.ok(card > -1, 'the info card is in the render');
  assert.ok(mobile > -1, 'the mobile cover slot is in the render');
  assert.ok(mobile < card, 'mobile cover precedes the card');
});

test('CONTROL: the ordering probe is directional — the desktop slot is AFTER the card', () => {
  // Without this, "index < index" could be passing because both probes resolve
  // to the same place, or because the card probe is simply last in the file.
  const html = render(YT_GALLERY);
  assert.ok(
    html.indexOf(DESKTOP_SLOT) > html.indexOf(INFO_CARD),
    'the desktop column still renders after the card, so the comparison discriminates'
  );
});

// ── (a) the id collision that mounting twice would otherwise cause ──────────

test('the two mounted sliders emit DISTINCT iframe ids', () => {
  const ids = iframeIdsIn(render(YT_GALLERY));
  assert.equal(ids.length, 2, 'the youtube slide is mounted once per slot');
  assert.equal(
    new Set(ids).size,
    2,
    `both mounts would share a DOM id — getElementById would hand initPlayers ` +
      `the same iframe twice. Got: ${JSON.stringify(ids)}`
  );
});

test('no iframe carries the old module-constant id format', () => {
  const ids = iframeIdsIn(render(YT_GALLERY));
  for (const id of ids) {
    assert.equal(
      /^yt-slide-\d+$/.test(id),
      false,
      `"${id}" is the pre-fix module-constant format, which cannot differ between mounts`
    );
  }
});

test('CONTROL: the id probes DO catch a collision when one is present', () => {
  // Exactly the markup the pre-fix component produced when mounted twice. If the
  // extraction regex or the uniqueness check ever stopped describing reality,
  // this control goes red instead of the assertions above going quietly green.
  const collided = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement('iframe', { id: 'yt-slide-0', title: 'Course video' }),
      createElement('iframe', { id: 'yt-slide-0', title: 'Course video' })
    )
  );
  const ids = iframeIdsIn(collided);
  assert.equal(ids.length, 2, 'the probe finds both iframes');
  assert.equal(new Set(ids).size, 1, 'the probe reports the duplicate as a duplicate');
  assert.ok(/^yt-slide-\d+$/.test(ids[0]), 'the old-format matcher matches the old format');
});

// ── the empty state survives in both slots ──────────────────────────────────

test('with no slides BOTH slots still paint the placeholder', () => {
  const html = render([]);
  const hits = html.split(PLACEHOLDER).length - 1;
  assert.equal(hits, 2, 'mobile and desktop each keep their empty-state block');
  assert.equal(iframeIdsIn(html).length, 0, 'and no slider mounts');
});

test('CONTROL: the placeholder probe is absent when there ARE slides', () => {
  // Proves the count above tracks the empty branch rather than matching a
  // wrapper that is present either way.
  assert.equal(render(YT_GALLERY).includes(PLACEHOLDER), false);
});

test('the empty state is full-bleed too, not an inset placeholder', () => {
  // A placeholder that stayed inset while a real cover went edge-to-edge would
  // be a visible inconsistency on exactly the courses nobody looks at. It sits
  // inside the SAME full-bleed wrapper, so proving the wrapper still ships
  // unchanged with no slides proves the placeholder inherits the bleed.
  const html = render([]);
  assert.ok(html.includes(MOBILE_SLOT), 'the full-bleed wrapper ships in the empty branch');
  assert.ok(html.includes(SECTION), 'and the section is still unpadded below lg');
});

// ── edge-to-edge below lg, unchanged at lg ──────────────────────────────────
// Three elements carry the change: the section's padding, the row's gap, and
// the card's rounding/shadow/ring. Each is pinned by FULL-attribute equality
// above, then interrogated for what survives below lg.

test('the section has NO padding below lg and keeps it at lg', () => {
  const html = render(YT_GALLERY);
  assert.ok(html.includes(SECTION), `the section ships as ${SECTION}`);
  assert.equal(
    hasBelowLg(SECTION, /^-?p[xytrbl]?-/),
    false,
    'no unprefixed padding — this is what makes the hero reach the viewport edge'
  );
  // py-6 had no lg variant before, so removing the mobile padding could easily
  // have dropped the DESKTOP vertical padding by accident.
  assert.ok(SECTION.includes('lg:px-6'), 'horizontal padding restored at lg');
  assert.ok(SECTION.includes('lg:py-6'), 'vertical padding restored at lg — not silently dropped');
});

test('CONTROL: the padding probe DOES fire on the pre-change section', () => {
  assert.equal(hasBelowLg(WAS_SECTION, /^-?p[xytrbl]?-/), true, 'px-4/py-6 are seen as below-lg padding');
});

test('nothing cancels that padding with a negative margin', () => {
  // Stripping the offset cannot produce a horizontal scrollbar; a negative
  // margin that fails to match the padding exactly can, on every course page.
  const html = render(YT_GALLERY);
  assert.equal(/class="[^"]*(?:^|\s)-m[xytrbl]?-/.test(html), false, 'no negative margin anywhere in the hero');
});

test('CONTROL: the negative-margin probe recognises one when present', () => {
  const withNegative = renderToStaticMarkup(createElement('div', { className: 'w-full -mx-4 py-2' }));
  assert.equal(/class="[^"]*(?:^|\s)-m[xytrbl]?-/.test(withNegative), true);
});

test('there is NO gap between cover and card below lg, and gap-6 at lg', () => {
  const html = render(YT_GALLERY);
  assert.ok(html.includes(ROW), `the row ships as ${ROW}`);
  assert.equal(hasBelowLg(ROW, /^gap-/), false, 'the two blocks meet on a seam below lg');
  assert.ok(ROW.includes('lg:gap-6'), 'the desktop column gap is untouched');
});

test('CONTROL: the gap probe DOES fire on the pre-change row', () => {
  assert.equal(hasBelowLg(WAS_ROW, /^gap-/), true, 'gap-4 is seen as a below-lg gap');
});

test('the info card is unrounded, unshadowed and unringed below lg', () => {
  const html = render(YT_GALLERY);
  assert.ok(html.includes(INFO_CARD), 'the card ships as its pinned attribute');
  assert.equal(hasBelowLg(INFO_CARD, /^rounded/), false, 'flush corners against the viewport edge');
  assert.equal(hasBelowLg(INFO_CARD, /^shadow-/), false, 'no shadow whose sides the viewport would clip');
  assert.equal(
    hasBelowLg(INFO_CARD, /^dark:ring/),
    false,
    'no hairline ring drawn against the gradient that is no longer there'
  );
});

test('the info card gets all three back at lg', () => {
  assert.ok(INFO_CARD.includes('lg:rounded-2xl'), 'rounded at lg');
  assert.ok(INFO_CARD.includes('lg:shadow-9e-sm'), 'floating at lg');
  assert.ok(INFO_CARD.includes('lg:dark:ring-1'), 'dark-mode edge separator at lg');
  assert.ok(INFO_CARD.includes('lg:dark:ring-inset'), 'and it is still inset');
  assert.ok(INFO_CARD.includes('lg:dark:ring-white/10'), 'and still white/10');
});

test('CONTROL: all three probes DO fire on the pre-change card', () => {
  // Without this, the three `false` assertions above would also hold for a card
  // that had lost rounding/shadow/ring at EVERY breakpoint, or for probes whose
  // regexes had gone stale.
  assert.equal(hasBelowLg(WAS_CARD, /^rounded/), true, 'rounded-2xl was unprefixed');
  assert.equal(hasBelowLg(WAS_CARD, /^shadow-/), true, 'shadow-9e-sm was unprefixed');
  assert.equal(hasBelowLg(WAS_CARD, /^dark:ring/), true, 'dark:ring-1 was unprefixed');
});

test('the p-6 inner padding is deliberately UNCHANGED by this commit', () => {
  // The card's inner inset stays 24px while the page body below it sits at 16px
  // (px-4, added in 4743b93). Full-bleed makes the two visible on one screen for
  // the first time. That mismatch is a separate call, so it is pinned here to
  // make any drive-by change to it deliberate rather than incidental.
  assert.ok(belowLg(INFO_CARD).includes('p-6'), 'still p-6 below lg');
  assert.ok(INFO_CARD.includes('lg:px-8'), 'still lg:px-8 at lg');
});
