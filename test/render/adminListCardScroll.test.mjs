import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomPagesAdminClient } from '@/app/admin/pages/_components/CustomPagesAdminClient';
// ADDED beside the statement above rather than folded into it — the standing
// rule in this repo.
import { compile, declarationsFor } from '../twCompile.mjs';
import { chainsTo, attr } from '../markupTree.mjs';
import { readSource } from '../sourceScan.mjs';

/**
 * THE ROWS SCROLL INSIDE THE CARD, AND THE PAGER IS NOT IN THE SCROLLER.
 *
 * ══ THE DEFECT ══════════════════════════════════════════════════════════════
 * At 1920×1080 / 100% zoom the `/admin/pages` table (PAGE_SIZE 12, two-line
 * title/slug cells) was taller than the viewport, so the `ก่อนหน้า 1 2 ถัดไป`
 * bar sat below the fold and could only be reached by zooming out. The page was
 * a bare `<div>` — a content-height column — and the pager was simply the last
 * thing in a stack taller than the screen.
 *
 * ══ WHAT THIS TIER CAN HONESTLY SAY ════════════════════════════════════════
 * `renderToStaticMarkup` has no viewport, no boxes and no
 * getBoundingClientRect. It CANNOT see that the pager is on screen. Writing an
 * assertion that looked like it could is the vacuity this suite keeps finding,
 * and test/render/menuEscapesClip's header records nine of them.
 *
 * So this file asserts the two things that ARE checkable from here, and they
 * are between them the whole mechanism:
 *
 *   1. CONTAINMENT — the pagination bar is NOT a descendant of the element
 *      that scrolls, and IS a descendant of the card. That is structural: it is
 *      read off the real ancestor chain of the real render, by the same walk
 *      menuEscapesClip uses, and it is the one thing no class-name match can
 *      see. A pager inside the scroller scrolls away with the rows; a pager
 *      after the card goes below the fold. Only "sibling of the scroller,
 *      inside the card" is the fix, and only a tree walk can tell the three
 *      apart.
 *
 *   2. THE DECLARATIONS — what the classes on each of those elements actually
 *      COMPILE to, read out of a real Tailwind build rather than matched as
 *      strings. `flex-1` without `min-h-0` is the defect that looks exactly
 *      like the fix: a flex item's default `min-height: auto` floors it at its
 *      content height, so the card cannot shrink below the full table, the page
 *      grows, and the pager is below the fold again with every class name
 *      reading correctly. A class-name assertion cannot distinguish those two
 *      states. A compiled `min-height: 0px` can.
 *
 * ══ WHAT IT CANNOT SAY, stated rather than implied ═════════════════════════
 *   · that the page is exactly 100dvh tall and `main` therefore does not
 *     scroll — that is arithmetic across three files, and it lives in
 *     test/render/adminFullHeightRoutes, which owns the route/padding pair;
 *   · that the sticky header actually stays put, or that the scrollbar appears.
 *     Those need a viewport. They are on the human checklist and nowhere else.
 */

/**
 * The classes are compiled from the REAL source of the screen under test, as
 * `{ raw, extension }` content entries — the shape `compile` wants and the
 * same one menuEscapesClip uses. Compiling a hand-written class list instead
 * would make every declaration below true of a string in this file rather
 * than of the shipped component.
 */
const COMPILED_FROM = ['src/app/admin/pages/_components/CustomPagesAdminClient.jsx'];
const css = await compile(COMPILED_FROM.map((rel) => ({ raw: readSource(rel).code, extension: 'js' })));

/** Every declaration any class in the string compiles to. */
const declsFor = (cls) => cls.split(/\s+/).filter(Boolean).flatMap((c) => declarationsFor(css, c));

/** `n` rows — more than PAGE_SIZE (12), so the pager actually renders. */
const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({
  _id: `id${i}`,
  _type: i % 2 ? 'builder' : 'advanced_html',
  title: `หน้า ${i}`,
  slug: `page-${i}`,
  status: i % 3 ? 'published' : 'draft',
  draft: null,
  updatedAt: null,
}));

const render = (n) => renderToStaticMarkup(
  createElement(CustomPagesAdminClient, { pages: rowsOf(n), canCreateAdvanced: true })
);

const PAGINATED = render(30);   // 30 rows / 12 per page = 3 pages
const ONE_PAGE = render(4);     // fewer rows than fit — no pager at all

/**
 * The three elements this file is about, found by `data-testid` and by TAG —
 * never by the classes under test.
 *
 * A selector that keys on the property being asserted is how a test stays green
 * over zero elements: menuEscapesClip's header records a draft that found its
 * floating panel by looking for `fixed`, so putting `absolute` back made the
 * panel stop being FOUND rather than be found and reported wrong. The count
 * assertions in the first test are what turn a vanished element into a failure.
 */
const scrollers = chainsTo(PAGINATED, (n) => attr(n.raw, 'data-testid') === 'admin-list-scroll');
const pagers = chainsTo(PAGINATED, (n) => attr(n.raw, 'data-testid') === 'admin-list-pager');
const theads = chainsTo(PAGINATED, (n) => n.tag === 'thead');

// ════════════════════════════════════════════════════════════════════════════
// 0. THE INSTRUMENT, BEFORE ANYTHING IT REPORTS IS BELIEVED
// ════════════════════════════════════════════════════════════════════════════

test('the walk is balanced and finds exactly one of each element', () => {
  /**
   * A walk that over-pops reports a SHORT chain, and a short chain has no
   * containing ancestors in it — which is a green test that checked nothing.
   * This is the same guard menuEscapesClip runs, for the same reason, now over
   * the shared module in test/markupTree.mjs.
   */
  for (const [name, r] of [['scroller', scrollers], ['pager', pagers], ['thead', theads]]) {
    assert.equal(r.unmatched, 0, `${name}: the walk popped an empty stack — close tags are unbalanced`);
    assert.equal(r.leftover, 0, `${name}: the walk ended with ${r.leftover} tags still open`);
    assert.equal(r.found.length, 1, `${name}: expected exactly one, found ${r.found.length}`);
  }
  // And the chains are DEEP, which is the other half of "the walk works": a
  // scanner that pushed nothing would also report no containing ancestors.
  assert.ok(
    pagers.found[0].ancestors.length >= 2,
    `the pager chain is implausibly shallow: ${pagers.found[0].ancestors.length}`,
  );
});

test('the compiled stylesheet is real, and the probe can read it', () => {
  // Otherwise every `declsFor` below is an empty array and every `some()`
  // assertion is false for a reason that has nothing to do with the layout.
  assert.ok(css.length > 500, `the Tailwind build produced ${css.length} bytes`);
  assert.deepEqual(declarationsFor(css, 'flex'), ['display: flex']);
  assert.deepEqual(declarationsFor(css, 'min-h-0'), ['min-height: 0px']);
});

// ════════════════════════════════════════════════════════════════════════════
// 1. CONTAINMENT — the claim no class name can express
// ════════════════════════════════════════════════════════════════════════════

test('the pagination bar is NOT inside the scroller', () => {
  /**
   * THE HEADLINE. A pager inside the rows region scrolls away with the rows,
   * which is a different bug wearing the same classes.
   */
  const inScroller = pagers.found[0].ancestors
    .some((a) => attr(a.raw, 'data-testid') === 'admin-list-scroll');
  assert.equal(inScroller, false, 'the pager is a descendant of the rows scroller');
});

test('the pagination bar IS inside the card, as a sibling of the scroller', () => {
  /**
   * The other half, and the one that distinguishes this fix from the state
   * BEFORE it — where the pager was outside the card entirely, after it in a
   * content-height column. "Not in the scroller" is true of that arrangement
   * too, so on its own it would have been green over the defect.
   *
   * The card is identified as the scroller's own parent — a structural fact —
   * and the pager must share it.
   */
  const card = scrollers.found[0].ancestors.at(-1);
  assert.ok(card, 'the scroller has no parent — the card is gone');
  const pagerParent = pagers.found[0].ancestors.at(-1);
  assert.ok(pagerParent, 'the pager has no parent');
  assert.equal(
    pagerParent.raw, card.raw,
    'the pager is not a child of the card that holds the scroller — it is back '
    + 'outside the card, which is the arrangement that put it below the fold',
  );
});

test('the TABLE is inside the scroller, and the thead with it', () => {
  // The converse of the two above: if the rows were outside the scroller it
  // would be an empty box and nothing would scroll, with both containment
  // assertions still green.
  const tables = chainsTo(PAGINATED, (n) => n.tag === 'table');
  assert.equal(tables.found.length, 1, `expected one table, found ${tables.found.length}`);
  for (const [name, r] of [['table', tables], ['thead', theads]]) {
    assert.ok(
      r.found[0].ancestors.some((a) => attr(a.raw, 'data-testid') === 'admin-list-scroll'),
      `the ${name} is not inside the scroller`,
    );
  }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE DECLARATIONS — compiled, not matched
// ════════════════════════════════════════════════════════════════════════════

test('the scroller actually scrolls, and can shrink below its content', () => {
  const decls = declsFor(scrollers.found[0].node.cls);
  assert.ok(
    decls.some((d) => /^overflow\s*:\s*auto$/.test(d)),
    `the rows region does not scroll: [${decls.join(', ')}]`,
  );
  // BOTH axes, deliberately. The card was `overflow-hidden` before, so a table
  // wider than the content column was clipped and its rightmost column
  // unreachable; `overflow: auto` scrolls it inside the card instead.
  assert.ok(
    decls.includes('min-height: 0px'),
    'the scroller has no min-h-0, so its default min-height: auto floors it at '
    + `the full table height and nothing scrolls: [${decls.join(', ')}]`,
  );
  assert.ok(
    decls.some((d) => /^flex\s*:\s*1\s+1\s+0%$/.test(d)),
    `the scroller does not fill the card: [${decls.join(', ')}]`,
  );
});

test('the card fills the page and can shrink below the table', () => {
  const card = scrollers.found[0].ancestors.at(-1);
  const decls = declsFor(card.cls);
  for (const want of ['display: flex', 'flex-direction: column', 'min-height: 0px']) {
    assert.ok(decls.includes(want), `the card is missing ${want}: [${decls.join(', ')}]`);
  }
  assert.ok(
    decls.some((d) => /^flex\s*:\s*1\s+1\s+0%$/.test(d)),
    `the card does not take the remaining height: [${decls.join(', ')}]`,
  );
});

test('every flex ancestor between the page root and the scroller allows shrinking', () => {
  /**
   * THE CHAIN, not two spot checks. `min-h-0` is needed at EVERY flex level
   * between the fixed-height root and the scroller: one link left at the
   * default `min-height: auto` is floored at its content height and the
   * overflow reappears there, with the two assertions above still green.
   *
   * The root is the element that declares the height; everything strictly
   * inside it and outside the scroller must either be flex-growing with
   * `min-height: 0` or not be in the flex chain at all.
   */
  const chain = scrollers.found[0].ancestors;
  const rootAt = chain.findIndex((a) => declsFor(a.cls).some((d) => /^height\s*:\s*100dvh$/.test(d)));
  assert.notEqual(rootAt, -1, `no ancestor of the scroller declares a viewport height: ${chain.map((a) => a.cls).join(' | ')}`);

  for (const link of chain.slice(rootAt + 1)) {
    const decls = declsFor(link.cls);
    const grows = decls.some((d) => /^flex\s*:\s*1\s+1\s+0%$/.test(d));
    if (!grows) continue;                 // not a growing link; cannot floor the chain
    assert.ok(
      decls.includes('min-height: 0px'),
      `a growing flex link between the 100dvh root and the scroller has no `
      + `min-h-0, so it is floored at its content height: [${link.cls}]`,
    );
  }
});

test('the page root is a fixed-height column that carries its own padding', () => {
  /**
   * The padding half matters because this route left AdminContentWrapper's
   * `p-6` behind when it joined FULL_HEIGHT_ROUTES — if the root did not carry
   * it, the screen would be flush against the sidebar and the viewport edges.
   * The route/padding PAIR is owned by test/render/adminFullHeightRoutes; this
   * is the inside half of it.
   */
  const chain = scrollers.found[0].ancestors;
  const root = chain.find((a) => declsFor(a.cls).some((d) => /^height\s*:\s*100dvh$/.test(d)));
  const decls = declsFor(root.cls);
  for (const want of ['display: flex', 'flex-direction: column']) {
    assert.ok(decls.includes(want), `the page root is missing ${want}: [${decls.join(', ')}]`);
  }
  // `1.5rem`, which is what this config compiles `p-6` to — read off the build
  // rather than assumed to be `24px`, because the unit is the config's choice
  // and asserting the wrong one fails for a reason unrelated to the layout.
  assert.ok(
    decls.includes('padding: 1.5rem'),
    `the page root does not carry p-6, so the screen is flush against the `
    + `sidebar and the viewport edges: [${decls.join(', ')}]`,
  );
  // Height last, as the thing the two above are only correct alongside.
  assert.ok(
    decls.some((d) => /^height\s*:\s*100dvh$/.test(d)),
    `the page root is not a viewport-height box: [${decls.join(', ')}]`,
  );
});

test('the header row stays pinned, with an opaque background in both themes', () => {
  /**
   * `position: sticky` alone is not the claim — a sticky header with no
   * background lets the rows scroll visibly under the labels, which is the same
   * unreadable result as not sticking at all. `top: 0` is the other half: a
   * sticky box with no inset offset never leaves flow.
   */
  const decls = declsFor(theads.found[0].node.cls);
  assert.ok(decls.includes('position: sticky'), `the thead is not sticky: [${decls.join(', ')}]`);
  assert.ok(decls.includes('top: 0px'), `the sticky thead has no top offset: [${decls.join(', ')}]`);
  assert.ok(
    decls.some((d) => /^background-color\s*:/.test(d)),
    `the sticky thead is transparent — rows will scroll under the labels: [${decls.join(', ')}]`,
  );
  // And the DARK override is present as a class, so the two themes do not
  // disagree about whether the header is opaque. Compiled declarations are read
  // for the light value above; the dark one lives behind a media/selector
  // variant, so its presence is what is checkable here.
  assert.match(
    theads.found[0].node.cls, /\bdark:bg-/,
    `the sticky thead has no dark-mode background: [${theads.found[0].node.cls}]`,
  );
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE CONTROLS
// ════════════════════════════════════════════════════════════════════════════

test('CONTROL: the containment probe can tell the three arrangements apart', () => {
  /**
   * The probe is `ancestors.some(testid === scroller)` plus a parent
   * comparison, and both are run here against markup shaped like the two WRONG
   * answers. Without this, "the pager is not in the scroller" could be true
   * because the walk finds no ancestors at all.
   */
  const card = (inner) => `<div class="card">${inner}</div>`;
  const scroller = (inner) => `<div data-testid="admin-list-scroll" class="s">${inner}</div>`;
  const pager = '<div data-testid="admin-list-pager" class="p"><nav></nav></div>';

  // WRONG A — the pager inside the scroller (scrolls away with the rows).
  const insideHtml = card(scroller(`<table></table>${pager}`));
  const inside = chainsTo(insideHtml, (n) => attr(n.raw, 'data-testid') === 'admin-list-pager');
  assert.equal(inside.found.length, 1);
  assert.equal(
    inside.found[0].ancestors.some((a) => attr(a.raw, 'data-testid') === 'admin-list-scroll'),
    true,
    'the probe cannot see a pager nested in the scroller — every containment '
    + 'assertion above is vacuous',
  );

  // WRONG B — the pager after the card (the state before this fix: not in the
  // scroller, and still below the fold).
  const afterHtml = `${card(scroller('<table></table>'))}${pager}`;
  const after = chainsTo(afterHtml, (n) => attr(n.raw, 'data-testid') === 'admin-list-pager');
  const afterScroller = chainsTo(afterHtml, (n) => attr(n.raw, 'data-testid') === 'admin-list-scroll');
  assert.equal(
    after.found[0].ancestors.some((a) => attr(a.raw, 'data-testid') === 'admin-list-scroll'),
    false,
    'WRONG B is supposed to be outside the scroller — the fixture is wrong',
  );
  assert.notEqual(
    after.found[0].ancestors.at(-1)?.raw ?? null,
    afterScroller.found[0].ancestors.at(-1).raw,
    'the parent comparison cannot separate "sibling of the scroller" from '
    + '"after the card" — which is the arrangement that shipped the bug',
  );

  // RIGHT — sibling of the scroller, inside the card.
  const rightHtml = card(`${scroller('<table></table>')}${pager}`);
  const right = chainsTo(rightHtml, (n) => attr(n.raw, 'data-testid') === 'admin-list-pager');
  const rightScroller = chainsTo(rightHtml, (n) => attr(n.raw, 'data-testid') === 'admin-list-scroll');
  assert.equal(
    right.found[0].ancestors.at(-1).raw,
    rightScroller.found[0].ancestors.at(-1).raw,
    'the probe rejects the CORRECT arrangement',
  );
});

test('CONTROL: the declaration probe can tell flex-1 from flex-1 + min-h-0', () => {
  // The distinction the whole second half of this file rests on, and the one a
  // class-name match is blind to.
  assert.deepEqual(declarationsFor(css, 'flex-1'), ['flex: 1 1 0%']);
  assert.ok(!declarationsFor(css, 'flex-1').includes('min-height: 0px'));
  assert.deepEqual(declarationsFor(css, 'min-h-0'), ['min-height: 0px']);
  // And `overflow-hidden`, which is what the card had before, is NOT a scroller.
  assert.ok(!declarationsFor(css, 'overflow-hidden').some((d) => /auto|scroll/.test(d)));
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE SHORT-LIST CASE, which is a decision and not an accident
// ════════════════════════════════════════════════════════════════════════════

test('a list shorter than one page renders NO pager strip at all', () => {
  /**
   * `Pager` already returns null at `totalPages <= 1`; the bordered footer is
   * rendered under the same condition, so a short list does not get a visible
   * empty strip with a top border and nothing in it.
   *
   * THE CHOICE THIS RECORDS: with fewer rows than fit, the rows do NOT stretch
   * — the table keeps its content height and the leftover space is blank card
   * below the last row, so when there IS a pager it sits at the CARD BOTTOM
   * rather than riding up under the last row. That is one of the two options
   * the brief allowed; it is picked so the pager is in the same place on every
   * page of every filter, which is the point of keeping it in view.
   */
  const short = chainsTo(ONE_PAGE, (n) => attr(n.raw, 'data-testid') === 'admin-list-pager');
  assert.equal(short.found.length, 0, 'a one-page list rendered a pagination strip');
  // The scroller and the card are still there, so the card still fills the page
  // and the rows still do not stretch.
  const shortScroller = chainsTo(ONE_PAGE, (n) => attr(n.raw, 'data-testid') === 'admin-list-scroll');
  assert.equal(shortScroller.found.length, 1, 'the short list lost its scroller');
});

test('CONTROL: the pager strip IS rendered once there is a second page', () => {
  // Otherwise the test above is satisfied by a pager that never renders.
  assert.equal(pagers.found.length, 1, 'a 30-row list rendered no pagination strip');
  assert.match(PAGINATED, /ก่อนหน้า/, 'the pager strip has no previous-page control');
  assert.match(PAGINATED, /ถัดไป/, 'the pager strip has no next-page control');
});
