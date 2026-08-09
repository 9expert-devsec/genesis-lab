import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FloatingActionDockView } from '@/components/ui/FloatingActionDock';
import { ReadingProgressRing } from '@/components/ui/ReadingProgressRing';
import {
  READING_PROGRESS_ANCHOR_ID,
  computeReadingProgress,
  findOrWatchAnchor,
  isReadingProgressRoute,
} from '@/lib/readingProgress';
import { readSourceForScanning } from '../sourceScan.mjs';

// The reading-progress ring, moved out of ArticleDetailClient into the dock's
// top slot.
//
// ── THE COST THIS FILE EXISTS TO COVER ──────────────────────────────────────
// Inside the article the ring read its subject through a React ref, and the
// coupling could not break. From the dock it finds the subject by id, and a
// completely different file renders that id. Nothing at build time connects
// those two facts: rename either and the ring does not throw, does not warn,
// and does not appear — it silently stops existing, on a page nobody checks,
// because it is decorative. The both-ends test below is the replacement for
// the coupling the ref version had for free.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel) => readSourceForScanning(path.join(ROOT, rel), { stripImports: false });

const RING = src('src/components/ui/ReadingProgressRing.jsx');
const LIB = src('src/lib/readingProgress.js');
const ARTICLE = src('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx');

const dock = (props) =>
  renderToStaticMarkup(createElement(FloatingActionDockView, { pathname: '/', ...props }));

// ── The anchor, guarded at BOTH ends ────────────────────────────────────────

test('the id the ring queries is the id the article renders', () => {
  // Neither file may hold the literal — that is what makes a rename impossible
  // to do on one side only.
  // The lookup moved into src/lib/readingProgress.js with the route gate, so
  // the claim is made against the file that now performs it. Same claim,
  // different owner.
  assert.match(LIB, /READING_PROGRESS_ANCHOR_ID/, 'the finder uses the shared constant');
  assert.match(LIB, /getElementById\(READING_PROGRESS_ANCHOR_ID\)/, 'the lookup goes by the constant, not a string');
  assert.match(ARTICLE, /id=\{READING_PROGRESS_ANCHOR_ID\}/, 'the article renders the shared constant');

  // readingProgress.js is DELIBERATELY not in this loop: it is the file that
  // declares the constant, so of course it holds the literal. What must not
  // hold one is every CONSUMER — that is what makes a one-sided rename
  // impossible rather than merely discouraged.
  assert.equal(
    (LIB.match(/article-reading-body/g) ?? []).length,
    1,
    'the id is written down exactly once, in the module that exports it',
  );
  for (const [file, code] of [['ReadingProgressRing.jsx', RING], ['ArticleDetailClient.jsx', ARTICLE]]) {
    assert.ok(
      !code.includes(`'${READING_PROGRESS_ANCHOR_ID}'`) &&
        !code.includes(`"${READING_PROGRESS_ANCHOR_ID}"`),
      `${file} holds the anchor id as a LITERAL. One constant, two files, no copies — ` +
      'otherwise a rename on one side silently unhooks the ring.',
    );
  }
});

test('CONTROL: changing one side only is what this guard has to catch', () => {
  // Demonstrated on the predicate, because the real defect cannot be staged
  // here without editing two files. Both sides must resolve to ONE value.
  const agree = (queried, rendered) => queried === rendered;
  assert.equal(agree('article-reading-body', 'article-reading-body'), true);
  assert.equal(agree('article-reading-body', 'article-body'), false, 'a one-sided rename fails');
  // …and the shared constant is a single non-empty source for both.
  assert.equal(typeof READING_PROGRESS_ANCHOR_ID, 'string');
  assert.ok(READING_PROGRESS_ANCHOR_ID.length > 0);
});

// ── Nothing, never zero ─────────────────────────────────────────────────────

test('with no anchor in the DOM the ring renders NOTHING, not 0%', () => {
  // A ring frozen at zero reads as a broken feature, and would do so on every
  // non-article page on the site. An absent ring reads as "this page has no
  // progress indicator", which is true.
  assert.match(RING, /if \(!anchor \|\| !started\) return null;/, 'it bails before rendering');
  // renderToStaticMarkup runs no effects, so the anchor lookup never resolves —
  // which IS the no-anchor case, exactly as it occurs on every non-article page.
  const html = renderToStaticMarkup(createElement(ReadingProgressRing));
  assert.equal(html, '', 'no anchor found → nothing rendered at all');
  assert.ok(!html.includes('0%'), 'and certainly not a ring stuck at zero');
});

test('the late-arriving anchor is observed for, not given up on', () => {
  // The article body is injected with dangerouslySetInnerHTML and this
  // component mounts from the root layout, so on a cold navigation the ring can
  // mount first. A one-shot lookup would miss it permanently.
  // The observer moved into the lib alongside the route gate — the two decisions
  // belong together, and keeping them apart is what let the observer start
  // everywhere. Claims carried, owner changed.
  assert.match(LIB, /new ObserverCtor\(/, 'it waits for the anchor to appear');
  assert.match(LIB, /observer\.disconnect\(\)/, 'and stops watching once it has it');
  assert.match(RING, /\}, \[pathname\]\)/, 'the lookup restarts on client-side navigation');
});

// ── The empty top slot must not leave a gap ─────────────────────────────────

test('an empty top slot is byte-identical to no top slot at all', () => {
  // `gap-3` applies BETWEEN flex items, so a slot that renders null must
  // produce no item. Verified in the rendered markup rather than assumed to
  // inherit bottomSlot's behaviour.
  const withNull = dock({ topSlot: null, bottomSlot: null });
  const without = dock({ bottomSlot: null });
  assert.equal(withNull, without, 'a null top slot adds nothing to the DOM');
  assert.ok(withNull.includes('data-floating-dock'), 'and the dock itself still renders');
});

test('a filled top slot renders FIRST, above the other slots', () => {
  const html = dock({
    topSlot: createElement('i', { 'data-top': '' }),
    bottomSlot: createElement('i', { 'data-bottom': '' }),
  });
  const top = html.indexOf('data-top');
  const bottom = html.indexOf('data-bottom');
  assert.ok(top !== -1 && bottom !== -1, 'both slots rendered');
  assert.ok(top < bottom, 'top slot comes first in the DOM, so it paints above');
});

test('the dock ships the pass-through opt-out the ring depends on', () => {
  const tag = dock({ topSlot: null, bottomSlot: null }).match(/<div[^>]*data-floating-dock[^>]*>/)[0];
  // ESCAPED FORM. React escapes `&` and `>` in attribute values, so this class —
  // the most escape-prone one in the codebase, with &, > AND nested brackets —
  // reaches the markup as `[&amp;&gt;[data-dock-passthrough]]:...`. The source
  // form does not appear and must not be matched for.
  assert.match(tag, /\[&amp;&gt;\[data-dock-passthrough\]\]:pointer-events-none/);
  assert.match(tag, /\[&amp;&gt;\*\]:pointer-events-auto/);
  assert.ok(!tag.includes('[&>['), 'the raw source form is NOT in rendered markup');
  assert.ok(!tag.includes('[&>*]'), 'nor for the universal-child rule');
});

// ── The arithmetic ──────────────────────────────────────────────────────────

test('progress is clamped, and a short article reports zero rather than nonsense', () => {
  const base = { contentTop: 500, contentHeight: 3000, viewportHeight: 800 };
  assert.equal(computeReadingProgress({ ...base, scrollY: 500 }).pct, 0, 'at the top of the body');
  assert.equal(computeReadingProgress({ ...base, scrollY: 1600 }).pct, 50, 'halfway');
  assert.equal(computeReadingProgress({ ...base, scrollY: 2700 }).pct, 100, 'at the end');
  assert.equal(computeReadingProgress({ ...base, scrollY: 99999 }).pct, 100, 'clamped past the end');
  assert.equal(computeReadingProgress({ ...base, scrollY: 0 }).pct, 0, 'clamped above the start');
  // Shorter than the viewport: nothing to scroll through.
  assert.equal(
    computeReadingProgress({ contentTop: 100, contentHeight: 400, viewportHeight: 800, scrollY: 200 }).pct,
    0,
  );
});

test('`started` is what hides the ring before the reader reaches the body', () => {
  const base = { contentTop: 500, contentHeight: 3000, viewportHeight: 800 };
  assert.equal(computeReadingProgress({ ...base, scrollY: 0 }).started, false, 'at the page top');
  assert.equal(computeReadingProgress({ ...base, scrollY: 399 }).started, false, 'just short of the lead-in');
  assert.equal(computeReadingProgress({ ...base, scrollY: 401 }).started, true, 'past it');
});

// ── The observer must not start where the anchor cannot appear ──────────────
// The ring mounts from the ROOT layout, so it exists on every page. An observer
// on document.body with subtree:true, started on a page where the anchor never
// lands, watches for the whole life of that page — and the landing page
// auto-advances a hero carousel while the chat panel animates a typing
// indicator, so every frame of both wakes a callback that can never succeed.
//
// This is COUNTED, not read off the source: the constructor is injected and the
// test asserts how many times it was called.

function fakeDoc({ hasAnchor = false } = {}) {
  const el = { id: READING_PROGRESS_ANCHOR_ID };
  return {
    body: { nodeName: 'BODY' },
    getElementById: (id) => (hasAnchor && id === READING_PROGRESS_ANCHOR_ID ? el : null),
    _el: el,
  };
}

function countingObserver() {
  const calls = { constructed: 0, observed: 0, disconnected: 0 };
  class Ctor {
    constructor(cb) { calls.constructed += 1; this.cb = cb; }
    observe() { calls.observed += 1; }
    disconnect() { calls.disconnected += 1; }
  }
  return { Ctor, calls };
}

test('no observer is constructed on a route where the anchor cannot appear', () => {
  for (const pathname of ['/', '/promotions', '/articles', '/contact-us', '/schedule', '/search']) {
    const { Ctor, calls } = countingObserver();
    let found = null;
    const cleanup = findOrWatchAnchor({
      pathname, doc: fakeDoc(), ObserverCtor: Ctor, onFound: (el) => { found = el; },
    });
    assert.equal(calls.constructed, 0, `an observer was started on ${pathname}`);
    assert.equal(calls.observed, 0, `and it began observing on ${pathname}`);
    assert.equal(found, null, 'nothing was reported found');
    assert.equal(typeof cleanup, 'function', 'a cleanup is always returned, so callers never branch');
    cleanup();
  }
  // /articles is the INDEX — no body to measure. The trailing segment is what
  // distinguishes it from a detail page.
  assert.equal(isReadingProgressRoute('/articles'), false);
  assert.equal(isReadingProgressRoute('/articles/some-slug'), true);
});

test('CONTROL: on an article WITHOUT the anchor yet, an observer IS started', () => {
  // Otherwise "zero observers" would pass for a function that never observes at
  // all, and the late-hydration case would be silently broken.
  const { Ctor, calls } = countingObserver();
  const cleanup = findOrWatchAnchor({
    pathname: '/articles/a-slug', doc: fakeDoc({ hasAnchor: false }), ObserverCtor: Ctor, onFound() {},
  });
  assert.equal(calls.constructed, 1, 'exactly one observer');
  assert.equal(calls.observed, 1, 'and it is observing');
  cleanup();
  assert.equal(calls.disconnected, 1, 'cleanup disconnects it');
});

test('on an article WITH the anchor already present, no observer is needed', () => {
  const { Ctor, calls } = countingObserver();
  let found = null;
  findOrWatchAnchor({
    pathname: '/articles/a-slug',
    doc: fakeDoc({ hasAnchor: true }),
    ObserverCtor: Ctor,
    onFound: (el) => { found = el; },
  });
  assert.equal(calls.constructed, 0, 'the synchronous lookup succeeded — nothing to watch for');
  assert.ok(found, 'and the anchor was reported');
});

test('the ring reads the route gate, it does not re-implement one', () => {
  // One segment-aware matcher in this repo, not two — same ruling as the dock's
  // two exclusion lists.
  assert.match(LIB, /matchesRoutePattern/, 'it uses the shared matcher');
  assert.ok(!/startsWith\(/.test(LIB), 'and does not hand-roll a prefix test');
  assert.match(RING, /findOrWatchAnchor\(/, 'the component delegates the whole decision');
  assert.ok(!/new MutationObserver/.test(RING), 'the component constructs no observer itself');
});
