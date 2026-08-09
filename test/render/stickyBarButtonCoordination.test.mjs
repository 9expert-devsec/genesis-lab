import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseStickyCTA } from '@/app/(public)/[...slug]/_components/CourseStickyCTA';
import { readSource } from '../sourceScan.mjs';

// jsdom does no layout and computes no stacking, so paint order / clickability
// can't be observed here. What IS structural: the DOM ancestry and the z-index /
// position utilities each element emits. From those we can (a) prove no ancestor
// traps the sidebar in a lower stacking context, and (b) compare the z-values
// the code actually ships. Real click testing is left to the eye.

// ── EVERY SOURCE READ IN THIS FILE GOES THROUGH sourceScan ──────────────────
// Audited one assertion at a time against the standing rule and its single
// documented exception (see the header of test/run.mjs): strip comments before
// matching source, EXCEPT where the subject under test IS a comment — a
// pragma, a directive, an eslint-disable — because scrubbing deletes the
// subject and the guard then fails on correct code.
//
// Not one assertion here has a comment as its subject. Every one matches a
// className, a tag, a z token or an import specifier, so all of them fall on
// the STRIP side of that line and none needs the raw file.
//
// This is not hypothetical tidying. The depth counter below went red this
// session on a completely correct page: a call-site comment explaining the
// stacking model happened to contain the words <article>, <aside> and <nav>,
// and the counter read them as three opening tags. Depth was 5 raw and 2
// stripped. The className guards have the same exposure in the other, worse
// direction — a comment quoting `className="...max-w-[1200px]..."` would
// satisfy the content-wrapper anchor while the real element had gone.
const PAGE = readSource('src/app/(public)/[...slug]/page.jsx').code;
const LAYOUT = readSource('src/app/(public)/layout.jsx').code;

// THE DOCK OWNS WHAT THE BUTTON USED TO. Every positioning claim this file made
// about ScrollToTopButton.jsx — the z tier, lg:bottom-8, the bottom-24/bottom-8
// register pair, the absence of the old bottom-36 lift and of stickyBottomBar —
// now belongs to FloatingActionDock, which is the single fixed container for the
// bottom-right stack. The claims did not change; the file that has to satisfy
// them did. ScrollToTopButton is a plain button now, and that it STAYS one is
// asserted in test/pure/floatingDockStack.
// Two forms, and picking the wrong one fails silently in both directions: a
// "does not CALL x" guard read WITH imports is satisfied by the import line,
// and an "imports x" guard read WITHOUT them sees no imports at all and passes
// vacuously. `DOCK` is the call-site view; `DOCK_IMPORTS` is the module-edge
// view, used only by the import-window guard further down.
const DOCK_SRC = readSource('src/components/ui/FloatingActionDock.jsx');
const DOCK = DOCK_SRC.code;

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
// the whole article subtree versus the elevated UI it must not trap itself
// above — PublicHeader (z-60), a sibling of <main> inside this layout's shell,
// and FloatingActionDock (z-50).
//
// The DOCK is no longer a sibling of <main>: it moved to the ROOT layout, and
// next-themes renders no DOM wrapper, so it is a direct child of <body> —
// strictly FEWER ancestors between it and the root than before. That only makes
// this check more likely to hold, never less, but the model says where things
// actually are rather than where they used to be.
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
test('article-vs-layout-UI: no ancestor at/above <article> traps its subtree under the header or dock', () => {
  for (const anc of AT_AND_ABOVE_ARTICLE) {
    const cls = classOf(anc);
    assert.equal(
      createsStackingContext(cls),
      false,
      `ancestor "${anc.label}" must NOT create a stacking context — it would seal the whole ` +
        `article subtree into one layer and change how it interleaves with the ` +
        `z-60 header / z-50 floating dock. Shipped classes: "${cls}"`,
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
test('sidebar and dock paint above the bar; the bar paints above ordinary content', () => {
  const barZ = Number(barHtml().match(/\bz-(\d+)\b/)[1]);
  const asideClass = classOf(ASIDE);
  // Routed through classOf like every other anchor, for the reason classOf
  // exists: the previous version read ScrollToTopButton.jsx with a raw
  // `.match(...)[1]`, so the moment that file stopped carrying a z-index the
  // suite died on "Cannot read properties of null" instead of saying which
  // element had lost its z token.
  const dockZ = Number(
    classOf({
      label: 'FloatingActionDock container',
      re: /className=\{`fixed[^`]*\bz-(\d+)\b[^`]*`\}/,
      src: DOCK,
      file: 'FloatingActionDock.jsx',
    }),
  );
  const asideZ = Number(asideClass.match(/\bz-(\d+)\b/)[1]);

  // the aside must be positioned at every breakpoint for its z-index to apply
  assert.ok(/\brelative\b/.test(asideClass), 'aside is positioned (relative) below lg');
  assert.ok(/\blg:sticky\b/.test(asideClass), 'aside is sticky at lg');

  const content = { positioned: false, z: null }; // ordinary flow (accordions, related)
  const bar = { positioned: true, z: barZ };
  const aside = { positioned: true, z: asideZ };
  const dock = { positioned: true, z: dockZ };

  assert.ok(rank(bar) > rank(content), `bar (z-${barZ}) above ordinary content`);
  assert.ok(rank(aside) > rank(bar), `sidebar (z-${asideZ}) above bar (z-${barZ})`);
  assert.ok(rank(dock) > rank(bar), `floating dock (z-${dockZ}) above bar (z-${barZ})`);
});

// ── ISSUE 1c: the original position survived the move to the dock ───────────
// Same six claims as before, now made against the file that carries them. The
// dock inherited the button's exact geometry — this is a relocation, not a
// redesign, and if any of these tokens changed value in the move that is a
// regression the user would see rather than a refactor.
test('dock holds the original position, register case intact, no lift', () => {
  assert.ok(/\bz-50\b/.test(DOCK), 'dock stays at z-50 (elevated tier, above the bar)');
  assert.ok(/lg:bottom-8/.test(DOCK), 'lg position is the original bottom-8');
  assert.ok(/'bottom-24'/.test(DOCK), 'register-flow bottom-24 case preserved');
  assert.ok(/'bottom-8'/.test(DOCK), 'default resting position bottom-8');
  assert.ok(!/bottom-36/.test(DOCK), 'the sticky-bar lift is gone');
});

// ── The dock's bottom-bar dependency, REWRITTEN rather than left green ──────
// This replaces `!/stickyBottomBar/.test(DOCK)` ("no dependency on the removed
// coordination store"). That claim became FALSE when the dock started reading
// @/lib/viewportBottomInset, and it would have stayed GREEN forever purely
// because the new module has a different name — a false green of the same
// shape this suite has caught before (a bare /ค้นหา/ matching a placeholder,
// `disabled` matching `disabled:opacity-30`, an assertion satisfied by a
// comment). An assertion that cannot notice the thing it forbids is worse than
// no assertion, so it is replaced with assertions of what is now true.
//
// ── WHY THE NEW DEPENDENCY IS NOT THE OLD ONE ───────────────────────────────
// HONEST LIMIT FIRST: the old store cannot be read. `stickyBottomBar` and
// `bottom-36` never appear in any committed src file in this repository's
// history — checked with `git log --all -S` over src. The rejected design
// existed only in a working tree, and this assertion was written to pin its
// removal. So what follows is inferred from the surviving evidence, not from
// the deleted code, and is labelled as such.
//
// The evidence is the sibling assertion above, `!/bottom-36/`. bottom-36 is
// 9rem: a hardcoded offset on the DOCK side chosen to match the height of a
// bar defined in a different file. That is the anti-pattern FloatingActionDock
// was created to end, and its own docstring names it — "two independently
// fixed elements have to agree about each other's height and offset, and that
// agreement is a pair of magic numbers in two files that nothing checks".
// Two numbers, both authored, both guesses, and nothing to detect them
// drifting apart.
//
// The new dependency has none of those three properties:
//
//   MEASURED, not authored. The publisher reports its own real height. There
//   is no second number on the dock side to keep in agreement — the dock
//   applies whatever arrives, so there is nothing to drift.
//   ONE DIRECTION. The dock imports the reader trio only. It cannot publish,
//   which is asserted below rather than merely intended.
//   NO KNOWLEDGE OF THE BAR. The dock imports a number-valued store, not
//   CourseStickyCTA. It still never learns that a bar exists, which is the
//   property the original assertion was really protecting.
//
// WHAT IS HONESTLY UNCHANGED: `dockLiftsForBottomBar` + 'bottom-24' is still
// exactly the old anti-pattern — an authored offset here that must agree with
// a bar's height over there. This commit does not remove it, and until it goes
// the repo has two answers to the same question. See the commit body.

// Whole import STATEMENTS, not import lines. The dock's docstring discusses
// the bar and the store by name, so a raw-source probe would be answered by
// prose — the "assertion satisfied by a comment" defect this suite already
// records. A comment cannot begin with `import`, so this window excludes
// comments by construction.
//
// It spans to the terminating `;` rather than taking single lines, because a
// multi-specifier import puts the MODULE PATH on the closing line:
//
//     import {
//       subscribe as subscribeBottomInset,     <- line starts with whitespace
//     } from '@/lib/viewportBottomInset';      <- the path lives here
//
// A line-based filter keeps only the first line and silently loses the path,
// which reads as "the dock does not import the store" — a false negative that
// pointed at innocent code. (Measured: the first draft did exactly this.)
const importLines = (src) => (src.match(/^import[\s\S]*?;$/gm) || []).join('\n');

test('the dock READS the measured bottom-inset store, and only reads it', () => {
  const imports = importLines(DOCK_SRC.withImports);

  assert.ok(
    /viewportBottomInset/.test(imports),
    'the dock depends on the measured store — this is the claim that replaced ' +
      'the stale !/stickyBottomBar/ negative'
  );
  assert.ok(
    !/setOccupiedBox|clearOccupiedBox/.test(imports),
    'it imports no publisher entry point, so the dependency cannot run backwards'
  );
  assert.ok(
    !/CourseStickyCTA|MasterclassRegisterClient/.test(imports),
    'and it never imports a bar — it is handed pixels, not a component'
  );
  // The offset is applied as padding; a computed anchor class would not
  // survive Tailwind's content scan and would fail silently.
  assert.ok(/paddingBottom/.test(DOCK), 'the inset lands as padding');
  assert.ok(!/bottom-\[\$\{/.test(DOCK), 'never as an interpolated bottom-* class');
});

test('CONTROL: each of those probes fires on an import block that violates it', () => {
  // Without this, three `!` assertions and one positive could all be passing
  // because the probes no longer describe anything. Each is fired at a
  // fabricated import block that genuinely has the defect.
  const noStore = "import { usePathname } from 'next/navigation';";
  assert.equal(/viewportBottomInset/.test(noStore), false, 'the positive probe can fail');

  const publishes = "import { setOccupiedBox } from '@/lib/viewportBottomInset';";
  assert.equal(
    /setOccupiedBox|clearOccupiedBox/.test(publishes),
    true,
    'the write-direction probe catches a publisher import'
  );

  const importsBar =
    "import { CourseStickyCTA } from '@/app/(public)/[...slug]/_components/CourseStickyCTA';";
  assert.equal(/CourseStickyCTA/.test(importsBar), true, 'the bar-import probe catches one');

  // And the window really does exclude prose: a comment naming the bar must
  // not register as an import.
  const commentOnly = '// matches CourseStickyCTA duration-300 ease-in-out';
  assert.equal(
    /CourseStickyCTA/.test(importLines(commentOnly)),
    false,
    'a comment naming the bar is NOT read as importing it'
  );

  // ...while a MULTI-LINE import keeps its module path, which a line-based
  // window would have dropped. This is the bug that made the first draft of
  // this test fail against correct code.
  const multiline = "import {\n  a,\n  b,\n} from '@/lib/viewportBottomInset';";
  assert.equal(
    /viewportBottomInset/.test(importLines(multiline)),
    true,
    'the window spans to the closing line where the path lives'
  );
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
