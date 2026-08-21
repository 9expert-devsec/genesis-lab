/**
 * ROUND 20 — does the framed canvas actually re-base the media queries?
 *
 * Round 18 measured the failure: at a 390px max-width clamp on a wide screen a
 * three-column grid still drew three columns, headings kept their desktop size,
 * and settings.visibility INVERTED. This measures the fix, at the three widths
 * the toggle offers.
 *
 * ── WHY IT IS SERVED FROM THE DEV ORIGIN ──────────────────────────────────
 * The probe page is written into public/ and loaded over http, then deleted.
 * That is not convenience — it is the only arrangement in which the measurement
 * is real: the stylesheet, the font files it @font-face's, and the frame are all
 * same-origin, so nothing is blocked and nothing has to be stubbed. A file://
 * page would load neither the sheet nor the fonts, and the font half of the
 * check is the half most likely to be silently wrong.
 *
 * ── WHAT IS THE REAL THING HERE, AND WHAT IS NOT ──────────────────────────
 * REAL — the compiled stylesheet the app actually serves, the root class list
 *        the app actually sets, SectionRenderer's own SSR output, the frame
 *        widths read from CanvasPanel's exported map, and useCanvasFrame's OWN
 *        syncStylesheets / syncRootClass / injectReset, transformed and run.
 * NOT  — CanvasPanel itself. Its module graph reaches EditorProvider and from
 *        there mongoose, next-auth and cloudinary; bundling that for a browser
 *        is a rabbit hole, and every claim below is about CSS and the frame,
 *        neither of which the component owns.
 *
 * Run (dev server must be up):
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-canvas-frame.mjs
 */
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform } from 'sucrase';

const ROOT = process.cwd();
const ORIGIN = 'http://localhost:3000';
const PROBE_NAME = '_pb-canvas-frame-probe.html';
const PROBE_PATH = path.join(ROOT, 'public', PROBE_NAME);

const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { VIEWPORT_WIDTH } = await import('@/components/pageBuilder/editor/CanvasPanel');

// The hook's own sync functions, transformed for the browser. The react import
// is dropped: the three functions under test touch no React at all, and pulling
// react in would mean bundling it for no reason.
const hookSrc = readFileSync(path.join(ROOT, 'src/components/pageBuilder/editor/useCanvasFrame.js'), 'utf8');
const hookJs = transform(
  hookSrc.replace(/^import \{[^}]*\} from 'react';$/m, '').replace(/^'use client';$/m, ''),
  { transforms: ['jsx'] },
).code.replace(/\bexport (function|const)\b/g, '$1');

// ── the fixture: one of each thing round 18 measured going wrong ──────────

const sec = (id, type, content, settings = {}) => ({
  id, type, content, name: '', enabled: true, sortOrder: 0,
  settings, style: {}, layout: {}, advanced: {},
});
const heading = (id, text) => sec(id, 'heading', { text, level: 'h3', align: 'left' });

const SECTIONS = [
  // The headline case: 3 columns is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
  { ...sec('grid', 'card_grid', {
    children: [heading('g1', 'หนึ่ง'), heading('g2', 'สอง'), heading('g3', 'สาม')],
  }), layout: { columns: 3 } },
  // The inversion case.
  sec('mob', 'heading', { text: 'เฉพาะมือถือ', level: 'h4', align: 'left' }, { visibility: 'mobile_only' }),
  sec('desk', 'heading', { text: 'เฉพาะเดสก์ท็อป', level: 'h4', align: 'left' }, { visibility: 'desktop_only' }),
  // The original ask: does an h1 shrink?  text-3xl -> md:text-4xl
  sec('h1', 'heading', { text: 'หัวเรื่องใหญ่', level: 'h1', align: 'left' }),
];

const markup = SECTIONS.map((s, i) => renderToStaticMarkup(
  createElement(SectionRenderer, { section: s, depth: 0, path: ['sections', i], resolvedData: null }),
)).join('');

// ── the parent document, carrying what the real app carries ───────────────

const home = await (await fetch(`${ORIGIN}/`)).text();
const cssHref = home.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
const htmlClass = home.match(/<html[^>]*class="([^"]*)"/)?.[1];
if (!cssHref || !htmlClass) throw new Error('could not read the app stylesheet / root class from the dev server');

const page = `<!doctype html><html class="${htmlClass}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${cssHref}">
<style>body{margin:0}iframe{border:0;height:600px;display:block;margin-bottom:8px;flex:none}</style>
</head><body>
<div id="frames"></div>
<pre id="out"></pre>
<script>
${hookJs}
const WIDTHS = ${JSON.stringify(VIEWPORT_WIDTH)};
const MARKUP = ${JSON.stringify(markup)};
const results = {};

function build(key, width) {
  const f = document.createElement('iframe');
  f.style.width = width ? width + 'px' : '900px'; // desktop: the column's own width
  document.getElementById('frames').appendChild(f);
  const doc = f.contentDocument;
  // THE PRODUCTION FUNCTIONS, not a re-implementation.
  injectReset(doc);
  syncStylesheets(doc, document);
  syncRootClass(doc, document);
  doc.body.innerHTML = '<div data-pb-canvas>' + MARKUP + '</div>';
  return { f, doc };
}

function measure(key, f, doc) {
  const win = doc.defaultView;
  const grid = doc.querySelector('[data-pb-path="sections.0"] .grid, [data-pb-path="sections.0"] div');
  const gridEl = [...doc.querySelectorAll('[data-pb-path="sections.0"] div')]
    .find((d) => win.getComputedStyle(d).display === 'grid');
  const cols = gridEl ? win.getComputedStyle(gridEl).gridTemplateColumns.split(' ').length : null;
  const mob = doc.querySelector('[data-pb-path="sections.1"]');
  const desk = doc.querySelector('[data-pb-path="sections.2"]');
  const h1 = doc.querySelector('[data-pb-path="sections.3"] h1');
  const vis = (el) => (el ? win.getComputedStyle(el).display !== 'none' : null);
  results[key] = {
    frameInnerWidth: f.contentWindow.innerWidth,
    cardGridColumns: cols,
    mobileOnlyVisible: vis(mob),
    desktopOnlyVisible: vis(desk),
    h1FontSize: h1 ? win.getComputedStyle(h1).fontSize : null,
    h1FontFamily: h1 ? win.getComputedStyle(h1).fontFamily.split(',')[0].trim() : null,
    clonedStylesheets: doc.querySelectorAll('link[data-pb-cloned]').length,
    rootClassMirrored: doc.documentElement.className === document.documentElement.className,
  };
}

const built = {};
for (const [key, width] of Object.entries(WIDTHS)) built[key] = build(key, width);

// A control for the FONT half: the same frame with the root class NOT mirrored.
const bare = document.createElement('iframe');
bare.style.width = '390px';
document.getElementById('frames').appendChild(bare);
injectReset(bare.contentDocument);
syncStylesheets(bare.contentDocument, document);
bare.contentDocument.body.innerHTML = '<div data-pb-canvas>' + MARKUP + '</div>';

// A control for the DARK half: mirror a parent that carries the dark class.
document.documentElement.classList.add('dark');
const dark = document.createElement('iframe');
dark.style.width = '390px';
document.getElementById('frames').appendChild(dark);
injectReset(dark.contentDocument);
syncStylesheets(dark.contentDocument, document);
syncRootClass(dark.contentDocument, document);
dark.contentDocument.body.innerHTML = '<div class="bg-white dark:bg-9e-navy" id="darkprobe">x</div>';
document.documentElement.classList.remove('dark');

// Fonts need a beat to load before getComputedStyle reports the real family.
Promise.all([document.fonts.ready, ...Object.values(built).map((b) => b.doc.fonts.ready)]).then(() => {
  setTimeout(() => {
    for (const [key, b] of Object.entries(built)) measure(key, b.f, b.doc);

    const bareH1 = bare.contentDocument.querySelector('[data-pb-path="sections.3"] h1');
    results.CONTROL_noRootClassMirror = {
      h1FontFamily: bareH1 ? bare.contentWindow.getComputedStyle(bareH1).fontFamily.split(',')[0].trim() : null,
      rootClass: bare.contentDocument.documentElement.className,
    };
    const dp = dark.contentDocument.getElementById('darkprobe');
    results.CONTROL_darkMirrored = {
      rootClass: dark.contentDocument.documentElement.className,
      backgroundColor: dark.contentWindow.getComputedStyle(dp).backgroundColor,
    };

    document.getElementById('out').textContent = JSON.stringify(results, null, 1);
    document.title = 'DONE';
  }, 400);
});
</script></body></html>`;

writeFileSync(PROBE_PATH, page);
try {
  const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
    '--window-size=1400,900', '--virtual-time-budget=15000', '--dump-dom',
    `${ORIGIN}/${PROBE_NAME}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!m || !m[1].trim()) {
    console.log('[probe] the page did not finish — no output');
    process.exit(1);
  }
  console.log(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
} finally {
  // The probe page must never survive the run — public/ is served to the world.
  try { unlinkSync(PROBE_PATH); } catch { /* already gone */ }
}
