/**
 * THE IMAGE CARD'S SINGLE-ANCHOR INVARIANT, IN A REAL BROWSER, AT 375.
 *
 * test/render/featureContentImageCardLink.test.mjs pins the SHAPE of the tree
 * renderToStaticMarkup emits. It says so itself: it runs no effects, performs
 * no layout, dispatches no events, and cannot see that `lg:hidden` really
 * hides the copy block or that a tap fires exactly one navigation.
 *
 * This is that second half. It loads the live page at a 375 viewport, finds
 * the image slide by promoting it through the strip if it is not the one
 * showing, and asks the DOM the same questions the render test asks the
 * markup — plus the two only a browser can answer:
 *
 *   • the copy block is VISIBLE at 375 (it is `lg:hidden`, so a broken
 *     breakpoint would leave the card artwork-only on a phone and the render
 *     test would still be green);
 *   • a tap on the action span produces exactly ONE navigation.
 */
import { launch, openPage, tape } from './cdp.mjs';

const t = tape('click @375');
const { browser, close } = await launch();
const page = await openPage(browser, { width: 375, height: 812, mobile: true });

try {
  await page.goto('/', { waitMs: 4000 });

  // ── FIND AN IMAGE SLIDE ───────────────────────────────────────────────────
  // The pool is weight-ordered and the image records lead it today, so slide 0
  // is normally an image card. Do not assume it: ask, and if the active slide
  // is not one, walk the strip until it is. Auto-slide stops on the first strip
  // click, which is also what makes the rest of this run deterministic.
  const found = await page.eval(() => {
    const active = () => document.querySelector('[data-fc-slide="active"]');
    if (active()?.querySelector('[data-fc-card="image"]')) return { at: 'already', index: 0 };
    const cards = [...document.querySelectorAll('[data-fc-strip-card]')];
    for (let i = 0; i < cards.length; i += 1) {
      cards[i].click();
      if (active()?.querySelector('[data-fc-card="image"]')) return { at: 'promoted', index: i };
    }
    return null;
  });
  t.ok(found, 'an image slide is reachable', found ? JSON.stringify(found) : 'none in the pool');

  const shape = await page.eval(() => {
    const slide = document.querySelector('[data-fc-slide="active"]');
    const card = slide?.querySelector('[data-fc-card="image"]');
    if (!card) return null;
    const copy = card.querySelector('[data-fc-copy]');
    const action = card.querySelector('[data-fc-action]');
    const focusable = [...card.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]'
    )];
    const box = card.getBoundingClientRect();
    const art = card.querySelector('[data-fc-art]')?.getBoundingClientRect();
    return {
      tag: card.tagName,
      href: card.getAttribute('href'),
      nestedAnchors: card.querySelectorAll('a').length,
      buttons: card.querySelectorAll('button').length,
      focusable: focusable.map((e) => e.tagName + (e.getAttribute('href') ? '[href]' : '')),
      hasCopy: Boolean(copy),
      copyVisible: copy ? getComputedStyle(copy).display !== 'none' : false,
      actionInsideCard: action ? card.contains(action) : null,
      actionTag: action?.firstElementChild?.tagName ?? null,
      actionRole: action?.firstElementChild?.getAttribute('role') ?? null,
      actionTabindex: action?.firstElementChild?.getAttribute('tabindex') ?? null,
      cardW: Math.round(box.width), cardH: Math.round(box.height),
      artW: art ? Math.round(art.width) : null,
      artH: art ? Math.round(art.height) : null,
      artRatio: art ? Number((art.width / art.height).toFixed(3)) : null,
    };
  });

  t.ok(shape, 'the image card is in the DOM');
  if (shape) {
    t.eq(shape.tag, 'A', 'the card itself is the anchor');
    t.ok(shape.href, 'and it carries an href', shape.href);
    t.eq(shape.nestedAnchors, 0, 'NO nested anchor inside the card link');
    t.eq(shape.buttons, 0, 'NO <button> inside the card link');
    t.eq(shape.focusable.length, 0, 'NO focusable descendant of any kind',
      shape.focusable.join(', '));
    t.ok(shape.hasCopy, 'the below-lg copy block is rendered');
    t.ok(shape.copyVisible, 'and it is VISIBLE at 375 — `lg:hidden` is not firing here');
    t.eq(shape.actionInsideCard, true, 'the action block is a DESCENDANT of the card link');
    t.eq(shape.actionTag, 'SPAN', 'the action is a span, not an interactive element');
    t.eq(shape.actionRole, null, 'no role="button" — that re-adds the second control');
    t.eq(shape.actionTabindex, null, 'no tabindex, for the same reason');
    console.log(`\n  card ${shape.cardW}×${shape.cardH}, art ${shape.artW}×${shape.artH} ` +
      `(${shape.artRatio}:1)\n`);
  }

  // ── ONE TAP, ONE NAVIGATION ───────────────────────────────────────────────
  // Counted as main-frame document requests to the card's own href, because a
  // nested control fires the inner navigation AND the outer one — two entries,
  // which is exactly the defect the span exists to prevent.
  // ── ONE TAP, ONE NAVIGATION ───────────────────────────────────────────────
  //
  // COUNTED AS BROWSER TARGETS, NOT AS REQUESTS, AND THAT WAS MEASURED RATHER
  // THAN ASSUMED. The live record's link is external, so the mapper resolves it
  // `target="_blank"` — the tap opens a NEW TAB and this page never navigates
  // at all. Every instrument aimed at this page therefore reads zero and looks
  // like a broken link: no Network request, no Page.frameRequestedNavigation,
  // no Page.navigatedWithinDocument. What actually happens is visible only at
  // the browser level, as a new page target.
  //
  // That is also the right place to count from. The defect this guards against
  // is a nested control firing the inner activation AND the outer one, and two
  // activations of the same `_blank` anchor are TWO tabs. One tab is the pass.
  //
  // The action sits below the fold at 375 (measured: y≈1421 in an 812-tall
  // viewport) and a tap at an off-screen point hits nothing, so the page is
  // scrolled first and the hit box re-read. This is the one harness where
  // moving the page is legitimate — it is not the one measuring that auto-slide
  // leaves scrollY alone.
  await page.eval(() => {
    const card = document.querySelector('[data-fc-slide="active"] [data-fc-card="image"]');
    const span = card?.querySelector('[data-fc-action] > *');
    if (span) {
      const r = span.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top - innerHeight / 2, behavior: 'instant' });
    }
  });
  await page.wait(400);

  const target = await page.eval(() => {
    const card = document.querySelector('[data-fc-slide="active"] [data-fc-card="image"]');
    const span = card?.querySelector('[data-fc-action] > *');
    if (!span) return null;
    const r = span.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             onScreen: r.top >= 0 && r.bottom <= innerHeight,
             href: card.getAttribute('href'), rel: card.getAttribute('rel'),
             newTab: card.getAttribute('target') };
  });
  t.ok(target?.onScreen, 'the action span is scrolled into the viewport',
    target ? JSON.stringify(target) : 'missing');

  if (target) {
    // An external `_blank` must carry noopener, or the opened tab can reach
    // back through window.opener.
    t.ok((target.rel ?? '').includes('noopener'),
      'an external card link carries rel=noopener', target.rel ?? 'none');

    const countTabs = async () => {
      const { targetInfos } = await browser.send('Target.getTargets');
      return targetInfos.filter((i) => i.type === 'page' && i.url.startsWith(target.href)).length;
    };
    const before = await countTabs();
    await page.tap(target.x, target.y);
    await page.wait(2500);
    const after = await countTabs();
    t.eq(after - before, 1, 'tapping the action opens EXACTLY one tab',
      `${before} → ${after}`);
  }
} finally {
  await close();
}

const r = t.report();
process.exit(r.ok ? 0 : 1);
