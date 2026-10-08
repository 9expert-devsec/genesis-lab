import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { PromotionBundleSection } from '@/components/pageBuilder/sections/promotion_bundle';
import {
  BUNDLE_GLOW_LEFT_DEFAULT,
  BUNDLE_GLOW_RIGHT_DEFAULT,
  BUNDLE_BORDER_COLOR_DEFAULT,
  BUNDLE_SURFACE_CLASS,
  BUNDLE_BORDER_CLASS,
  BUNDLE_TILE_LIGHT_CLASS,
} from '@/lib/pageBuilder/presets';

/**
 * Both whole-card styles at the MARKUP boundary — the half
 * test/pure/bundleCardStyle deliberately does not cover. That file asserts the
 * resolution rule; this one asserts the renderer threads the result onto the
 * element, which is the join that can break while both sides stay correct.
 *
 * ── THIS FILE USED TO ASSUME NAVY WAS THE ONLY LOOK ───────────────────────
 * It was written when it was, so its helper passed no theme and every
 * assertion read as "the card is navy". Six of them went red the moment
 * `light` became the resolved default — correctly: the default changed by
 * ruling, so the tests describing the old one were stale, not the code. They
 * are now split by style, and the NAVY half names its theme explicitly so it
 * cannot silently become an assertion about the default again.
 *
 * ── WHY THE STYLE ATTRIBUTE IS THE SUBJECT ────────────────────────────────
 * The author's colour reaches CSS ONLY as an inline custom property consumed
 * by a static class. If it ever reached the markup as a generated class
 * instead (`bg-[#1d4ed8]`), the page would look right in a dev server that had
 * scanned that literal and lose the colour in a production build — the exact
 * failure the `{ className, vars }` shape exists to prevent. So the last test
 * here is a prohibition, not a preference.
 */

const CARD = '[data-pb-bundle]';
const SOFT_GRAY = 'bg-[var(--pb-bg-soft-gray)]';

const CONTENT = {
  name: 'Bundle 1',
  listPrice: 100,
  netPrice: 80,
  discountCode: 'EXP1',
  items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r1' }],
};

const render = (style) =>
  new JSDOM(
    `<!doctype html><body>${renderToStaticMarkup(
      createElement(PromotionBundleSection, {
        content: CONTENT,
        style,
        pageId: 'p1',
        sectionId: 'sec-1',
      }),
    )}</body>`,
  ).window.document;

const card = (style) => render(style).querySelector(CARD);
const navy = (extra = {}) => card({ bundleCardTheme: 'navy', ...extra });

// ── สีขาว (แบบเดิม): the default, and the pre-navy look restored ────────────

test('NOTHING STORED renders the สีขาว card — the look stored sections were authored against', () => {
  for (const style of [undefined, {}, { bundleCardTheme: 'light' }]) {
    const el = card(style);
    assert.ok(el, 'the card root must render');
    assert.ok(el.className.includes(SOFT_GRAY), `the soft-gray surface is missing for ${JSON.stringify(style)}`);
    assert.ok(!el.classList.contains(BUNDLE_SURFACE_CLASS), 'the navy surface must not be applied');
  }
});

test('the สีขาว card does NOT scope `dark` — it follows the site theme again', () => {
  // The absence IS the feature: this is what makes the card light in a light
  // site theme and dark in a dark one, which is what the pre-navy card did.
  for (const style of [undefined, { bundleCardTheme: 'light' }]) {
    assert.ok(!card(style).classList.contains('dark'));
  }
});

test('the สีขาว card emits NO glow variables, even with colours stored', () => {
  const el = card({ bundleCardTheme: 'light', bundleGlowLeft: '#112233', bundleGlowRight: '#445566' });
  const s = el.getAttribute('style') ?? '';
  assert.doesNotMatch(s, /--bundle-glow-left/);
  assert.doesNotMatch(s, /--bundle-glow-right/);
  assert.doesNotMatch(s, /112233|445566/i, "a light card must not paint the author's glow colours");
});

test('the สีขาว card leaves its course tiles alone — no light scope, no stripping', () => {
  const doc = render({ bundleCardTheme: 'light' });
  assert.doesNotMatch(doc.body.innerHTML, new RegExp(BUNDLE_TILE_LIGHT_CLASS),
    'a light card needs no light scope — its tiles are already on a light surface');
  // The tile's own `dark:` forms must survive, because in a DARK site theme the
  // สีขาว card is dark and they are what make the tile correct there.
  assert.match(doc.body.innerHTML, /dark:bg-9e-navy/,
    "the tile's dark: variants must be intact on a light card");
});

// ── Navy ────────────────────────────────────────────────────────────────────

test('the Navy card carries the surface class and BOTH glow variables by default', () => {
  const el = navy();
  assert.ok(el.classList.contains(BUNDLE_SURFACE_CLASS), 'the navy surface class is missing');
  assert.ok(!el.className.includes(SOFT_GRAY), 'the soft-gray surface must not be applied beside the navy base');
  const s = el.getAttribute('style') ?? '';
  assert.match(s, new RegExp(`--bundle-glow-left:\\s*${BUNDLE_GLOW_LEFT_DEFAULT}`, 'i'));
  assert.match(s, new RegExp(`--bundle-glow-right:\\s*${BUNDLE_GLOW_RIGHT_DEFAULT}`, 'i'));
});

test("the Navy card takes the author's two glow colours verbatim", () => {
  const s = navy({ bundleGlowLeft: '#112233', bundleGlowRight: '#445566' }).getAttribute('style');
  assert.match(s, /--bundle-glow-left:\s*#112233/i);
  assert.match(s, /--bundle-glow-right:\s*#445566/i);
});

test('control: an invalid glow colour renders the DEFAULT, not the bad value', () => {
  const s = navy({ bundleGlowLeft: 'javascript:alert(1)', bundleGlowRight: '#FFF' }).getAttribute('style');
  assert.doesNotMatch(s, /javascript/i, 'a non-colour must never reach the style attribute');
  assert.match(s, new RegExp(`--bundle-glow-left:\\s*${BUNDLE_GLOW_LEFT_DEFAULT}`, 'i'));
  assert.match(s, new RegExp(`--bundle-glow-right:\\s*${BUNDLE_GLOW_RIGHT_DEFAULT}`, 'i'));
});

test('the Navy card scopes `dark` so its own subtree resolves the dark token set', () => {
  assert.ok(navy().classList.contains('dark'));
});

test('a stored cardStyle is INERT on both styles — the cap is gone', () => {
  for (const style of [{ cardStyle: 'promo' }, { bundleCardTheme: 'navy', cardStyle: 'promo' }]) {
    const cls = card(style).className;
    assert.doesNotMatch(cls, /shadow-9e-md/, 'a cardStyle treatment is being read again');
  }
});

// ── the Navy card's LIGHT course tiles ──────────────────────────────────────

test('a Navy card gives every course tile the light scope', () => {
  const doc = render({ bundleCardTheme: 'navy' });
  assert.match(doc.body.innerHTML, new RegExp(BUNDLE_TILE_LIGHT_CLASS),
    'the tile must re-declare the light tokens');
});

test('a Navy card leaves NO active dark: colour inside the tile subtree', () => {
  // The decisive claim of the round. `dark:` compiles to `:is(.dark *)`, which
  // matches a descendant of ANY `.dark` ancestor — so the card's own `dark`
  // would keep these firing inside the light tile. They must be absent from
  // the markup, not merely overridden.
  const html = render({ bundleCardTheme: 'navy' }).body.innerHTML;
  assert.doesNotMatch(html, /dark:bg-9e-navy/, 'the cover placeholder kept its dark form');
  assert.doesNotMatch(html, /dark:text-amber-400/, 'the unresolved-course warning kept its dark form');
  assert.doesNotMatch(html, /dark:bg-white\/10/, 'the status badge kept its dark form');
  assert.doesNotMatch(html, /dark:text-slate-300/, 'the status badge kept its dark text form');
});

test('the tile keeps its LIGHT halves — stripping removed the dark forms only', () => {
  // The other side of the test above, and it is REQUIRED rather than tidy: the
  // `doesNotMatch` assertions would pass vacuously if the three elements did
  // not render at all, and a tile with no background would look like a pass.
  //
  // All three ARE exercised by this fixture, verified rather than assumed:
  //   · the cover placeholder    -> bg-9e-ice      (no cover resolves)
  //   · the unresolved warning   -> text-amber-700 (no course resolves)
  //   · the status badge, NEUTRAL form -> bg-slate-100 text-slate-600
  //     (the round does not resolve, so resolveDerivedRoundBadge answers
  //     neutral — which is the one soft form carrying BOTH a dark:bg and a
  //     dark:text, i.e. the strictest of the four to strip)
  const html = render({ bundleCardTheme: 'navy' }).body.innerHTML;
  assert.match(html, /bg-9e-ice/, 'the cover placeholder lost its light background');
  assert.match(html, /text-amber-700/, 'the unresolved warning lost its light colour');
  assert.match(html, /bg-slate-100/, 'the status badge lost its light background');
  assert.match(html, /text-slate-600/, 'the status badge lost its light text colour');
});

test("the LEFT column's dark: variants are untouched on a Navy card", () => {
  // The strip is scoped to the tile. The left column sits directly on the navy
  // and its dark forms are what make the price and the closed state readable
  // there — a strip that reached them would be the opposite bug.
  const html = render({ bundleCardTheme: 'navy', registrationOpen: true }).body.innerHTML;
  assert.match(html, /dark:text-red-400/, 'the net price lost its dark form');
});

// ── the border: BOTH styles ─────────────────────────────────────────────────

test('border OFF by default on both styles: no class, no border variables', () => {
  for (const style of [undefined, { bundleCardTheme: 'navy' }]) {
    const el = card(style);
    assert.ok(!el.classList.contains(BUNDLE_BORDER_CLASS));
    const s = el.getAttribute('style') ?? '';
    assert.doesNotMatch(s, /--bundle-border-color/);
    assert.doesNotMatch(s, /--bundle-border-width/);
  }
});

test('border ON works on BOTH styles, defaulting to 1px', () => {
  for (const theme of ['light', 'navy']) {
    const el = card({ bundleCardTheme: theme, cardBorderOn: true });
    assert.ok(el.classList.contains(BUNDLE_BORDER_CLASS), `the border must render on ${theme}`);
    const s = el.getAttribute('style');
    assert.match(s, new RegExp(`--bundle-border-color:\\s*${BUNDLE_BORDER_COLOR_DEFAULT}`, 'i'));
    assert.match(s, /--bundle-border-width:\s*1px/);
  }
});

test("border ON honours the author's colour and width on both styles", () => {
  for (const theme of ['light', 'navy']) {
    const s = card({
      bundleCardTheme: theme, cardBorderOn: true, cardBorderColor: '#ABCDEF', cardBorderWidth: 3,
    }).getAttribute('style');
    assert.match(s, /--bundle-border-color:\s*#ABCDEF/i);
    assert.match(s, /--bundle-border-width:\s*3px/);
  }
});

test('control: a stored border colour stays INERT while the toggle is off', () => {
  const el = navy({ cardBorderColor: '#ABCDEF', cardBorderWidth: 4 });
  assert.ok(!el.classList.contains(BUNDLE_BORDER_CLASS));
  assert.doesNotMatch(el.getAttribute('style') ?? '', /ABCDEF/i);
});

// ── the prohibition ─────────────────────────────────────────────────────────

test('NO colour is ever emitted as an interpolated Tailwind arbitrary class', () => {
  const el = navy({
    bundleGlowLeft: '#112233',
    bundleGlowRight: '#445566',
    cardBorderOn: true,
    cardBorderColor: '#ABCDEF',
  });
  assert.doesNotMatch(el.className, /\[#[0-9a-f]{3,8}\]/i, 'a colour leaked into a class');
  assert.doesNotMatch(el.className, /#[0-9a-f]{6}/i, 'a raw hex leaked into a class');
  for (const hex of ['#112233', '#445566', '#ABCDEF']) {
    assert.match(el.getAttribute('style'), new RegExp(hex, 'i'), `${hex} must ride in on a variable`);
  }
});
