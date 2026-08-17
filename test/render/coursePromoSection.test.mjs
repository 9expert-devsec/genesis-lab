import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoursePromoSection } from '@/app/(public)/[...slug]/_components/CoursePromoSection';
import { readSource } from '../sourceScan.mjs';

/**
 * The course page's promotion block.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 * `grid grid-cols-2` with no responsive qualifier anywhere in the file, so a
 * phone got two ~160px columns, each still seating an 80px thumbnail, a
 * two-line title, a date line and a full-height button side by side. The
 * button was the other half: `shrink-0 ... h-full rounded-r-9e-md`, a filled
 * rail glued to the card edge, and the only tappable part of the row.
 *
 * ── WHY EVERY ASSERTION HERE IS PAIRED ──────────────────────────────────────
 * Nothing in test/ read this file before, so every claim below is new and a
 * bare class-string assertion is the exact false-green this suite keeps
 * catching. Each one is fired at something that genuinely lacks the property —
 * usually the PRE-CHANGE markup, quoted — so a probe that stopped describing
 * reality fails in its control rather than passing here.
 *
 * ── WHAT THIS TIER CANNOT SEE ───────────────────────────────────────────────
 * It renders to a string: no layout, no viewport, no widths. That two columns
 * of ~296px are too narrow at sm, and that one column reads correctly on a
 * phone, are click-tested by a human and by nothing else. What is checked here
 * is which classes and which elements reach the DOM.
 *
 * It also cannot see anchor un-nesting. An <a> written inside another <a> is
 * taken apart by the browser's PARSER, not by React, so `renderToStaticMarkup`
 * happily returns the nested string and a probe over that string reports a DOM
 * that never exists. That is why the rail guards below count anchors and check
 * containment structurally rather than just asserting the rail's classes: the
 * one property that would silently rot is the one this tier must be made to
 * look at directly.
 *
 * ── THE RAIL CAME BACK (follow-up to 61df291) ───────────────────────────────
 * 61df291 removed the filled "ดูโปรโมชัน" rail at every width, and the guards
 * here asserted its absence at every width. That rule is no longer the rule:
 * the rail returns on WIDE CARDS, gated by a container query on the row. Those
 * assertions have been rewritten to state the real rule — including the parts
 * of the old rail that stayed gone — rather than removed to make room.
 */

const promo = (over = {}) => ({
  link: { _id: `l-${over.promotion_id ?? '1'}` },
  promotion: {
    promotion_id: '1',
    api_slug: 'summer-sale',
    title: 'ลดราคาคอร์สอบรมช่วงกลางปี สำหรับผู้สมัครล่วงหน้า',
    thumbnail_url: 'https://example.com/a.jpg',
    end_date: '2026-09-05T00:00:00.000Z',
    ...over,
  },
});

const html = (rows) => renderToStaticMarkup(createElement(CoursePromoSection, { coursePromos: rows }));

/** The grid that holds the rows. */
function grid(markup) {
  const m = markup.match(/<div class="[^"]*\bgrid\b[^"]*"/);
  if (!m) {
    throw new Error(
      'the promo grid did not render. Every class check below would then pass ' +
        'vacuously, so this throws rather than returning an empty string.'
    );
  }
  return m[0];
}

/** The row anchor's class attribute. */
function rowAnchor(markup) {
  const m = markup.match(/<a[^>]*href="\/promotions\/summer-sale"[^>]*>/);
  if (!m) throw new Error('the row anchor did not render; every probe below would pass vacuously');
  return m[0];
}

/** The rail block's opening tag — matched on the fill, not on a tag name. */
function rail(markup) {
  const m = markup.match(/<div class="[^"]*\bbg-9e-action\b[^"]*"/);
  if (!m) throw new Error('the rail did not render; every probe below would pass vacuously');
  return m[0];
}

/** The inline arrow affordance's opening tag. */
function inlineCta(markup) {
  const m = markup.match(/<span class="[^"]*\btext-9e-action\b[^"]*"/);
  if (!m) throw new Error('the inline affordance did not render');
  return m[0];
}

/**
 * Everything between the row anchor's `<a ...>` and the FIRST `</a>` after it.
 *
 * If a second anchor were opened inside the row, it would appear in this slice
 * before the slice ends — which is the whole point. Written as a plain scan so
 * the nesting check is a fact about the string, not a regex that has to be
 * trusted; `nestedAnchors` below is what the assertions read.
 */
function rowInterior(markup) {
  const open = markup.match(/<a[^>]*href="\/promotions\/summer-sale"[^>]*>/);
  if (!open) throw new Error('no row anchor to inspect');
  const from = open.index + open[0].length;
  const close = markup.indexOf('</a>', from);
  if (close === -1) throw new Error('the row anchor never closes');
  return markup.slice(from, close);
}

const nestedAnchors = (markup) => (rowInterior(markup).match(/<a\b/g) || []).length;

// ── the grid is responsive ──────────────────────────────────────────────────

test('one column by default, two only from md', () => {
  const g = grid(html([promo()]));
  assert.match(g, /\bgrid-cols-1\b/, 'the mobile floor is one column');
  assert.match(g, /\bmd:grid-cols-2\b/, 'two columns arrive at md');
});

test('CONTROL: those probes reject the pre-change grid', () => {
  // Exactly what shipped: two columns at every width, no qualifier.
  const before = '<div class="grid grid-cols-2 gap-2">';
  assert.equal(/\bgrid-cols-1\b/.test(before), false, 'it had no one-column state');
  assert.equal(/\bmd:grid-cols-2\b/.test(before), false, 'and no breakpoint');
  // ...and the probes are not matching everything: grid-cols-2 alone must not
  // satisfy the md check, or the fix would be indistinguishable from the bug.
  assert.equal(/\bmd:grid-cols-2\b/.test('grid grid-cols-2'), false);
});

test('the breakpoint is the one /promotions already uses', () => {
  // Not deference for its own sake — matching it is what keeps this block from
  // being a third dialect. Read as CODE so prose about the choice cannot
  // satisfy it.
  const promotionsPage = readSource('src/app/(public)/promotions/page.jsx');
  assert.match(
    promotionsPage.code,
    /grid-cols-1[^"]*\bmd:grid-cols-2\b/,
    'the promotions grid is still grid-cols-1 ... md:grid-cols-2'
  );
  assert.match(grid(html([promo()])), /\bmd:grid-cols-2\b/, 'and this block matches it');
});

// ── ONE anchor per row, whatever form the CTA takes ─────────────────────────
//
// This is the guard that outranks every class check in the file. The rail is
// back, and the ONE way it must not come back is as its own <a>.

test('the row is ONE link, not a card with a button in the corner', () => {
  const markup = html([promo()]);
  const anchors = markup.match(/<a\b/g) || [];
  // One for the row, one for the section's "see all" header link.
  assert.equal(anchors.length, 2, 'exactly one anchor per row plus the header link');
  assert.match(rowAnchor(markup), /class="[^"]*\bgroup\b/,
    'the row anchor wraps the card and drives the hover group');
});

test('the rail is INSIDE that one anchor, and is not an anchor itself', () => {
  // An <a> in here would be un-nested by the parser, so the shipped DOM would
  // stop matching this markup and every other probe in the file would be
  // describing a page that does not exist.
  const markup = html([promo()]);
  assert.equal(nestedAnchors(markup), 0, 'no anchor is opened inside the row anchor');
  assert.match(rowInterior(markup), /\bbg-9e-action\b/, 'and the rail is genuinely in there');
  assert.match(rail(markup), /^<div\b/, 'the rail is a block, not a link');
});

test('CONTROL: the nesting probes fire on a rail written as its own anchor', () => {
  // The exact regression this guards: the pre-61df291 rail, re-added unchanged
  // inside the row anchor 61df291 introduced. The string renders; the DOM does
  // not. Both probes must catch it, or neither is doing anything.
  const nested =
    '<a href="/promotions" class="x">see all</a>' +
    '<a href="/promotions/summer-sale" class="group flex"><img/>' +
    '<a class="bg-9e-action h-full rounded-r-9e-md">ดูโปรโมชัน</a></a>';
  assert.equal((nested.match(/<a\b/g) || []).length, 3, 'the count probe sees three, not two');
  assert.equal(nestedAnchors(nested), 1, 'and the containment probe names the nested one');
  // ...and it is not simply reporting 1 for everything: the real markup is 0.
  assert.equal(nestedAnchors(html([promo()])), 0);
});

// ── the rail's treatment, recovered from before 61df291 ─────────────────────

test('the rail restores the pre-61df291 filled block', () => {
  const r = rail(html([promo()]));
  assert.match(r, /\bbg-9e-action\b/, 'brand fill');
  assert.match(r, /\btext-9e-ice\b/, 'on the light label colour it always had');
  assert.match(r, /\brounded-r-9e-md\b/, 'rounded on the outer corners only');
  assert.match(r, /\bpx-4\b/, 'the same horizontal padding');
  assert.match(r, /\bfont-en text-sm font-medium\b/, 'and the same type');
  assert.match(html([promo()]), /ดูโปรโมชัน/, 'with the label');
});

test('CONTROL: those probes all fail against the markup 61df291 shipped', () => {
  // The row as it stood between 61df291 and this change — no rail at all. If
  // the probes above were matching something incidental, they would match here.
  const withoutRail =
    '<a href="/promotions/summer-sale" class="group flex items-center gap-3 rounded-9e-md ' +
    'border border-[var(--surface-border)] bg-[var(--surface)] p-3 transition-colors ' +
    'duration-9e-micro hover:border-9e-brand/30">';
  for (const probe of [/\bbg-9e-action\b/, /\btext-9e-ice\b/, /\brounded-r-9e-md\b/]) {
    assert.equal(probe.test(withoutRail), false, `${probe} must not match the rail-less row`);
  }
});

test('h-full did NOT come back with it', () => {
  // Deliberately not restored. It was a percentage height against a parent of
  // auto height, so the old rail was as tall as the text rather than the card.
  // `self-stretch` plus the negative margins do the job the class only claimed.
  const r = rail(html([promo()]));
  assert.equal(/\bh-full\b/.test(r), false, 'no percentage height');
  assert.match(r, /\bself-stretch\b/, 'the flex line sets the height instead');
});

test('CONTROL: the h-full probe DOES fire on the pre-change button', () => {
  // The rail's real class string, quoted from before 61df291. Without this the
  // `false` assertion above could be passing against a stale regex.
  const old =
    '<a class="shrink-0 inline-flex items-center justify-center bg-9e-action px-4 py-2 ' +
    'font-en text-sm font-medium h-full rounded-r-9e-md text-9e-ice hover:bg-9e-brand">';
  assert.equal(/\bh-full\b/.test(old), true, 'the old rail had it');
  assert.equal(/\bself-stretch\b/.test(old), false, 'and not the replacement');
});

test('the rail follows the ROW hover, not its own', () => {
  // It is no longer independently hoverable, so `hover:` would light it up only
  // while the pointer sat on the rail and leave the row it belongs to cold.
  const r = rail(html([promo()]));
  assert.match(r, /\bgroup-hover:bg-9e-brand\b/, 'group-hover drives the fill');
  assert.equal(/(^|\s|")hover:bg-9e-brand\b/.test(r), false, 'no self-hover');
});

test('CONTROL: the self-hover probe fires on the pre-change class string', () => {
  const old = 'text-9e-ice hover:bg-9e-brand transition-colors';
  assert.equal(/(^|\s|")hover:bg-9e-brand\b/.test(old), true, 'which is what it used to be');
  // ...and the probe is not just matching the substring inside `group-hover:`.
  assert.equal(/(^|\s|")hover:bg-9e-brand\b/.test('group-hover:bg-9e-brand'), false);
});

test('the rail cancels exactly the padding the row carries', () => {
  // The row keeps its p-3 (61df291's fix — the whole card is the target, so the
  // whole card is padded). The rail reaches the edge by giving that padding
  // back on its own three sides. If the two numbers drift, the rail stops at a
  // 4px gutter and nobody notices in a string render.
  const markup = html([promo()]);
  const pad = rowAnchor(markup).match(/\bp-(\d+)\b/);
  const my = rail(markup).match(/-my-(\d+)\b/);
  const mr = rail(markup).match(/-mr-(\d+)\b/);
  assert.ok(pad && my && mr, 'the row is padded and the rail pulls back');
  assert.equal(my[1], pad[1], 'the vertical pull matches the row padding');
  assert.equal(mr[1], pad[1], 'and so does the horizontal one');
});

test('CONTROL: the padding-match probe rejects a mismatched pair', () => {
  // Otherwise "they are equal" could be two reads of the same capture.
  const pad = '<a class="p-3">'.match(/\bp-(\d+)\b/);
  const drifted = '<div class="-my-4 -mr-4 bg-9e-action">'.match(/-my-(\d+)\b/);
  assert.notEqual(drifted[1], pad[1], 'a rail pulling back 16px through 12px of padding is caught');
});

// ── one CTA at a time ───────────────────────────────────────────────────────

test('the inline affordance is still the /promotions vocabulary', () => {
  const markup = html([promo()]);
  assert.match(markup, /→/, 'an arrow, like ดูรายละเอียด → on /promotions');
  assert.match(markup, /\bgroup-hover:translate-x-1\b/, 'and the same hover nudge');

  const promotionsPage = readSource('src/app/(public)/promotions/page.jsx');
  assert.match(
    promotionsPage.code,
    /\bgroup-hover:translate-x-1\b/,
    'which is the vocabulary being matched, not invented here'
  );
});

test('CONTROL: the arrow-nudge probe is not satisfied by any hover class', () => {
  assert.equal(/\bgroup-hover:translate-x-1\b/.test('hover:bg-9e-brand transition-colors'), false);
});

test('the rail and the inline link swap on ONE threshold — never both, never neither', () => {
  // Two CTAs in one row is worse than either alone, and here they would be the
  // same words twice pointing at the same href. So they are complementary
  // halves of a single number.
  const markup = html([promo()]);
  const shows = rail(markup).match(/@\[(\d+)px\]:flex\b/);
  const hides = inlineCta(markup).match(/@\[(\d+)px\]:hidden\b/);
  assert.ok(shows, 'the rail appears at a container width');
  assert.ok(hides, 'the inline affordance disappears at one');
  assert.equal(shows[1], hides[1], 'and it is the same width, so exactly one is on');
  assert.match(rail(markup), /\bhidden\b/, 'the rail is off below it');
});

test('CONTROL: the swap probe catches thresholds that drift apart', () => {
  const shows = '<div class="hidden @[480px]:flex bg-9e-action">'.match(/@\[(\d+)px\]:flex\b/);
  const hides = '<span class="@[400px]:hidden text-9e-action">'.match(/@\[(\d+)px\]:hidden\b/);
  assert.notEqual(shows[1], hides[1], 'an 80px band showing both CTAs is caught');
});

// ── the gate is the CARD's width, and the number is checked against it ──────

/**
 * The card's real width at a viewport, resolved from the live layout classes
 * rather than from numbers typed into this file.
 *
 * The chain: `mx-auto max-w-[1200px] px-4` on the page shell → the page grid,
 * one column below lg and `lg:grid-cols-[1fr_300px]` above it → this section's
 * 1px border and `p-4` → this grid, one column below md and two above.
 *
 * Everything but the two Tailwind breakpoints is READ, so if the sidebar, the
 * page cap or either padding moves, these numbers move with it and the
 * threshold assertion below reports that it has gone stale.
 */
function cardWidthModel(markup) {
  const page = readSource('src/app/(public)/[...slug]/page.jsx').code;
  const shell = page.match(/max-w-\[(\d+)px\] px-(\d+)/);
  const pageGrid = page.match(/gap-(\d+) lg:grid-cols-\[1fr_(\d+)px\]/);
  const sectionPad = markup.match(/<section[^>]*class="[^"]*\bp-(\d+)\b/);
  const gridGap = grid(markup).match(/\bgap-(\d+)\b/);
  if (!shell || !pageGrid || !sectionPad || !gridGap) {
    throw new Error(
      'the layout chain no longer parses, so the widths below would be invented. ' +
        'Re-read the page shell / page grid / section padding / grid gap and fix this model.'
    );
  }
  assert.match(markup, /<section[^>]*class="[^"]*\bborder\b/, 'the section border is 1px a side');

  const u = 4; // Tailwind spacing unit
  const [, maxW, shellPad] = shell.map(Number);
  const [, pageGap, sidebar] = pageGrid.map(Number);
  const inset = 2 * 1 + 2 * Number(sectionPad[1]) * u; // border + section padding
  return (vw) => {
    const container = Math.min(vw, maxW) - 2 * shellPad * u;
    const main = vw >= 1024 ? container - sidebar - pageGap * u : container;
    const inner = main - inset;
    return vw >= 768 ? (inner - Number(gridGap[1]) * u) / 2 : inner;
  };
}

/** Widest card over a viewport range, and WHERE — the vw is half the finding. */
const widest = (card, lo, hi) => {
  let best = { vw: lo, w: -Infinity };
  for (let vw = lo; vw <= hi; vw++) if (card(vw) > best.w) best = { vw, w: card(vw) };
  return best;
};

/**
 * The three regimes the card's width moves through, by name. They are not the
 * Tailwind breakpoints and there is no class anywhere that spells them:
 *   A  one page column, one grid column   — the card is the content width
 *   B  one page column, TWO grid columns  — grid split, sidebar not yet taken
 *   C  sidebar taken, two grid columns    — and capped by max-w-[1200px]
 * B has no breakpoint name at all, which is how it got missed the first time.
 */
const REGIMES = [
  { name: 'A below md (one column)', lo: 320, hi: 767 },
  { name: 'B md → lg (grid split, page not)', lo: 768, hi: 1023 },
  { name: 'C lg and up (sidebar taken)', lo: 1024, hi: 2560 },
];

test('the rail is reachable in ALL THREE width regimes, desktop included', () => {
  // THE CENTRAL RULE, and the one 2412163 got wrong. Its threshold of 480 was
  // above regime C's maximum of 397px, so the rail could never render on any
  // desktop width — it survived only in a ~546-767 band. A threshold that
  // excludes a whole regime is not a narrow rule, it is a broken one.
  const markup = html([promo()]);
  const card = cardWidthModel(markup);
  const threshold = Number(rail(markup).match(/@\[(\d+)px\]:flex\b/)[1]);

  for (const r of REGIMES) {
    const max = widest(card, r.lo, r.hi);
    assert.ok(
      threshold <= max.w,
      `regime ${r.name} can never show the rail: its widest card is ${max.w}px ` +
        `at vw=${max.vw}, threshold ${threshold}px. This is the 2412163 defect.`
    );
  }
});

test('CONTROL: that reachability probe DOES reject 2412163’s 480', () => {
  // Without this the loop above could be passing because every regime is wide,
  // or because the model reports nonsense. 480 is the number that shipped and
  // was wrong; it must fail in regime C and pass in A, or the probe is not
  // discriminating between "narrow" and "unreachable".
  const card = cardWidthModel(html([promo()]));
  const [a, b, c] = REGIMES.map((r) => widest(card, r.lo, r.hi).w);
  assert.ok(480 > c, `480 excluded regime C entirely (max ${c}px) — the reported bug`);
  assert.ok(480 > b, `and regime B too (max ${b}px)`);
  assert.ok(480 <= a, `while regime A (max ${a}px) kept it, which is why it looked fine on a phone`);
});

test('the binding case is the DESKTOP CAP, and it clears', () => {
  // For 480 the binding md+ case was vw=1023. It is not any more: the number is
  // now bounded ABOVE by the width the rail has to keep reaching, which is the
  // narrowest desktop card once max-w-[1200px] stops the growth.
  const markup = html([promo()]);
  const card = cardWidthModel(markup);
  const threshold = Number(rail(markup).match(/@\[(\d+)px\]:flex\b/)[1]);

  const capped = widest(card, 1024, 2560);
  assert.equal(capped.vw, 1200, 'regime C peaks where the page cap bites, not at the widest screen');
  assert.ok(
    threshold <= capped.w,
    `the rail must survive at the desktop cap: card ${capped.w}px, threshold ${threshold}px`
  );
  // Pinned because the component documents it: 21px of headroom, not 5.5px.
  assert.ok(
    capped.w - threshold >= 20,
    `and with real headroom: ${capped.w - threshold}px. If the page cap or the 300px ` +
      'sidebar moved, the rail is about to leave desktop again.'
  );
});

test('CONTROL: the headroom probe is not satisfied by any threshold at all', () => {
  const card = cardWidthModel(html([promo()]));
  const capped = widest(card, 1024, 2560).w;
  assert.equal(capped - 480 >= 20, false, 'the number that shipped had NEGATIVE headroom here');
  assert.equal(capped - 390 >= 20, false, 'and 390 would clear the card by only 7px');
});

test('THE MOBILE CASE IS UNCHANGED: the phone resolves to the inline affordance', () => {
  // 61df291's whole point, approved and not up for renegotiation. Only the
  // upper regime moved. At a phone width the card is ~324px, which must land
  // BELOW the threshold so the rail stays hidden and `ดูโปรโมชัน →` shows.
  const markup = html([promo()]);
  const card = cardWidthModel(markup);
  const threshold = Number(rail(markup).match(/@\[(\d+)px\]:flex\b/)[1]);
  const hidesInline = Number(inlineCta(markup).match(/@\[(\d+)px\]:hidden\b/)[1]);

  const phone = card(390);
  assert.ok(phone < threshold, `the phone card is ${phone}px and must not reach ${threshold}px`);
  assert.ok(
    phone < hidesInline,
    `and must stay below the inline CTA's hide point (${hidesInline}px), or the row ` +
      'would render NO call to action at all on a phone'
  );
  // The whole of regime A up to the crossing keeps the inline form.
  assert.ok(widest(card, 320, 441).w < threshold, 'every width up to 441 keeps the inline link');
});

test('CONTROL: the mobile probe fires on a threshold that would reach the phone', () => {
  // Otherwise "324 < threshold" could be passing for any number, and a future
  // threshold low enough to put a rail on a 324px card would sail through.
  const card = cardWidthModel(html([promo()]));
  const phone = card(390);
  assert.equal(phone < 300, false, `a 300px threshold WOULD put the rail on the ${phone}px phone card`);
  assert.ok(phone < 376, 'while the shipped threshold does not');
  // ...and the phone width is the one 61df291 was about, not an arbitrary vw.
  assert.ok(phone < card(700), 'a phone card is narrower than the widest one-column card');
});

test('the shown and hidden bands are the three the component documents', () => {
  // Reported as RANGES, scanned, not sampled. The component's docstring lists
  // these; if the layout or the threshold moves, this is what says so.
  const markup = html([promo()]);
  const card = cardWidthModel(markup);
  const threshold = Number(rail(markup).match(/@\[(\d+)px\]:flex\b/)[1]);

  const bands = [];
  let cur = null;
  for (let vw = 320; vw <= 2560; vw++) {
    const on = card(vw) >= threshold;
    if (on && !cur) cur = vw;
    if (!on && cur) { bands.push([cur, vw - 1]); cur = null; }
  }
  if (cur) bands.push([cur, 2560]);

  assert.deepEqual(
    bands,
    [[442, 767], [826, 1023], [1158, 2560]],
    'the rail shows in exactly three bands, one per regime — see the docstring table'
  );
});

test('CONTROL: the band scan collapses to one band under the old threshold', () => {
  // Proves the scan is reading the threshold rather than reporting a constant.
  const card = cardWidthModel(html([promo()]));
  const bandsFor = (t) => {
    const out = []; let cur = null;
    for (let vw = 320; vw <= 2560; vw++) {
      const on = card(vw) >= t;
      if (on && !cur) cur = vw;
      if (!on && cur) { out.push([cur, vw - 1]); cur = null; }
    }
    if (cur) out.push([cur, 2560]);
    return out;
  };
  assert.deepEqual(bandsFor(480), [[546, 767]], 'which is the band the bug report described');
  assert.equal(bandsFor(480).length, 1, 'one band, and nothing at or above lg');
});

test('CONTROL: the model reproduces the cliff the threshold is reasoning about', () => {
  // Fired at the numbers themselves, so the reachability loop cannot be passing
  // on a model that reports nonsense. If any of these invert, the rule in the
  // component is arguing from a layout that no longer exists.
  const card = cardWidthModel(html([promo()]));
  assert.ok(card(700) > card(768), `700px card ${card(700)} vs 768px card ${card(768)}`);
  assert.ok(card(1023) > card(1024) + 100, `the sidebar cliff: ${card(1023)} -> ${card(1024)}`);
  assert.ok(card(1024) < card(390), `lg card ${card(1024)} is narrower than a phone's ${card(390)}`);
  // ...and the scan does not merely return its upper bound, which would make
  // every assertion above true for any layout at all.
  assert.notEqual(widest(card, 768, 2560).vw, 2560, 'the widest md+ card is not the widest screen');
});

test('the gate is a container query, not a viewport breakpoint', () => {
  const markup = html([promo()]);
  assert.match(rowAnchor(markup), /\B@container\b/, 'the row is the query container');
  assert.match(rail(markup), /@\[\d+px\]:/, 'and the rail asks it, not the window');
  for (const bp of [/\bsm:/, /\bmd:/, /\blg:/, /\bxl:/]) {
    assert.equal(bp.test(rail(markup)), false, `${bp} would re-introduce the viewport guess`);
  }
});

test('CONTROL: the container probes reject a viewport-gated rail', () => {
  const viewportGated = '<div class="hidden md:flex bg-9e-action rounded-r-9e-md">';
  assert.equal(/@\[\d+px\]:/.test(viewportGated), false, 'no container query in it');
  assert.equal(/\bmd:/.test(viewportGated), true, 'and the breakpoint probe does fire');
  // ...and `@container` is not matching the bare `container` utility.
  assert.equal(/\B@container\b/.test('mx-auto container flex'), false);
});

test('CONTROL: the container-query utilities are REAL, not dead class strings', () => {
  /**
   * ── THIS CONTROL CHANGED ITS EVIDENCE, AND THE REASON IS WORTH RECORDING ───
   * It used to prove "not a one-off" by pointing at two other files that also
   * used `@[Npx]:` — training-course/CourseCard and components/ScheduleCard.
   * NEITHER DOES ANY MORE, and this section is now the only container-query user
   * in src/. That is stated plainly rather than papered over.
   *
   * They stopped for a good reason, not by drift. ScheduleCard drew its border
   * as a fixed `viewBox="0 0 90 80"` SVG path in a fixed `h-[70px] w-[83px]`
   * box, and `@[280px]:h-[80px] @[280px]:w-[88px]` was how it reached for a
   * second hardcoded size when its container got wider. The box now sizes to its
   * CONTENT — which is what a Thai round label required, and which is strictly
   * better than querying a container to pick between two fixed sizes. There is
   * nothing left for the query to do there.
   *
   * So the claim is re-pointed at something stronger than a second witness: that
   * these utilities COMPILE AT ALL. `@container` and `@[520px]:` are provided by
   * a plugin; without it registered they are not Tailwind classes, they are
   * inert text in a class attribute — and every assertion above would still pass
   * while the rail silently reverted to always-on. That is the failure this
   * control now guards, and no count of sibling files could ever have caught it.
   *
   * If a second file adopts container queries, the "vocabulary" claim becomes
   * available again and this is the place to restore it.
   */
  const config = readSource('tailwind.config.js').code;
  assert.match(
    config,
    /@tailwindcss\/container-queries/,
    'the container-query plugin is not registered — @container compiles to nothing',
  );
  assert.match(config, /plugins:\s*\[/, 'and it is registered as a plugin');

  // The former witnesses, asserted as ABSENT so this note cannot go stale
  // silently: if either grows a container query back, come and re-read the above.
  for (const file of ['src/app/(public)/training-course/_components/CourseCard.jsx',
                      'src/components/ScheduleCard.jsx']) {
    assert.equal(
      /@\[\d+px\]:/.test(readSource(file).code),
      false,
      `${file} queries its container again — the note above needs updating`,
    );
  }
});

// ── padding moved onto the row ──────────────────────────────────────────────

test('the row itself carries the padding, so nothing can sit outside it', () => {
  // The rail existed because padding lived on an inner wrapper only.
  const markup = html([promo()]);
  assert.match(
    markup,
    /<a[^>]*href="\/promotions\/[^"]*"[^>]*class="[^"]*\bp-3\b/,
    'p-3 is on the row anchor'
  );
});

test('CONTROL: the pre-change row had no padding on its outer element', () => {
  const before =
    '<div class="flex items-center gap-3 rounded-9e-md border border-[var(--surface-border)] ' +
    'bg-[var(--surface)] transition-colors duration-9e-micro hover:border-9e-brand/30">';
  assert.equal(/\bp-3\b/.test(before), false, 'which is what let the rail reach the edge');
});

// ── the thumbnail placeholder ───────────────────────────────────────────────

test('the empty thumbnail is the same size as a real one', () => {
  const withImage = html([promo()]);
  const without = html([promo({ thumbnail_url: null })]);
  assert.match(withImage, /h-\[80px\]\s+w-\[80px\]/, 'the image slot is 80x80');
  assert.match(without, /h-\[80px\]\s+w-\[80px\]/, 'and so is the placeholder');
});

test('CONTROL: the size probe would notice the old mismatched placeholder', () => {
  // It was h-[60px] w-[80px], so a promo with no thumbnail made its row 20px
  // shorter than the one beside it in the same grid track.
  const oldPlaceholder = '<div class="h-[60px] w-[80px] shrink-0 rounded-9e-sm bg-9e-ice">';
  assert.equal(/h-\[80px\]\s+w-\[80px\]/.test(oldPlaceholder), false);
});

// ── the cap, and the empty case ─────────────────────────────────────────────

test('at most two rows, whatever the column count', () => {
  const many = [promo({ promotion_id: '1' }), promo({ promotion_id: '2' }), promo({ promotion_id: '3' })];
  const rows = html(many).match(/href="\/promotions\/summer-sale"/g) || [];
  assert.equal(rows.length, 2, 'a content cap, not a layout one — it does not follow the columns');
});

test('CONTROL: the row counter can see more than two when they are rendered', () => {
  // Otherwise "equals 2" could be passing because the probe caps itself.
  const three = '<a href="/promotions/summer-sale"></a>'.repeat(3);
  assert.equal((three.match(/href="\/promotions\/summer-sale"/g) || []).length, 3);
});

test('empty input renders nothing at all', () => {
  assert.equal(html([]), '', 'no empty shell');
  assert.equal(renderToStaticMarkup(createElement(CoursePromoSection, {})), '');
});

// ── it must stay a server component ─────────────────────────────────────────

test('no client boundary and no state', () => {
  // A "use client" here would pull the whole promo block into the bundle for a
  // section that renders once and never changes.
  const src = readSource('src/app/(public)/[...slug]/_components/CoursePromoSection.jsx');
  assert.equal(/["']use client["']/.test(src.code), false, 'no client directive');
  assert.equal(/\buseState\b|\buseEffect\b/.test(src.code), false, 'and no hooks');
});

test('CONTROL: the client-boundary probe fires on a file that has one', () => {
  const clientFile = readSource('src/components/payment/Step2MobileBar.jsx');
  assert.equal(/["']use client["']/.test(clientFile.code), true, 'a real client component trips it');
});
