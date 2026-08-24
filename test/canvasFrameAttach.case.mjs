/**
 * The DOM drive behind test/render/canvasFrameLateAttach.test.mjs, in ITS OWN
 * PROCESS. Prints one JSON object on stdout and exits.
 *
 * ── WHY A CHILD PROCESS AND NOT A jsdom BLOCK INSIDE THE TEST ─────────────
 * Measured, not assumed. The first version of this drive lived in the test file
 * and installed `globalThis.document` around an `await act(...)`. The runner
 * drives node:test with `concurrency: true` — files AND the tests inside them —
 * so that window stayed open across other files' module evaluation, and the
 * full suite went from 5 failures to 34: scheduleFilterSheet and heroBannerLinks
 * both render differently when a `document` exists, and the drive file itself
 * contributed ZERO tests, which is what the runner's per-file meta-control
 * caught.
 *
 * test/render/imageNodeViewButton does install these globals in-process, and
 * that is not a contradiction: its window is synchronous and never yields, so
 * nothing else can be scheduled inside it. This drive cannot be — `act` is
 * async by construction.
 *
 * So the globals live in a process that has nothing else in it. Same idiom as
 * test/reportSuiteChild.mjs, which exists for the same reason: a thing that can
 * only be observed by changing the process is observed in a process that can be
 * changed.
 *
 * ── WHAT IT DRIVES ────────────────────────────────────────────────────────
 * A host shaped like CanvasPanel — the iframe exists only when there is
 * something to draw, and the content is portalled into the frame's body —
 * through a sequence of `show` values, with TWO hooks: the current
 * `useCanvasFrame`, and `useLegacyCanvasFrame` below, which is the hook exactly
 * as it was before round 45. The claim under test is that they DISAGREE about a
 * frame that mounts late, and the legacy one is here to make that claim
 * falsifiable rather than to stand in for anything.
 *
 * Not a test file. `.case.mjs`, so neither the runner's manifest nor its
 * discovery guard picks it up.
 *
 * Run standalone:  node test/canvasFrameAttach.case.mjs
 */
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

// Registered here rather than through an --import flag so the child is
// self-contained: the app modules are reached by dynamic import BELOW, which is
// after this call and therefore sees the hook.
register(new URL('./loader.mjs', import.meta.url));

const { createElement: h, useRef, useEffect, useState, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createPortal } = await import('react-dom');
const { useCanvasFrame } = await import('@/components/pageBuilder/editor/useCanvasFrame');

/** The hook exactly as it was before round 45 — the control, not a stand-in. */
function useLegacyCanvasFrame() {
  const frameRef = useRef(null);
  const [frameDoc, setFrameDoc] = useState(null);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      setFrameDoc(doc);
    };
    attach();
    frame.addEventListener('load', attach);
    return () => frame.removeEventListener('load', attach);
  }, []);
  return { frameRef, frameDoc };
}

/**
 * CanvasPanel's shape, reduced to the part under test: no iframe at all while
 * there is nothing to draw, and the canvas portalled in once there is.
 */
function makeHost(useFrame) {
  return function Host({ show }) {
    const { frameRef, frameDoc } = useFrame();
    if (!show) return h('p', null, 'หน้านี้ยังว่างอยู่');
    return h(
      'div',
      null,
      h('iframe', { ref: frameRef, title: 'ตัวอย่างหน้าเว็บ' }),
      frameDoc ? createPortal(h('div', { 'data-pb-canvas': '' }, 'เนื้อหา'), frameDoc.body) : null
    );
  };
}

async function drive(useFrame, steps) {
  const dom = new JSDOM(
    '<!doctype html><html class="root-class"><head></head><body><div id="r"></div></body></html>',
    { url: 'http://localhost:3000/admin/pages/builder/1/edit', pretendToBeVisual: true }
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // Node defines `navigator` as a getter-only global, so it is redefined.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator, configurable: true, writable: true,
  });
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const Host = makeHost(useFrame);
  const container = dom.window.document.getElementById('r');
  const root = createRoot(container);
  for (const show of steps) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { root.render(h(Host, { show })); });
  }
  const frame = container.querySelector('iframe');
  const doc = frame ? frame.contentDocument : null;
  const out = {
    iframeMounted: Boolean(frame),
    canvasInFrame: Boolean(doc && doc.body.innerHTML.includes('data-pb-canvas')),
    textInFrame: doc ? doc.body.textContent : '',
  };
  await act(async () => { root.unmount(); });
  return out;
}

const results = {
  firstRender: await drive(useCanvasFrame, [true]),
  lateMount: await drive(useCanvasFrame, [false, true]),
  goneAndBack: await drive(useCanvasFrame, [true, false, true]),
  legacyFirstRender: await drive(useLegacyCanvasFrame, [true]),
  legacyLateMount: await drive(useLegacyCanvasFrame, [false, true]),
};

process.stdout.write(JSON.stringify(results));
