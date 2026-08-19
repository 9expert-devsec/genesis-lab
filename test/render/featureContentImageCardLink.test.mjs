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
 * THE IMAGE CARD IS ONE LINK, AND ONE LINK ONLY.
 *
 * ── THE DEFECT THIS EXISTS BECAUSE OF ───────────────────────────────────────
 * Below lg an image slide grew a badge, a title, a description and a button.
 * The whole card was already a single <a> to the same `link_url`, and the
 * obvious way to add a button — a <Link> or a <button> inside it — is invalid
 * HTML: the parser CLOSES the outer anchor at the inner interactive element,
 * so the tree React describes and the tree the browser builds stop matching
 * and hydration then patches something that is not what was rendered. The
 * shipped answer is a <span> carrying the button's classes, inside the one
 * anchor.
 *
 * That is a whole class of regression that looks completely fine in review:
 * swapping the span for a Link reads as a tidy-up and produces a card that
 * still looks and mostly behaves right.
 *
 * ── THE DESCENDANT ASSERTION IS THE ONE THAT ACTUALLY CATCHES IT ────────────
 * "No anchor inside the card" is very nearly UNFALSIFIABLE on its own, and
 * that was measured rather than reasoned about. Breaking the component on
 * purpose — swapping the action's <span> back for a <Link> — reddens three
 * tests below, and "there is NO nested anchor inside the card link" is NOT one
 * of them. It still passes.
 *
 * Because the defect erases its own evidence: the parser closes the outer <a>
 * at the inner one, so by the time there is a DOM to query, the second anchor
 * is a SIBLING and the "no nested anchor" query is honestly answering zero.
 * The assertion that survives the break is the opposite one — that the action
 * block is still a DESCENDANT of the card link — because un-nesting moves it
 * out. It also covers the other direction, someone moving the button out of
 * the card deliberately, which would drop the tap target and leave a stray
 * control beside it.
 *
 * So the nested-anchor check stays as documentation of the rule, and the
 * descendant check is what enforces it. A guard whose failure mode deletes the
 * thing it looks for needs a second angle, and this is the second angle.
 *
 * ── WHAT THIS TIER CANNOT SEE, STATED PLAINLY ───────────────────────────────
 * renderToStaticMarkup runs no effects, performs no layout and dispatches no
 * events. So it cannot see that a tap fires exactly one navigation, that the
 * span is the right size, or that `lg:hidden` actually hides the block on a
 * desktop viewport. Those are browser facts, measured with CDP (one tap, one
 * new tab) and not by anything in this file. What IS checked below is the
 * shape of the emitted tree.
 */

/** A minimal `image_desktop` banner — the type that renders ImageOnlyCard. */
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

/** A `youtube` banner, so the pool has more than one item and the strip renders. */
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
  const items = mapBannersToFeatureContent(banners, new Date('2026-08-19T00:00:00Z'));
  assert.ok(items.length, 'fixture produced no items — the test would pass vacuously');
  const html = renderToStaticMarkup(
    createElement(FeaturedContentSlider, { copy: FEATURE_CONTENT_COPY, items })
  );
  const doc = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;
  return { html, doc };
}

/** The image slide's card element, found the way the browser harness finds it. */
function imageCard(doc) {
  const card = doc.querySelector('[data-fc-card="image"]');
  assert.ok(card, 'no image card rendered');
  return card;
}

test('the image card renders as a single anchor to link_url', () => {
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const card = imageCard(doc);
  assert.equal(card.tagName, 'A', 'the card itself must be the link');
  assert.equal(
    card.getAttribute('href'),
    'https://genesis-lab.9expert.app/masterclass/mas-ai-dmc'
  );
});

test('there is NO nested anchor inside the card link', () => {
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const card = imageCard(doc);
  assert.equal(
    card.querySelectorAll('a').length,
    0,
    'an <a> inside an <a> is invalid — the parser closes the outer one'
  );
});

test('there is NO <button> inside the card link', () => {
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  assert.equal(imageCard(doc).querySelectorAll('button').length, 0);
});

test('there is NO focusable descendant of any kind inside the card link', () => {
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const card = imageCard(doc);
  const focusable = card.querySelectorAll(
    'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
  );
  assert.equal(
    focusable.length,
    0,
    `the card link must be the only tab stop; found ${[...focusable].map((e) => e.tagName).join(', ')}`
  );
});

test('the action block is still a DESCENDANT of the card link', () => {
  // Guards the other direction: "no anchor inside" also passes if the button
  // was moved out of the card altogether, which would lose the tap target.
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const card = imageCard(doc);
  const action = doc.querySelector('[data-fc-action]');
  assert.ok(action, 'no action block rendered at all');
  assert.ok(
    card.contains(action),
    'the action block must live INSIDE the card link, not beside it'
  );
});

test('the action renders as a span, not as an interactive element', () => {
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const action = imageCard(doc).querySelector('[data-fc-action]');
  assert.ok(action, 'the image card has no action block');
  const inner = action.firstElementChild;
  assert.equal(inner.tagName, 'SPAN', 'inside a link the action must be a span');
  assert.equal(inner.getAttribute('role'), null, 'no role — that re-adds the second control');
  assert.equal(inner.getAttribute('tabindex'), null, 'no tabindex, for the same reason');
});

test('CONTROL: the SPLIT card DOES render a real link for its action', () => {
  // Without this, "the action is a span" could be passing because the action
  // is a span everywhere — which would mean the split card's only call to
  // action stopped being clickable and nothing noticed.
  const { doc } = renderSlider([
    imageBanner(),
    // link_url that is NOT youtube, so the mapper resolves a details href
    videoBanner({ link_url: 'https://genesis-lab.9expert.app/course/abc' }),
  ]);
  const split = doc.querySelector('[data-fc-card="split"]');
  assert.ok(split, 'no split card rendered');
  const action = split.querySelector('[data-fc-action]');
  assert.ok(action, 'the split card rendered no action block');
  assert.equal(
    action.firstElementChild.tagName,
    'A',
    'standing alone, the action must be a real anchor'
  );
});

test('CONTROL: the fixture really does exercise the card, not an empty tree', () => {
  // If the image card ever stops rendering its copy block, every assertion
  // above would pass for the wrong reason.
  const { doc } = renderSlider([imageBanner(), videoBanner()]);
  const card = imageCard(doc);
  assert.ok(card.querySelector('[data-fc-copy]'), 'no below-lg copy block');
  assert.ok(card.querySelector('[data-fc-title]'), 'no title');
  assert.ok(card.querySelector('[data-fc-art]'), 'no artwork');
});

test('a record with no usable link renders a plain box, never an empty anchor', () => {
  // An <a> with no href is not a link, it is a div that lies to the
  // accessibility tree — and the action must go with it rather than becoming
  // a button that goes nowhere.
  const { doc } = renderSlider([imageBanner({ link_url: '' }), videoBanner()]);
  const card = imageCard(doc);
  assert.equal(card.tagName, 'DIV', 'no href means no anchor');
  assert.equal(card.querySelector('[data-fc-action]'), null, 'and no dead button');
});
