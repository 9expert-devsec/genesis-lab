/**
 * The DOM drive behind test/render/articleShare.test.mjs, in ITS OWN PROCESS.
 * Prints one JSON object on stdout and exits.
 *
 * ── WHY A CHILD PROCESS ───────────────────────────────────────────────────
 * Same idiom, same reason as test/canvasFrameAttach.case.mjs and
 * test/navSeeAllPosition.case.mjs. The article's `canNativeShare` flips in a
 * mount effect, and the re-render that flip schedules lands on React's
 * Default lane, which `flushSync` never reaches — so an in-process
 * synchronous mount only ever sees the Facebook anchor. Reaching the แชร์
 * button needs `act`, `act` needs a development React, and the suite pins
 * NODE_ENV=production before the loader is registered.
 *
 * ── WHAT IT DRIVES ────────────────────────────────────────────────────────
 * ArticleDetailClient mounted in a JSDOM whose `navigator.share` is a
 * recording stub, four times:
 *
 *   resolves   share() resolves. Records WHEN it was called relative to the
 *              click's dispatchEvent — `calledBeforeDispatchReturned` is the
 *              claim that nothing asynchronous sits between the gesture and
 *              the call, which is the property Safari enforces.
 *   aborts     share() rejects with AbortError (the reader dismissed the
 *              sheet). Records what reached console.error and whether any
 *              navigation was attempted.
 *   fails      share() rejects with a non-abort error. Records the same, so
 *              the abort case can be shown to be handled SPECIFICALLY.
 *   absent     no `navigator.share` at all. The mounted, effect-run page must
 *              still show the Facebook anchor — the fallback is a runtime
 *              decision, not only the SSR seed.
 *
 * BOTH surfaces are read: the mobile pill row (`xl:hidden`) and the xl
 * sticky strip (`hidden xl:flex`). The strip is gated on `showProgress`,
 * set from `window.scrollY > content.offsetTop - 100` on scroll — in jsdom
 * that is `0 > -100`, so one dispatched scroll event reveals it with no
 * layout. Each surface is reported separately because the rule differs:
 * the pill row swaps Facebook for the sheet, the strip never does.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  NODE_ENV=development node test/articleNativeShare.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ArticleDetailClient } = await import('@/app/(public)/articles/[slug]/_components/ArticleDetailClient');

const ARTICLE = {
  _id: 'a1',
  slug: 'hello-world',
  title: 'Hello World',
  content: '<p>สวัสดี</p>',
  tags: [],
  created_at: '2026-09-01T00:00:00.000Z',
};

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

/** The mobile pill row — the parent of the "Share:" label. */
function shareRow(doc) {
  const label = [...doc.querySelectorAll('span')].find((s) => text(s) === 'Share:');
  return label ? label.parentElement : null;
}
/** The xl sticky strip — the parent of its vertical "Share" label. */
function shareStrip(doc) {
  const label = [...doc.querySelectorAll('span')].find((s) => text(s) === 'Share');
  return label ? label.parentElement : null;
}
const anchorsOf = (scope) =>
  scope ? [...scope.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), text: text(a), title: a.getAttribute('title') })) : [];
const buttonsOf = (scope) =>
  scope ? [...scope.querySelectorAll('button')].map((b) => ({ text: text(b), type: b.getAttribute('type'), title: b.getAttribute('title') })) : [];

async function drive(outcome) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://www.9experttraining.com/articles/hello-world?utm_source=test',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.HTMLElement = win.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const calls = [];
  let settle;
  const share = (data) => {
    calls.push({ ...data, at: 'share' });
    return new Promise((resolve, reject) => {
      settle = () => {
        if (outcome === 'resolves') resolve();
        else if (outcome === 'aborts') reject(Object.assign(new Error('Share canceled'), { name: 'AbortError' }));
        else reject(Object.assign(new Error('Share failed'), { name: 'NotAllowedError' }));
      };
    });
  };
  // Node defines `navigator` as a getter-only global, so it is redefined —
  // as jsdom's navigator with `share` grafted on, the way iOS Safari has it.
  // 'absent' models a browser without the API: the runtime feature-detect,
  // not just the SSR seed, must keep the Facebook anchor.
  if (outcome !== 'absent') {
    Object.defineProperty(win.navigator, 'share', { value: share, configurable: true });
  }
  Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true });

  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  const opened = [];
  win.open = (...args) => { opened.push(args); return null; };

  const root = createRoot(win.document.getElementById('root'));
  await act(async () => {
    root.render(h(ArticleDetailClient, { article: ARTICLE, related: [], relatedCoursesData: [], minutes: 2 }));
  });

  // Reveal the strip: `showProgress` flips on the first scroll tick.
  await act(async () => { win.dispatchEvent(new win.Event('scroll')); });

  const row = shareRow(win.document);
  const strip = shareStrip(win.document);
  const anchors = anchorsOf(row).map(({ title, ...a }) => a);
  const buttons = buttonsOf(row).map(({ title, ...b }) => b);
  const shareBtn = row ? [...row.querySelectorAll('button')].find((b) => text(b) === 'แชร์') : null;

  let calledBeforeDispatchReturned = false;
  if (shareBtn) {
    // The click is dispatched OUTSIDE act on purpose: act would flush work
    // after the handler, and the claim is about what happened DURING it.
    shareBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    calledBeforeDispatchReturned = calls.length === 1;
    if (settle) settle();
    // Let the promise chain (.catch) run before reading console.error.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }

  const hrefAfter = win.location.href;
  await act(async () => { root.unmount(); });
  console.error = origError;

  return {
    // Mobile pill row (`xl:hidden`).
    anchors,
    buttons,
    rowClass: row ? row.getAttribute('class') : null,
    // Desktop strip (`hidden xl:flex`).
    strip: {
      revealed: Boolean(strip),
      anchors: anchorsOf(strip),
      buttons: buttonsOf(strip),
      className: strip ? strip.getAttribute('class') : null,
    },
    calls: calls.map(({ at, ...rest }) => rest),
    calledBeforeDispatchReturned,
    consoleErrors: errors,
    windowOpenCalls: opened.length,
    navigatedAway: hrefAfter !== 'https://www.9experttraining.com/articles/hello-world?utm_source=test',
  };
}

const results = {
  resolves: await drive('resolves'),
  aborts: await drive('aborts'),
  fails: await drive('fails'),
  absent: await drive('absent'),
};
process.stdout.write(JSON.stringify(results));
