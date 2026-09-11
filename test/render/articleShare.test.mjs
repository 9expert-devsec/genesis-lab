import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

import { ArticleDetailClient } from '@/app/(public)/articles/[slug]/_components/ArticleDetailClient';
import { ROOT, readSource } from '../sourceScan.mjs';

/**
 * The article share buttons: on the MOBILE surface a native แชร์ button
 * where the Web Share API is present and a Facebook anchor where it is not;
 * on the DESKTOP surface Facebook / LINE / LinkedIn, always.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * On iOS the Facebook anchor opened the Facebook app, which cannot handle
 * `sharer.php`, so no composer ever appeared. Measured: OG tags and `pageUrl`
 * were correct — not a data bug. Android was fine. The fix swaps the Facebook
 * button for one that calls `navigator.share()` where that exists, and
 * leaves the anchor exactly as it was everywhere else. LINE and LinkedIn are
 * untouched in both cases.
 *
 * ── THE SECOND ROUND: DESKTOP IS NOT A SURFACE WITH THE DEFECT ─────────────
 * `navigator.share` also exists in Safari and Edge on desktop, so the first
 * cut of the fix reached the xl sticky strip and put a sheet button where
 * three labelled buttons belong. The rule is now per SURFACE, not per
 * browser: the pill row (`xl:hidden`) swaps, the strip (`hidden xl:flex`)
 * never does. The split is those two responsive utilities — the same pair
 * that already kept the surfaces from ever being visible together — and no
 * JavaScript viewport logic. The desktop-keeps-Facebook assertion below is
 * what pins this round: without it, a later edit that read `canNativeShare`
 * in the strip would undo it silently.
 *
 * ── TWO TIERS, AND WHY ─────────────────────────────────────────────────────
 * The FALLBACK is asserted here, in-process, under `renderToStaticMarkup`:
 * that is the server render and the pre-hydration paint, and both must carry
 * the three anchors — a crawler and a no-JS reader get nothing else.
 *
 * The NATIVE branch cannot be reached in-process: `canNativeShare` flips in a
 * mount effect whose re-render lands on React's Default lane, which
 * `flushSync` does not flush. So it is driven with `act` in
 * test/articleNativeShare.case.mjs, in its own process, the idiom of
 * test/render/canvasFrameLateAttach and test/render/navSeeAllPosition.
 *
 * ── WHAT THE DRIVE CAN AND CANNOT SAY ──────────────────────────────────────
 * It can say the button exists, what it is labelled, what `share()` received,
 * that `share()` was invoked BEFORE the click's dispatchEvent returned (no
 * await, no promise, nothing asynchronous ahead of it), that a dismissal
 * (AbortError) is silent and opens nothing, and that a real failure is
 * logged. It cannot say Safari grants the sheet — that is a property of the
 * browser, and the synchronous-call check is the closest observable proxy.
 * The xl strip is gated on `showProgress`, which the drive flips with one
 * dispatched scroll event (in jsdom `scrollY > offsetTop - 100` is
 * `0 > -100`), so both surfaces are observed in every run. What the drive
 * cannot say is which surface a real viewport SHOWS — jsdom applies no CSS —
 * so the split itself is pinned on the class strings, and the source guard at
 * the end pins that the strip has no `canNativeShare` read to swap on.
 */

const ARTICLE = {
  _id: 'a1',
  slug: 'hello-world',
  title: 'Hello World',
  content: '<p>สวัสดี</p>',
  tags: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

const CANONICAL = 'https://www.9experttraining.com/articles/hello-world';
const ENC = encodeURIComponent(CANONICAL);

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

function staticShareRow() {
  const html = renderToStaticMarkup(
    createElement(ArticleDetailClient, { article: ARTICLE, related: [], relatedCoursesData: [], minutes: 2 }),
  );
  const doc = new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
  const label = [...doc.querySelectorAll('span')].find((s) => text(s) === 'Share:');
  assert.ok(label, 'the mobile share row is gone');
  return label.parentElement;
}

// ── Fallback — the server render and the pre-hydration paint ────────────────

test('fallback: the three anchors render with the sharer hrefs, Facebook first', () => {
  const row = staticShareRow();
  const anchors = [...row.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), text: text(a) }));
  assert.deepEqual(anchors, [
    { href: `https://www.facebook.com/sharer/sharer.php?u=${ENC}`, text: 'Facebook' },
    { href: `https://social-plugins.line.me/lineit/share?url=${ENC}`, text: 'LINE' },
    { href: `https://www.linkedin.com/sharing/share-offsite/?url=${ENC}`, text: 'LinkedIn' },
  ]);
  for (const a of row.querySelectorAll('a')) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  }
});

test('fallback: no share BUTTON is emitted before the feature-detect has run', () => {
  // The seed is `false` so server and first client paint agree; a button here
  // would be a hydration mismatch waiting for a browser without the API.
  const row = staticShareRow();
  assert.equal(row.querySelectorAll('button').length, 0);
  assert.equal(text(row).includes('แชร์'), false);
});

// ── Native — driven in a child process ──────────────────────────────────────

const CHILD = path.join(ROOT, 'test', 'articleNativeShare.case.mjs');
// NODE_ENV is named, not inherited: under `npm test` it is 'production' from
// before file one, and `act` throws outright in a production React.
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120_000,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

test('the drive ran at all', () => {
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
});

test('native: the Facebook anchor is replaced by a แชร์ button; LINE and LinkedIn stay', () => {
  const r = R.resolves;
  assert.deepEqual(r.buttons, [{ text: 'แชร์', type: 'button' }]);
  assert.deepEqual(r.anchors.map((a) => a.text), ['LINE', 'LinkedIn']);
  assert.equal(r.anchors.some((a) => /facebook\.com/.test(a.href)), false, 'the Facebook anchor is still there');
  // And the label is honest: nothing on the native button says Facebook.
  assert.equal(r.buttons.some((b) => /facebook/i.test(b.text)), false);
});

test('native: share() is called with the title and the LIVE page URL', () => {
  // `pageUrl` swaps to window.location.href on mount — with its query string —
  // and the share must carry that, the same value the LINE/LinkedIn hrefs got.
  const r = R.resolves;
  assert.deepEqual(r.calls, [{
    title: 'Hello World',
    url: 'https://www.9experttraining.com/articles/hello-world?utm_source=test',
  }]);
  assert.match(r.anchors[0].href, /utm_source%3Dtest/, 'LINE did not get the live URL');
});

test('native: share() is invoked SYNCHRONOUSLY from the click — before dispatchEvent returns', () => {
  // Safari grants the share sheet only while the call stack is still the user
  // gesture. An await, a state update or an analytics call ahead of the call
  // would make this false, and Safari would refuse silently — the exact
  // symptom being fixed.
  assert.equal(R.resolves.calledBeforeDispatchReturned, true);
  assert.equal(R.aborts.calledBeforeDispatchReturned, true);
});

test('native: dismissing the sheet (AbortError) is silent and opens nothing', () => {
  const r = R.aborts;
  assert.deepEqual(r.consoleErrors, [], 'a dismissal was reported as an error');
  assert.equal(r.windowOpenCalls, 0, 'a dismissal fell back to opening something');
  assert.equal(r.navigatedAway, false, 'a dismissal navigated away');
});

test('CONTROL: a NON-abort failure IS reported — the abort case is handled specifically', () => {
  // Without this, "no console.error on abort" would also be true of a catch
  // that swallowed everything.
  const r = R.fails;
  assert.equal(r.consoleErrors.length, 1);
  assert.match(r.consoleErrors[0], /navigator\.share failed/);
  assert.equal(r.windowOpenCalls, 0);
});

// ── Desktop strip — the surface that must NOT swap ──────────────────────────

const stripBrands = (r) => r.strip.anchors.map((a) => a.title);

test('desktop: with navigator.share PRESENT the strip keeps its Facebook anchor and has NO native button', () => {
  // THE ASSERTION THAT PINS THIS ROUND. Desktop Safari and Edge have the API;
  // the strip must still be the three labelled buttons it always was.
  const r = R.resolves;
  assert.equal(r.strip.revealed, true, 'the strip never rendered — showProgress did not flip');
  assert.deepEqual(stripBrands(r), ['Share facebook', 'Share line', 'Share linkedin']);
  assert.match(r.strip.anchors[0].href, /^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
  assert.deepEqual(r.strip.buttons, [], 'a native share button reached the desktop strip');
  assert.equal(r.strip.anchors.some((a) => /แชร์/.test(a.text)), false);
});

test('desktop: with navigator.share ABSENT the strip is the same three anchors', () => {
  const r = R.absent;
  assert.equal(r.strip.revealed, true);
  assert.deepEqual(stripBrands(r), ['Share facebook', 'Share line', 'Share linkedin']);
  assert.deepEqual(r.strip.buttons, []);
});

test('desktop: the strip is identical with and without the API — canNativeShare does not reach it', () => {
  assert.deepEqual(R.resolves.strip, R.absent.strip);
  assert.deepEqual(R.aborts.strip, R.absent.strip);
});

test('LINE and LinkedIn are present on BOTH surfaces in all four combinations', () => {
  for (const [name, r] of [['present', R.resolves], ['absent', R.absent]]) {
    const row = r.anchors.map((a) => a.text);
    assert.ok(row.includes('LINE') && row.includes('LinkedIn'), `pill row lost LINE/LinkedIn (API ${name})`);
    const strip = stripBrands(r);
    assert.ok(strip.includes('Share line') && strip.includes('Share linkedin'), `strip lost LINE/LinkedIn (API ${name})`);
  }
});

test('the split is CSS: the pill row is xl:hidden, the strip is hidden xl:flex — one breakpoint, never both', () => {
  // Desktop and mobile are the two containers' responsive utilities, not a
  // resize listener or a viewport state. The same `xl` on both sides is what
  // makes the surfaces complementary at every width.
  const r = R.resolves;
  assert.match(r.rowClass, /(^|\s)xl:hidden(\s|$)/);
  assert.match(r.strip.className, /(^|\s)hidden(\s|$)/);
  assert.match(r.strip.className, /(^|\s)xl:flex(\s|$)/);
});

test('native: with NO navigator.share the mounted page keeps the Facebook anchor', () => {
  // The runtime feature-detect, not only the SSR seed. Same DOM, same
  // effects, no API: three anchors, no button.
  const r = R.absent;
  assert.deepEqual(r.anchors.map((a) => a.text), ['Facebook', 'LINE', 'LinkedIn']);
  assert.deepEqual(r.buttons, []);
  assert.equal(r.calls.length, 0);
});

// ── Source — the rules the drive cannot see ─────────────────────────────────

// `.code`: comments and imports stripped, so the UA-sniff guard cannot be
// tripped (or satisfied) by prose.
const SRC = readSource('src/app/(public)/articles/[slug]/_components/ArticleDetailClient.jsx').code;

test('source: the detection is a feature check, never a user-agent sniff', () => {
  assert.match(SRC, /typeof navigator !== 'undefined' && typeof navigator\.share === 'function'/);
  assert.doesNotMatch(SRC, /userAgent|navigator\.platform|\/iP(hone|ad|od)\//, 'a UA sniff crept in');
});

test('source: canNativeShare is read by the pill row ONLY — the strip has nothing to swap on', () => {
  // The DOM assertions above show the strip did not swap in this run; this
  // pins WHY, so a future read of the state in the strip is a red line here
  // and not a browser-specific surprise. One conditional render, on the pill.
  const reads = SRC.match(/\bcanNativeShare\b/g) ?? [];
  // declaration + the pill row's ternary — nothing else.
  assert.equal(reads.length, 2, `canNativeShare is referenced ${reads.length} times; expected the declaration and one render site`);
  assert.match(SRC, /canNativeShare\s*\?\s*<NativeShareLink onShare=\{handleNativeShare\} \/>\s*:\s*<ShareLink href=\{shareLinks\.facebook\} brand="facebook" label="Facebook" \/>/);
  assert.doesNotMatch(SRC, /NativeShareIcon/, 'a strip-shaped native button is back');
  // The strip's Facebook icon is unconditional. (`readSource().code` turns
  // the JSX comment that sits between the label and the icon into `{ }`.)
  assert.match(SRC, /Share\s*<\/span>\s*(\{\s*\}\s*)?<ShareIcon href=\{shareLinks\.facebook\} brand="facebook" \/>/);
});

test('source: no viewport logic decides the surface — no media query, no width state, no UA', () => {
  // The component does listen to `resize` — for the reading-progress bar,
  // which predates this work — so that listener is not the tell. What would
  // be: a media query, a width comparison, or a hook that turns the viewport
  // into state and then picks a surface from it.
  assert.doesNotMatch(SRC, /matchMedia|innerWidth|useMediaQuery|useViewport|useBreakpoint|isMobile|isDesktop/);
});
