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
 * The article share row: a Facebook anchor where the Web Share API is absent,
 * a native แชร์ button where it is present.
 *
 * ── THE DEFECT ─────────────────────────────────────────────────────────────
 * On iOS the Facebook anchor opened the Facebook app, which cannot handle
 * `sharer.php`, so no composer ever appeared. Measured: OG tags and `pageUrl`
 * were correct — not a data bug. Android was fine. The fix swaps the Facebook
 * button for one that calls `navigator.share()` wherever that exists, and
 * leaves the anchor exactly as it was everywhere else. LINE and LinkedIn are
 * untouched in both cases.
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
 * It also does not exercise the xl sticky strip, which is gated on a scroll
 * the drive does not perform; that strip takes the same `canNativeShare`
 * and the same handler, and is covered by the source assertion at the end.
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

test('source: both share surfaces take the swap — the xl strip the drive cannot scroll to', () => {
  // The sticky strip renders behind `showProgress`; the drive never scrolls,
  // so the pill row is what it observed. This pins that the strip made the
  // same choice from the same state, rather than keeping a Facebook icon.
  assert.match(SRC, /canNativeShare\s*\?\s*<NativeShareIcon onShare=\{handleNativeShare\} \/>\s*:\s*<ShareIcon href=\{shareLinks\.facebook\} brand="facebook" \/>/);
  assert.match(SRC, /canNativeShare\s*\?\s*<NativeShareLink onShare=\{handleNativeShare\} \/>\s*:\s*<ShareLink href=\{shareLinks\.facebook\} brand="facebook" label="Facebook" \/>/);
});
