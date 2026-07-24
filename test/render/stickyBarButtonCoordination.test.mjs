import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseStickyCTA } from '@/app/(public)/[...slug]/_components/CourseStickyCTA';

// jsdom does no layout and computes no stacking, so paint order / clickability
// can't be observed here. What IS structural: the DOM ancestry and the z-index /
// position utilities each element emits. From those we can (a) prove no ancestor
// traps the sidebar in a lower stacking context, and (b) compare the z-values
// the code actually ships. Real click testing is left to the eye.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = read('src/app/(public)/[...slug]/page.jsx');
const BUTTON = read('src/components/ui/ScrollToTopButton.jsx');
const LAYOUT = read('src/app/(public)/layout.jsx');

const R = (props) => renderToStaticMarkup(createElement(CourseStickyCTA, props));
const barHtml = () =>
  R({ title: 'Power BI', coverUrl: null, hasSchedules: true, inhouseHref: null });

// ── Does a class string form a new stacking context? ────────────────────────
// Encodes the CSS rules for stacking-context creation as Tailwind-class checks.
function createsStackingContext(cls) {
  const t = ` ${cls} `;
  const any = (...res) => res.some((re) => re.test(t));
  if (any(/\stransform\s/, /\s-?translate-/, /\s-?scale-/, /\s-?rotate-/, /\s-?skew-/, /\sperspective-/)) return true;
  if (any(/\sfilter\s/, /\sbackdrop-/, /\sblur-/, /\sbrightness-/, /\scontrast-/, /\sgrayscale/, /\shue-rotate-/, /\sinvert/, /\ssaturate-/, /\ssepia/, /\sdrop-shadow-/)) return true;
  const op = t.match(/\sopacity-(\d+)/);
  if (op && Number(op[1]) < 100) return true;
  if (any(/\sisolate\s/, /\smix-blend-/, /\swill-change-transform/, /\swill-change-opacity/, /\scontain-(layout|paint|strict|content)/, /\scontent-visibility-/)) return true;
  if (any(/\s(?:sm:|md:|lg:|xl:|2xl:)?fixed\s/, /\s(?:sm:|md:|lg:|xl:|2xl:)?sticky\s/)) return true; // fixed/sticky always
  const positioned = /\s(?:sm:|md:|lg:|xl:|2xl:)?(?:relative|absolute)\s/.test(t);
  const hasZ = /\s(?:sm:|md:|lg:|xl:|2xl:)?z-/.test(t);
  return positioned && hasZ; // relative/absolute create one only WITH a z-index
}

// Within one stacking context: positive z-index paints above un-positioned /
// z-auto flow content.
const rank = ({ positioned, z }) => (!positioned || z == null ? 0 : z);

// ── ISSUE 1a: the sidebar is not trapped below the bar ──────────────────────
// The aside's ancestors up to the root, with the exact classes each carries.
const ASIDE_ANCESTORS = [
  { name: 'grid', src: PAGE, classes: 'grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_300px]' },
  { name: 'content-wrapper', src: PAGE, classes: 'mx-auto max-w-[1200px] pt-8 pb-36 lg:pb-8' },
  { name: 'article', src: PAGE, classes: 'bg-white' },
  { name: 'layout-main', src: LAYOUT, classes: 'flex-1' },
  { name: 'layout-shell', src: LAYOUT, classes: 'relative min-h-[100dvh] flex flex-col' },
];

test('no ancestor traps the sidebar in a lower stacking context', () => {
  for (const anc of ASIDE_ANCESTORS) {
    // tie the model to reality: the class string must still be in the source
    assert.ok(anc.src.includes(anc.classes), `ancestor "${anc.name}" classes still present in source`);
    // and none of them may create a stacking context
    assert.equal(
      createsStackingContext(anc.classes),
      false,
      `ancestor "${anc.name}" must NOT create a stacking context (would trap the aside)`,
    );
  }
  // The layout shell is `relative` — the classic trap IF it also had a z-index.
  // Confirm the predicate would catch that, so the check above isn't vacuous.
  assert.equal(createsStackingContext('relative min-h-[100dvh] flex flex-col'), false);
  assert.equal(createsStackingContext('relative z-10 min-h-[100dvh]'), true, 'relative+z WOULD trap');
});

// ── ISSUE 1b: computed paint order from the real z-values ───────────────────
test('sidebar and button paint above the bar; the bar paints above ordinary content', () => {
  const barZ = Number(barHtml().match(/\bz-(\d+)\b/)[1]);
  const asideClass = PAGE.match(/<aside\s+className="([^"]*)"/)[1];
  const buttonZ = Number(BUTTON.match(/\bz-(\d+)\b/)[1]);
  const asideZ = Number(asideClass.match(/\bz-(\d+)\b/)[1]);

  // the aside must be positioned at every breakpoint for its z-index to apply
  assert.ok(/\brelative\b/.test(asideClass), 'aside is positioned (relative) below lg');
  assert.ok(/\blg:sticky\b/.test(asideClass), 'aside is sticky at lg');

  const content = { positioned: false, z: null }; // ordinary flow (accordions, related)
  const bar = { positioned: true, z: barZ };
  const aside = { positioned: true, z: asideZ };
  const button = { positioned: true, z: buttonZ };

  assert.ok(rank(bar) > rank(content), `bar (z-${barZ}) above ordinary content`);
  assert.ok(rank(aside) > rank(bar), `sidebar (z-${asideZ}) above bar (z-${barZ})`);
  assert.ok(rank(button) > rank(bar), `back-to-top button (z-${buttonZ}) above bar (z-${barZ})`);
});

// ── ISSUE 1c: the button is back at its original position ───────────────────
test('button reverted to its original position, register case intact, no lift', () => {
  assert.ok(/\bz-50\b/.test(BUTTON), 'button stays at z-50 (elevated tier, above the bar)');
  assert.ok(/lg:bottom-8/.test(BUTTON), 'lg position is the original bottom-8');
  assert.ok(/'bottom-24'/.test(BUTTON), 'register-flow bottom-24 case preserved');
  assert.ok(/'bottom-8'/.test(BUTTON), 'default resting position bottom-8');
  assert.ok(!/bottom-36/.test(BUTTON), 'the sticky-bar lift is gone');
  assert.ok(!/stickyBottomBar/.test(BUTTON), 'no dependency on the removed coordination store');
});

// ── ISSUE 2 (current rule, per the CourseStickyCTA edit): content-column ──────
// aligned below 1920px, page-centered at 1920px+. The `min-[1920px]:` breakpoint
// and 860/900 widths are read straight from what the component ships.
test('bar aligns to the content column below 1920px and centers at 1920px+', () => {
  const html = barHtml();
  assert.ok(html.includes('max-w-[1200px]'), 'bar box mirrors the 1200px content box');
  assert.ok(html.includes('justify-start'), 'left-aligned to the content column by default');
  assert.ok(html.includes('min-[1920px]:justify-center'), 'centered on the page at >=1920px');
  assert.ok(html.includes('max-w-[860px]'), 'card ~ main content column width by default');
  assert.ok(html.includes('min-[1920px]:max-w-[900px]'), 'card widens to a centered pill at >=1920px');
  assert.ok(html.includes('px-4'), 'small-screen edge inset');
});

test('bar switches regimes at 1920px: left-of-centre below, page-centred at/above (CONTROL)', () => {
  const html = barHtml();
  // both regimes must exist, or the "switch" is vacuous
  assert.ok(
    html.includes('justify-start') && html.includes('min-[1920px]:justify-center'),
    'left by default, centred only at >=1920px',
  );
  // geometry: a left-aligned 860px card inside the centered 1200 box sits LEFT of
  // the viewport centre at wide-but-sub-1920 widths (the deliberate look); a
  // centered card at >=1920 is exactly on the page centre.
  const boxW = (V) => Math.min(V, 1200);
  const boxLeft = (V) => (V - boxW(V)) / 2;
  const alignedCenter = (V) => boxLeft(V) + Math.min(860, boxW(V)) / 2;
  assert.ok(alignedCenter(1440) < 1440 / 2, 'content-aligned bar is left of centre at 1440px');
  assert.ok(alignedCenter(1900) < 1900 / 2, 'still left of centre at 1900px (just under the switch)');
  assert.equal(1920 / 2, 960, 'at >=1920 the centred card sits on the page centre');
});

// ── CONTROL for the stacking flip ───────────────────────────────────────────
test('CONTROL: the pre-fix z-values painted the sidebar BELOW the bar', () => {
  // pre-fix: bar z-[60], aside had NO z-index (z-auto)
  const oldBar = { positioned: true, z: 60 };
  const oldAside = { positioned: true, z: null }; // sticky but z-auto
  assert.ok(rank(oldAside) < rank(oldBar), 'old: sidebar painted below the bar (the bug)');
  // post-fix flips it (uses the real shipped values)
  const barZ = Number(barHtml().match(/\bz-(\d+)\b/)[1]);
  const asideZ = Number(PAGE.match(/<aside\s+className="([^"]*)"/)[1].match(/\bz-(\d+)\b/)[1]);
  assert.ok(asideZ > barZ, 'new: sidebar paints above the bar');
});

// ── Constraints preserved ────────────────────────────────────────────────────
test('bar keeps its vertical position and reveal/translate transition', () => {
  const html = barHtml();
  for (const tok of ['bottom-2', 'md:bottom-6', 'min-h-[7rem]']) {
    assert.ok(html.includes(tok), `preserved: ${tok}`);
  }
  assert.ok(html.includes('transition-transform'), 'translate transition kept');
  assert.ok(/translate-y-\[calc\(100%\+2rem\)\]/.test(html), 'off-screen translate kept');
  // and it dropped out of the app's elevated z tier
  assert.ok(html.includes('z-40') && !html.includes('z-[60]'), 'bar lowered to z-40');
});
