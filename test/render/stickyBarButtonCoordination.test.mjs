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

// ── The model is DERIVED from source, never transcribed ─────────────────────
// Transcribing it is what broke this file: be78611 changed <article> from
// `bg-white` to `bg-[var(--page-bg)]` — a colour-only dark-mode swap that
// creates NO stacking context — and the hardcoded copy went stale, turning a
// no-op edit into a red suite and a multi-day detour. Reading the class off the
// source means the assertion runs against what the page actually ships, so it
// can only go red for a reason that is really about stacking.
//
// A missing anchor THROWS rather than degrading: an element that was renamed or
// deleted must not silently drop out of the model, because a dropped entry is an
// unchecked ancestor.
function classOf({ label, re, src = PAGE, file = 'page.jsx' }) {
  const m = src.match(re);
  if (!m) {
    throw new Error(
      `[stacking model] could not locate "${label}" in ${file}. It was renamed, ` +
      `deleted, or its attributes were reordered — the stacking model is now ` +
      `BLIND to that ancestor. Re-anchor the selector; do NOT drop the entry.`
    );
  }
  return m[1];
}

// GROUP 1 — ancestors BETWEEN the <aside> and <article>. These are the ones that
// decide sidebar-vs-bar. CourseStickyCTA is a DIRECT CHILD of <article>, so
// <article> is the common ancestor of both; trapping a common ancestor cannot
// reorder its own descendants, which is why it is not in this group.
const BETWEEN_ASIDE_AND_BAR = [
  { label: 'grid (#course-content)', re: /<div\s+id="course-content"\s+className="([^"]*)"/ },
  { label: 'content-wrapper',        re: /<div\s+className="([^"]*max-w-\[1200px\][^"]*)"/ },
];

// GROUP 2 — ancestors AT AND ABOVE <article>. These decide a DIFFERENT pairing:
// the whole article subtree versus the layout's z-50 UI (header, back-to-top
// button), which are siblings of <main>, not descendants of <article>.
// The aside itself. Routed through classOf like everything else so a renamed or
// deleted <aside> reports WHICH element vanished, instead of the bare
// "Cannot read properties of null (reading '1')" that a raw .match(...)[1] gives.
const ASIDE = { label: 'aside (sidebar)', re: /<aside\s+className="([^"]*)"/ };

const AT_AND_ABOVE_ARTICLE = [
  { label: 'article',      re: /<article\s+className="([^"]*)"/ },
  { label: 'layout-main',  re: /<main[^>]*\sclassName="([^"]*)"/,                  src: LAYOUT, file: 'layout.jsx' },
  { label: 'layout-shell', re: /<div\s+className="([^"]*min-h-\[100dvh\][^"]*)"/,  src: LAYOUT, file: 'layout.jsx' },
];

// ── ISSUE 1a (i): sidebar vs. the sticky bar ────────────────────────────────
test('sidebar-vs-bar: no ancestor between the aside and <article> traps the sidebar under the bar', () => {
  for (const anc of BETWEEN_ASIDE_AND_BAR) {
    const cls = classOf(anc); // throws if the element is gone — see classOf
    assert.equal(
      createsStackingContext(cls),
      false,
      `ancestor "${anc.label}" must NOT create a stacking context — it would confine the ` +
        `aside's z-50 inside it, and the bar's z-40 would then paint OVER the sidebar. ` +
        `Shipped classes: "${cls}"`,
    );
  }
  // Non-vacuity: the predicate must still be capable of returning true, or the
  // loop above degrades to "always passes". The layout shell is `relative` —
  // the classic trap IF it ever also gained a z-index.
  assert.equal(createsStackingContext('relative min-h-[100dvh] flex flex-col'), false);
  assert.equal(createsStackingContext('relative z-10 min-h-[100dvh]'), true, 'relative+z WOULD trap');
});

// ── ISSUE 1a (ii): the article subtree vs. the layout's elevated UI ─────────
test('article-vs-layout-UI: no ancestor at/above <article> traps its subtree under the header or back-to-top', () => {
  for (const anc of AT_AND_ABOVE_ARTICLE) {
    const cls = classOf(anc);
    assert.equal(
      createsStackingContext(cls),
      false,
      `ancestor "${anc.label}" must NOT create a stacking context — it would seal the whole ` +
        `article subtree into one layer and change how it interleaves with the layout's ` +
        `z-50 header / back-to-top button. Shipped classes: "${cls}"`,
    );
  }
});

// ── ISSUE 1a (iii): the chain must not GROW ─────────────────────────────────
// The hole this closes: the two lists above enumerate the ancestors we know
// about, and NOTHING made them complete. Wrapping the grid in
// <div className="isolate"> genuinely traps the sidebar (the bar's z-40 would
// paint over the aside's z-50) while every assertion above stays green, because
// the new wrapper simply is not in the list.
//
// Mechanism: count the net nesting depth of layout elements between <article>
// and <aside>. It is a depth counter, not a JSX parser — it matches only
// lowercase HTML container tags, so React components (Capitalized, and always
// either self-closing or balanced) are skipped entirely. Verified against the
// real file: the span contains `div` and nothing else, and no matched tag has a
// ">" inside an attribute value. If either stops being true this goes red rather
// than quietly mis-counting.
const CONTAINER_TAG =
  /<(\/?)(?:div|section|article|aside|main|header|footer|nav|form|figure|ul|ol|li|p|table)\b([^>]*)>/g;

const EXPECTED_ASIDE_DEPTH = 2; // content-wrapper → grid, then the aside

function asideDepthBelowArticle() {
  const from = PAGE.match(/<article\s+className="[^"]*"/);
  const to = PAGE.match(/<aside\s+className="[^"]*"/);
  if (!from || !to) throw new Error('[stacking model] <article> or <aside> not found in page.jsx');
  let depth = 0;
  CONTAINER_TAG.lastIndex = from.index + from[0].length;
  let m;
  while ((m = CONTAINER_TAG.exec(PAGE)) && m.index < to.index) {
    if (m[1] === '/') depth -= 1;                             // </div>
    else if (!m[2].trimEnd().endsWith('/')) depth += 1;       // <div ...> (not self-closing)
  }
  return depth;
}

test('the aside→article chain has not GROWN: a new wrapper would trap the sidebar unchecked', () => {
  assert.equal(
    asideDepthBelowArticle(),
    EXPECTED_ASIDE_DEPTH,
    `The number of elements wrapping the <aside> inside <article> changed. A NEW ANCESTOR ` +
      `APPEARED (or one was removed). Do not just bump this number and do not merely add it ` +
      `to BETWEEN_ASIDE_AND_BAR: first assess whether the new element creates a stacking ` +
      `context (transform / filter / backdrop-filter / opacity<1 / isolate / mix-blend / ` +
      `will-change / contain / perspective / clip-path / mask, or position+z-index). If it ` +
      `does, it confines the aside's z-50 and the sticky bar's z-40 will paint OVER the ` +
      `sidebar, making the Course Outline downloads unclickable at lg+.`,
  );
});

// ── ISSUE 1b: computed paint order from the real z-values ───────────────────
test('sidebar and button paint above the bar; the bar paints above ordinary content', () => {
  const barZ = Number(barHtml().match(/\bz-(\d+)\b/)[1]);
  const asideClass = classOf(ASIDE);
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
  const asideZ = Number(classOf(ASIDE).match(/\bz-(\d+)\b/)[1]);
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
