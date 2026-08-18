import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PublicHeaderClient } from '@/components/layout/PublicHeaderClient';

/**
 * The header's two treatments, rendered.
 *
 * The claim under test is a PAIR, and asserting either half alone is worthless:
 * "the transparent classes appear somewhere in the file" is satisfied by the
 * opaque path having been deleted, and "the opaque classes are still there" is
 * satisfied by the transparent path never being reachable. So both renders are
 * produced here and each is asserted to be the one it should be, including that
 * neither carries the other's background.
 *
 * The default render is pinned to the EXACT class string the header carried
 * before this prop existed. That is deliberate: the header is shared by every
 * public route, and the promise made when `overlay` was added was that every
 * other route renders unchanged. cn() re-joins the split literal, so the string
 * is evidence that the split did not reorder or drop a class along the way.
 *
 * WHAT THIS CANNOT SEE: the effect. renderToStaticMarkup runs no effects, so
 * what is rendered here is the INITIAL state (overlayActive === overlay). That
 * the IntersectionObserver later flips it back at the hero's bottom edge is not
 * observable in this tier and is not claimed here.
 */

// Realistic-but-inert props — the documented contract is that every one of
// these degrades to empty upstream. Same set as test/render/headerActions.
const PROPS = {
  programs: [],
  dynamicCareerPaths: [],
  tnhsCourses: [],
  navOnlineCourses: [],
  navMenuData: { programs: {}, skills: {}, programSlugs: {}, skillSlugs: {} },
  navMasterclasses: [],
};

const plain = renderToStaticMarkup(createElement(PublicHeaderClient, PROPS));
const overlaid = renderToStaticMarkup(
  createElement(PublicHeaderClient, { ...PROPS, overlay: true })
);

/**
 * The <header>'s class attribute. THROWS naming the element when the anchor is
 * gone — an empty string would read as a pass to every "does not contain"
 * assertion below, which is the failure mode test/zScale.mjs's classLiteral()
 * exists to prevent.
 */
function headerClass(markup, which) {
  const m = markup.match(/<header\b[^>]*\bclass="([^"]*)"/);
  if (!m) {
    throw new Error(
      `[header-overlay] no <header> with a class attribute in the ${which} render. ` +
      'The element was renamed or stopped emitting a class — this guard is now ' +
      'BLIND to it. Re-anchor it; do not let it degrade into an empty string.'
    );
  }
  return m[1];
}

// The string this header carried before `overlay` existed, verbatim.
const OPAQUE =
  'sticky top-0 left-0 right-0 z-60 border-b border-[var(--surface-border)] ' +
  'bg-white backdrop-blur-md transition-colors dark:bg-9e-navy';

test('DEFAULT: the header renders the opaque per-theme treatment, byte for byte', () => {
  assert.equal(headerClass(plain, 'default'), OPAQUE);
});

test('DEFAULT: no transparent classes leak into the ordinary header', () => {
  const cls = headerClass(plain, 'default');
  assert.ok(!cls.includes('bg-transparent'), 'the default header is transparent');
  assert.ok(!cls.includes('border-transparent'), 'the default header lost its border colour');
});

test('OVERLAY: the header goes transparent, border included', () => {
  const cls = headerClass(overlaid, 'overlay');
  assert.ok(cls.includes('bg-transparent'), 'overlay mode is not transparent');
  assert.ok(
    cls.includes('border-transparent'),
    'the border-b is still coloured — it draws a hairline across the artwork'
  );
  assert.ok(!cls.includes('bg-white'), 'the opaque background survived into overlay mode');
  assert.ok(!cls.includes('dark:bg-9e-navy'), 'the dark background survived into overlay mode');
  assert.ok(
    !cls.includes('backdrop-blur-md'),
    'the blur survived — the artwork is meant to show through sharply'
  );
});

test('OVERLAY: it keeps its position in the stack — still sticky, still z-60', () => {
  // The transparent branch must not cost the header its own layer or its
  // top-0 stickiness; those live in the shared half of the class string.
  const cls = headerClass(overlaid, 'overlay');
  assert.ok(/\bsticky\b/.test(cls) && /\btop-0\b/.test(cls), 'overlay header stopped being sticky');
  assert.ok(/\bz-60\b/.test(cls), 'overlay header lost its z token');
});

test('OVERLAY: nav text is forced light, in both themes', () => {
  // `text-[var(--text-secondary)]` is dark in the light theme, so on the dark
  // artwork it has to be replaced rather than left to the theme.
  assert.ok(
    /<a\b[^>]*class="[^"]*\btext-white\b[^"]*"[^>]*>ตารางฝึกอบรม</.test(overlaid),
    'a top-level nav link is not using the light treatment'
  );
  assert.ok(
    !/<a\b[^>]*class="[^"]*text-\[var\(--text-secondary\)\][^"]*"[^>]*>ตารางฝึกอบรม</.test(overlaid),
    'a nav link kept the theme-dependent colour over the artwork'
  );
});

test('DEFAULT: nav text still uses the theme variable', () => {
  // The other half of the pair — otherwise "overlay uses text-white" is
  // satisfied by the theme treatment having been deleted outright.
  assert.ok(
    /<a\b[^>]*class="[^"]*text-\[var\(--text-secondary\)\][^"]*"[^>]*>ตารางฝึกอบรม</.test(plain),
    'the ordinary nav link lost its theme colour'
  );
});

test('the search action and hamburger follow the header into overlay mode', () => {
  const searchPlain = plain.match(/<a\b[^>]*href="\/search"[^>]*class="([^"]*)"/)
    ?? plain.match(/<a\b[^>]*class="([^"]*)"[^>]*href="\/search"/);
  const searchOver = overlaid.match(/<a\b[^>]*href="\/search"[^>]*class="([^"]*)"/)
    ?? overlaid.match(/<a\b[^>]*class="([^"]*)"[^>]*href="\/search"/);
  assert.ok(searchPlain && searchOver, 'the search action was not found in one of the renders');
  assert.ok(searchOver[1].includes('text-white'), 'the search icon stayed dark on the artwork');
  assert.ok(!searchPlain[1].includes('text-white'), 'the default search icon turned white');

  const burgerOver = overlaid.match(/<button\b[^>]*aria-label="เปิดเมนู"[^>]*class="([^"]*)"/);
  assert.ok(burgerOver, 'the hamburger was not found in the overlay render');
  assert.ok(burgerOver[1].includes('text-white'), 'the hamburger stayed dark on the artwork');
});

// ── CONTROLS ────────────────────────────────────────────────────────────────

test('CONTROL: the two renders really are different documents', () => {
  // If `overlay` were ignored entirely — dropped in the signature, say — every
  // assertion above about one render would be an assertion about both, and the
  // "no bg-white in overlay" half would go red. This states it directly.
  assert.notEqual(plain, overlaid, 'the overlay prop changed nothing at all');
});

test('CONTROL: the class extractor reads the real attribute and can fail loudly', () => {
  // The extractor finds a class on markup that has one…
  assert.ok(headerClass(plain, 'default').length > 20);
  // …and THROWS, rather than returning '', on markup that does not.
  assert.throws(
    () => headerClass('<header data-x="1"></header>', 'synthetic'),
    /no <header> with a class attribute/
  );
});

test('CONTROL: the "no bg-white in overlay" probe is not vacuous', () => {
  // The same probe finds bg-white where it IS present, so its absence in the
  // overlay render is a fact about the render and not about the matcher.
  assert.ok(headerClass(plain, 'default').includes('bg-white'));
});
