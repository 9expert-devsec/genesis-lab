/**
 * ROUND 19 — does the canvas actually survive being portalled into an iframe?
 *
 * The whole cost estimate for route 2 turns on one question that is usually
 * answered from folklore: React delegates its events at the root container, so
 * "React events don't work inside an iframe". That is TRUE of a second
 * createRoot and FALSE of a portal — react-dom 18.3.1 calls
 * `preparePortalMount(portalInstance) → listenToAllSupportedEvents(portalInstance)`,
 * attaching the full delegated set to the portal container itself, wherever it
 * lives.
 *
 * Reading that in the source is evidence. Running it is proof, and the
 * difference decides whether CanvasPanel's two handlers are a one-line change
 * or a postMessage protocol. So this drives real Chrome with the repo's own
 * react/react-dom UMD builds and dispatches real events.
 *
 * It also measures the PAYOFF claim in the same run: does a media query inside
 * the frame resolve against the FRAME's width rather than the window's? That is
 * the entire point of route 2, and it has never been checked here.
 *
 * Not a test — a probe. Run:
 *   node scripts/_probe-iframe-portal.mjs
 */
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const react = readFileSync(path.join(ROOT, 'node_modules/react/umd/react.development.js'), 'utf8');
const reactDom = readFileSync(path.join(ROOT, 'node_modules/react-dom/umd/react-dom.development.js'), 'utf8');

// No JSX — createElement directly, so nothing has to be transformed.
const app = `
const { createElement: h, useState, useCallback } = React;
const { createRoot, createPortal } = ReactDOM;
const log = [];
const record = (k, v) => log.push(k + '=' + JSON.stringify(v));

const iframe = document.createElement('iframe');
iframe.style.width = '390px';
iframe.style.height = '400px';
iframe.style.border = '0';
document.body.appendChild(iframe);
const idoc = iframe.contentDocument;

record('iframe.sameOriginDocumentReachable', Boolean(idoc && idoc.body));

// A parent-document capture listener, exactly like useLeaveGuard's.
let parentSawClick = false;
document.addEventListener('click', () => { parentSawClick = true; }, true);

// The canvas, as CanvasPanel builds it: a click-capture + mouseover div, a
// <style> carrying the selection rule, a data-pb-path section, and a real <a>
// (the thing CanvasPanel preventDefaults so the editor is never navigated away).
let clickFired = 0, closestFound = null, mouseOverFired = 0, hoverFound = null, defaultPrevented = null;

function Canvas() {
  const onClickCapture = useCallback((e) => {
    clickFired++;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target && e.target.closest && e.target.closest('[data-pb-path]');
    closestFound = el ? el.dataset.pbPath : null;
    defaultPrevented = e.defaultPrevented;
  }, []);
  const onMouseOver = useCallback((e) => {
    mouseOverFired++;
    const el = e.target && e.target.closest && e.target.closest('[data-pb-path]');
    hoverFound = el ? el.dataset.pbPath : null;
  }, []);
  return h('div', { 'data-pb-canvas': '', onClickCapture, onMouseOver },
    h('style', { dangerouslySetInnerHTML: { __html:
      '[data-pb-path="sections.0"]{outline:2px solid #005CFF}' +
      '#probe-box{width:100px}' +
      '@media (min-width:768px){#probe-box{width:300px}}' } }),
    h('section', { 'data-pb-path': 'sections.0' },
      h('div', { id: 'probe-box' }),
      h('a', { href: 'https://example.com/nav', id: 'probe-link' }, 'link'),
    ),
  );
}

// ONE React root, in the PARENT document, portalling into the frame — the
// arrangement that keeps useEditor()/dispatch in scope with no message passing.
const host = document.createElement('div');
document.body.appendChild(host);
createRoot(host).render(h(function App() { return createPortal(h(Canvas), idoc.body); }));

setTimeout(() => {
  const link = idoc.getElementById('probe-link');
  const box = idoc.getElementById('probe-box');

  record('portalRenderedIntoFrame', Boolean(link && box));
  record('styleTagLandedInFrame', idoc.querySelectorAll('style').length);

  // 1. Does a real click inside the frame reach React's synthetic handler?
  link.dispatchEvent(new iframe.contentWindow.MouseEvent('click', { bubbles: true, cancelable: true, view: iframe.contentWindow }));
  record('reactClickCaptureFired', clickFired);
  record('closestResolvedPath', closestFound);
  record('preventDefaultTook', defaultPrevented);

  // 2. Hover, same question.
  link.dispatchEvent(new iframe.contentWindow.MouseEvent('mouseover', { bubbles: true, view: iframe.contentWindow }));
  record('reactMouseOverFired', mouseOverFired);
  record('hoverResolvedPath', hoverFound);

  // 3. Does the PARENT's document-capture listener see it? (useLeaveGuard's)
  record('parentDocumentCaptureSawFrameClick', parentSawClick);

  // 4. THE PAYOFF: does the media query ask the FRAME or the WINDOW?
  //    Frame is 390px; window is 1400px. min-width:768px must NOT apply.
  record('windowInnerWidth', window.innerWidth);
  record('frameInnerWidth', iframe.contentWindow.innerWidth);
  record('probeBoxWidthInFrame', idoc.defaultView.getComputedStyle(box).width);
  record('mediaQueryFollowsFrame', idoc.defaultView.getComputedStyle(box).width === '100px');

  // 5. Same rule, same page, OUTSIDE the frame — the control. The clamp today
  //    is a max-width div in the parent document, so this is what it gets.
  const outer = document.createElement('div');
  outer.style.maxWidth = '390px';
  outer.innerHTML = '<div id="outer-box"></div>';
  const st = document.createElement('style');
  st.textContent = '#outer-box{width:100px}@media (min-width:768px){#outer-box{width:300px}}';
  document.head.appendChild(st);
  document.body.appendChild(outer);
  record('probeBoxWidthUnderMaxWidthClamp', getComputedStyle(document.getElementById('outer-box')).width);

  document.title = 'DONE';
  const out = document.createElement('pre');
  out.id = 'out';
  out.textContent = log.join('\\n');
  document.body.appendChild(out);
}, 300);
`;

const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>${react}</script>
<script>${reactDom}</script>
<script>${app}</script>
</body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'iframeprobe-'));
const file = path.join(dir, 'probe.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  '--window-size=1400,900', '--force-device-scale-factor=1',
  '--virtual-time-budget=8000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) {
  console.log('[probe] the page did not finish — no output block');
  process.exit(1);
}
console.log(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
console.log('\n[probe] html at', file);
