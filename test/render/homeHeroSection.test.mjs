import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { JSDOM } from 'jsdom';
import { HeroSection } from '@/app/_components/home/HeroSection';
import { HERO_OVERLAY_SENTINEL_ID } from '@/lib/heroOverlay';

/**
 * What the Home hero actually EMITS.
 *
 * ── WHAT THIS TIER CANNOT SEE, AND WHY IT IS NOT AN OVERSIGHT ───────────────
 * test/stub-next-image.mjs renders `{ src, alt }` and DROPS every other prop.
 * So `priority`, `sizes` and `fill` are literally not in this markup, and an
 * assertion about them here could not fail — it would be unfalsifiable rather
 * than merely weak. Those three live in test/fs/heroOverlayOptIn, which reads
 * the source. Everything below is a fact about rendered output.
 *
 * It also cannot see: layout (jsdom computes none here and there is no
 * browser), whether Tailwind GENERATES any of these classes, or that the
 * artwork is dark enough for white text. Those are eyes-on-localhost facts.
 */

const html = renderToStaticMarkup(createElement(HeroSection, {}));

// Parsed once, for the assertions that are about NESTING rather than text.
// A jsdom document built from a string — never a React root, and no global
// window/document is assigned: the runner shares one process (isolation:'none')
// and a leaked global breaks every renderToStaticMarkup test in the run.
const doc = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`).window.document;

/** Does the markup carry an anchor pointing at `href`? */
function hasLinkTo(markup, href) {
  return new RegExp(`<a\\b[^>]*href="${href.replace(/[/]/g, '\\/')}"`).test(markup);
}

/** The label text inside the anchor for `href`, or null. */
function labelOf(markup, href) {
  const m = markup.match(
    new RegExp(`<a\\b[^>]*href="${href.replace(/[/]/g, '\\/')}"[^>]*>([\\s\\S]*?)</a>`)
  );
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : null;
}

test('both headline lines render', () => {
  // The class list is matched by TOKEN, not as a whole string: the headline
  // spans legitimately carry styling choices beyond `block` (they currently
  // also force `!font-[inherit]`), and a guard that pins the exact attribute
  // turns every typographic tweak into a red test for no reason.
  const line1 = html.match(/<span class="([^"]*)">ค้นหาหลักสูตรที่ใช่<\/span>/);
  assert.ok(line1, 'headline line 1 is not in its own span');
  assert.match(line1[1], /(^|\s)block(\s|$)/, 'line 1 is no longer a block');
  assert.ok(html.includes('พัฒนาทักษะ'), 'line 2 is missing');
});

/** The class attribute of the coloured phrase's span, or null. */
function colouredSpanClass(markup) {
  const m = markup.match(/<span class="([^"]*)">สู่ความเป็นมืออาชีพ<\/span>/);
  return m ? m[1] : null;
}

test('line 2 is ONE heading carrying a coloured span, not a second heading', () => {
  // The phrase must carry a colour of its own — which colour is a design
  // decision, and it has already changed once (brand blue → lime). The guard
  // pins that an accent token IS applied, not which one; pinning the exact
  // token made this test red on a deliberate palette change.
  const cls = colouredSpanClass(html);
  assert.ok(cls, 'the coloured phrase is no longer in its own span');
  assert.match(
    cls,
    /(^|\s)text-9e-[a-z-]+(\s|$)/,
    'the coloured phrase lost its accent token — line 2 renders in body colour'
  );
  // …and it is INSIDE the same h2 as line 1, not a sibling heading.
  const h2 = html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/);
  assert.ok(h2, 'no <h2> rendered');
  assert.ok(h2[1].includes('ค้นหาหลักสูตรที่ใช่'), 'line 1 is not in the h2');
  assert.ok(h2[1].includes('สู่ความเป็นมืออาชีพ'), 'the coloured span is not in the h2');
  assert.equal((html.match(/<h2\b/g) ?? []).length, 1, 'the hero must emit exactly one h2');
});

test('the hero emits NO h1 — the page already has the hidden one', () => {
  // A second h1 on the home page is an SEO regression, and this is the file
  // that would introduce it.
  assert.ok(!/<h1\b/.test(html), 'the hero rendered an h1');
});

test('the description renders in full', () => {
  assert.ok(
    html.includes(
      '9Expert ช่วยให้คุณเรียนรู้ได้จริง เข้าใจง่าย และนำไปใช้งานได้ทันที ด้วยหลักสูตรคุณภาพจากวิทยากรตัวจริง'
    ),
    'the description text is missing or was re-worded'
  );
});

test('both CTAs render with their real hrefs and labels', () => {
  assert.ok(hasLinkTo(html, '/training-course'), 'the catalogue CTA is missing');
  assert.ok(hasLinkTo(html, '/registration/in-house'), 'the in-house CTA is missing');
  assert.equal(labelOf(html, '/training-course'), 'เลือกดูหลักสูตร');
  assert.equal(labelOf(html, '/registration/in-house'), 'อบรมภายในองค์กร');
});

test('the primary CTA carries an arrow glyph, not just text', () => {
  const cta = html.match(/<a\b[^>]*href="\/training-course"[^>]*>([\s\S]*?)<\/a>/);
  assert.ok(cta, 'the catalogue CTA is missing');
  assert.match(cta[1], /<svg\b/, 'the right-arrow icon is gone from the primary CTA');
});

test('both hero images are present', () => {
  assert.match(html, /<img[^>]*src="\/hero-img\/background\.png"/);
  assert.match(html, /<img[^>]*src="\/hero-img\/nongnai\.png"/);
});

test('the switch-back sentinel is rendered, under the shared id', () => {
  // The header's IntersectionObserver looks this up by id. If the element is
  // not emitted the header silently never switches back.
  assert.ok(
    html.includes(`id="${HERO_OVERLAY_SENTINEL_ID}"`),
    'the sentinel element is missing from the hero'
  );
});

test('the sentinel is anchored to the TOP of the hero, not the bottom', () => {
  // THE DEFECT THIS PINS: anchored at the bottom, the marker meant "any part of
  // the hero is still visible", so the header stayed transparent while the
  // hero's own CTAs scrolled up underneath it and were painted over the nav
  // links. At the top it means "nothing of the hero has passed under the header
  // yet", which is the only state in which transparency is safe.
  const m = html.match(
    new RegExp(`<div[^>]*id="${HERO_OVERLAY_SENTINEL_ID}"[^>]*class="([^"]*)"`)
  );
  assert.ok(m, 'the sentinel has no class attribute to read');
  assert.match(m[1], /(^|\s)top-0(\s|$)/, 'the sentinel is not anchored to the hero top');
  assert.ok(
    !/(^|\s)bottom-0(\s|$)/.test(m[1]),
    'the sentinel is back at the hero BOTTOM — that is the CTAs-over-the-nav defect'
  );
});

test('the astronaut is anchored INSIDE the centred 1200px container', () => {
  // Not "appears near it in the source" — that is satisfied by an element that
  // has been moved OUT of the container but still sits below it in the file.
  // This reads the parsed tree.
  const art = doc.querySelector('img[src*="nongnai"]');
  assert.ok(art, 'the astronaut image is gone');
  // Found by its motion hook, not by a positioning class: the box was
  // `lg:absolute` when this guard was written and is now `absolute` at every
  // width with `lg:` overrides — a deliberate layout change that should not
  // redden a guard about ANCHORING.
  const box = art.closest('div[data-hero-motion="mascot"]');
  assert.ok(box, 'the astronaut is not inside the mascot box');
  assert.match(
    box.className,
    /(^|\s)(lg:)?absolute(\s|$)/,
    'the mascot box is not absolutely positioned, so it anchors to nothing'
  );
  const container = box.closest('div[class*="max-w-[1200px]"]');
  assert.ok(
    container,
    'the astronaut escaped the centred container — anchored to the viewport it ' +
    'flies away from the copy and leaves a dead gap on an ultra-wide screen'
  );
  assert.match(
    container.className,
    /(^|\s)relative(\s|$)/,
    'the container is not positioned, so an absolute child anchors elsewhere'
  );
});

test('CONTROL: the nesting probe can tell inside from outside', () => {
  // The same query against markup where the box is a SIBLING of the container
  // must come back null, or the assertion above is satisfied by anything.
  const outside = new JSDOM(
    '<!doctype html><body><div class="relative mx-auto max-w-[1200px]"></div>' +
    '<div data-hero-motion="mascot" class="absolute"><img src="/hero-img/nongnai.png"></div></body>'
  ).window.document;
  const art = outside.querySelector('img[src*="nongnai"]');
  assert.ok(art.closest('div[data-hero-motion="mascot"]'), 'the box probe itself works');
  assert.equal(
    art.closest('div[class*="max-w-[1200px]"]'),
    null,
    'the nesting probe reports "inside" for a sibling'
  );
});

test('the coloured phrase may only be unbreakable from lg up', () => {
  // Width alone does not stop Thai splitting mid-word (`มือ` / `อาชีพ` are both
  // legal break points), so the phrase carries a nowrap — but an UNPREFIXED
  // one would make a 19-character phrase unbreakable on a 390px phone and push
  // the page sideways. The prefix is the whole safety property.
  const cls = colouredSpanClass(html);
  assert.match(cls, /(^|\s)lg:whitespace-nowrap(\s|$)/, 'the lg-only nowrap is gone');
  assert.ok(
    !/(^|\s)whitespace-nowrap(\s|$)/.test(cls),
    'an UNPREFIXED whitespace-nowrap overflows the viewport on a phone'
  );
  // …and the phrase is one line-breaking item, so the break lands at the space
  // before it rather than inside it when it cannot fit.
  assert.match(cls, /(^|\s)inline-block(\s|$)/);
});

// ── CONTROLS ────────────────────────────────────────────────────────────────
// Each proves the matcher above discriminates rather than matching anything.

test('CONTROL: the link matcher answers NO for a route the hero does not link', () => {
  // Without this, hasLinkTo() could be broken and both CTA assertions would be
  // passing for the wrong reason.
  assert.equal(hasLinkTo(html, '/schedule'), false);
  assert.equal(labelOf(html, '/schedule'), null);
});

test('CONTROL: the headline probe answers NO to a near-miss wording', () => {
  assert.ok(!html.includes('ค้นหาหลักสูตรที่ชอบ'), 'the text probe matches text that is not there');
});

test('CONTROL: the coloured-span probe is bound to the class, not to any span', () => {
  // The accent-token matcher must answer NO when there is no accent at all —
  // otherwise "line 2 carries a colour" would pass on an uncoloured span.
  const cls = colouredSpanClass(html);
  assert.equal(/(^|\s)text-9e-[a-z-]+(\s|$)/.test('inline-block lg:whitespace-nowrap'), false);
  assert.equal(/(^|\s)text-9e-[a-z-]+(\s|$)/.test('inline-block text-white'), false);
  assert.equal(/(^|\s)text-9e-[a-z-]+(\s|$)/.test(cls), true, 'the real span has no accent token');
  // The word-boundary form is what makes the unprefixed-nowrap check real: a
  // plain includes() would be satisfied by `lg:whitespace-nowrap` itself.
  assert.equal(/(^|\s)whitespace-nowrap(\s|$)/.test('lg:whitespace-nowrap'), false);
  assert.equal(/(^|\s)whitespace-nowrap(\s|$)/.test('inline-block whitespace-nowrap'), true);
  // …and the extractor answers null for a phrase that is not in a span.
  assert.equal(colouredSpanClass('<p>สู่ความเป็นมืออาชีพ</p>'), null);
});

test('CONTROL: the image probe answers NO for an asset the hero does not use', () => {
  assert.ok(!/<img[^>]*src="\/hero-img\/nongnai-2\.png"/.test(html));
  assert.ok(!/<img[^>]*src="\/brand\/logo-white\.png"/.test(html));
});
