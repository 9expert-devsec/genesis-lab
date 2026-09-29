/**
 * The DOM drive behind test/render/metaPixelConsentGate.test.mjs, in ITS OWN
 * PROCESS. Takes a scenario name on argv, prints one JSON object on stdout.
 *
 * ── WHY A CHILD PROCESS ───────────────────────────────────────────────────
 * Same reason as test/canvasFrameAttach.case.mjs, which this follows: the
 * claim is about EFFECTS — a cookie read on mount, a window event arriving
 * later — so it needs a real DOM and a real commit, which `renderToStaticMarkup`
 * gives neither of. Installing `globalThis.document` in the runner's process
 * is not available: it drives node:test with `concurrency: true`, so the
 * window would stay open across other files' module evaluation.
 *
 * ── WHY ONE SCENARIO PER PROCESS, AND NOT A LOOP ──────────────────────────
 * src/lib/analytics/metaPixel.js holds MODULE state — `initialised` is a
 * once-per-document fact, because a pixel is a once-per-document thing. A
 * second scenario in the same process would inherit an already-initialised
 * pixel, and "renders nothing when consent is absent" would then be measuring
 * a module that had already loaded one. Exporting a reset for the tests to
 * call would make the production module carry a door that exists only for
 * this file. A fresh process is the honest reset.
 *
 * ── WHAT IS OBSERVED ──────────────────────────────────────────────────────
 *   scripts   every <script src> in the container. The pixel's one REQUEST to
 *             connect.facebook.net is this element and nothing else, so an
 *             empty list is the whole "requests nothing" claim.
 *   fbq       window.fbq.queue, verbatim. fbevents.js never arrives in JSDOM,
 *             so the stub's queue holds every command in order — which is
 *             literally what the real library would drain on arrival. Reading
 *             the queue is therefore not a stand-in for observing the calls;
 *             it IS the calls.
 *   fbqExists whether the stub was installed at all.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  node test/metaPixelConsentGate.case.mjs granted
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { MetaPixel } = await import('@/components/analytics/MetaPixel');
const { MetaPixelPageTracker } = await import('@/components/analytics/MetaPixelPageTracker');
const { CONSENT_COOKIE } = await import('@/lib/cookieConsentStore');
const { CONSENT_DECISION_EVENT } = await import('@/lib/consentBroadcast');

const scenario = process.argv[2];

/** The cookie exactly as writeConsentCookie would leave it — v1, all keys. */
function consentCookie(marketing) {
  const value = JSON.stringify({
    v: 1,
    categories: { analytics: true, functional: true, marketing },
    ts: '2026-09-29T00:00:00.000Z',
  });
  return `${CONSENT_COOKIE}=${encodeURIComponent(value)}`;
}

const dom = new JSDOM('<!doctype html><body><div id="r"></div></body>', {
  url: 'http://localhost:3000/masterclass',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator, configurable: true, writable: true,
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

if (scenario === 'granted') dom.window.document.cookie = consentCookie(true);
if (scenario === 'declined') dom.window.document.cookie = consentCookie(false);
// 'absent', 'broadcastGrant' and 'broadcastRevoke' start with no cookie at all.
if (scenario === 'broadcastRevoke') dom.window.document.cookie = consentCookie(true);

const container = dom.window.document.getElementById('r');
const root = createRoot(container);

/** Both components together, because their effect ORDER is part of the claim. */
const Tree = () => h('div', null, h(MetaPixel), h(MetaPixelPageTracker));

await act(async () => { root.render(h(Tree)); });

/** Snapshot before any broadcast, so a scenario can assert both halves. */
const observe = () => ({
  scripts: [...container.querySelectorAll('script')].map((s) => s.getAttribute('src')),
  fbqExists: typeof dom.window.fbq === 'function',
  fbq: dom.window.fbq && dom.window.fbq.queue
    ? [...dom.window.fbq.queue].map((args) => [...args])
    : [],
});

const before = observe();

if (scenario === 'broadcastGrant' || scenario === 'broadcastRevoke') {
  const marketing = scenario === 'broadcastGrant';
  await act(async () => {
    dom.window.dispatchEvent(
      new dom.window.CustomEvent(CONSENT_DECISION_EVENT, {
        detail: { analytics: true, functional: true, marketing },
      }),
    );
  });
}

const after = observe();

await act(async () => { root.unmount(); });

process.stdout.write(JSON.stringify({ scenario, before, after }));
