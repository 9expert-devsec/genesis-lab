/**
 * ROUND 17 ITEM I — measure the REAL structure-panel row in a REAL browser.
 *
 * Round 16 reported "roughly 96px left for the label" and said plainly that it
 * was arithmetic, not a measurement. This replaces the arithmetic.
 *
 * What is real here, and what is not:
 *   REAL — the StructurePanel component itself (SSR'd through EditorProvider,
 *          exactly as test/render/structureRowLines.test.mjs renders it), the
 *          Tailwind stylesheet compiled from the app's own config and content
 *          globs, the 260px grid column and Panel padding lifted from
 *          EditorShell.jsx, and Chrome's own flex layout.
 *   NOT   — the authenticated /admin route (NextAuth-guarded; a headless
 *          session is not mintable here) and the LINE Seed Sans TH webfont.
 *          Neither affects the number asked for: the label's width is set by
 *          flex distribution over fixed-size siblings, not by glyph metrics.
 *
 * Not a test — a probe. Run: node --import ./scripts/_probe-panel-register.mjs \
 *   scripts/_probe-panel-width.mjs
 */
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = process.cwd();

const { EditorProvider } = await import('@/components/pageBuilder/editor/EditorProvider');
const { StructurePanel } = await import('@/components/pageBuilder/editor/StructurePanel');

const PAGE = {
  slug: 's', title: 'T', pageType: 'general', status: 'draft', theme: 'default',
  showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', seo: {}, jsonLd: {}, slugHistory: [], sections: [],
};
const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const sec = (id, type, content = {}, extra = {}) => ({
  id, type, content, settings: {}, style: {}, layout: {}, advanced: {},
  enabled: true, sortOrder: 0, ...extra,
});

const sections = [
  sec('a', 'heading', { text: 'ยินดีต้อนรับสู่หลักสูตรของเรา' }),
  sec('b', 'two_column', {
    left:  [sec('b1', 'rich_text')],
    right: [sec('b2', 'cta', { buttonText: 'สมัครเลย' })],
  }),
  sec('c', 'container', { children: [sec('c1', 'image', { alt: 'ภาพปก' })] }),
];

const markup = renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})),
);

// The app's own Tailwind, over the app's own content globs.
const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

// The :root token block globals.css defines — the panels read --surface-border.
const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);

// EditorShell.jsx: grid-cols-[260px_1fr_320px]; Panel adds border-r + p-3.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${css}
body{margin:0}
</style></head><body>
<div style="display:grid;grid-template-columns:260px 1fr 320px;width:1440px">
  <section id="col" class="border-r border-[var(--surface-border)] bg-[var(--surface)]">
    <div class="border-b border-[var(--surface-border)] px-3 py-2"><h2 class="text-xs font-bold uppercase tracking-wider">โครงสร้างหน้า</h2></div>
    <div id="body" class="p-3">${markup}</div>
  </section>
  <div></div><div></div>
</div>
<pre id="out"></pre>
<script>
const w = (el) => el ? Math.round(el.getBoundingClientRect().width * 100) / 100 : null;
const row = document.querySelector('#body li > div');
const kids = row ? [...row.children] : [];
const label = row?.querySelector('button[class*="flex-1"]');
const actions = row?.querySelector('span.flex.shrink-0');
const iconBtns = row ? [...row.querySelectorAll('button[aria-label]')] : [];
const cs = row ? getComputedStyle(row) : null;
const nested = document.querySelector('#body li li > div');
const out = {
  gridColumn: w(document.querySelector('#col')),
  panelBody: w(document.querySelector('#body')),
  rowOuter: w(row),
  rowPaddingX: cs ? cs.paddingLeft + ' / ' + cs.paddingRight : null,
  rowGap: cs ? cs.columnGap : null,
  rowChildren: kids.map((k) => k.tagName.toLowerCase() + '=' + w(k)),
  labelButton: w(label),
  actionCluster: w(actions),
  iconButtons: iconBtns.map((b) => b.getAttribute('aria-label') + '=' + w(b)),
  iconButtonHeights: iconBtns.map((b) => Math.round(b.getBoundingClientRect().height)),
  nestedRowOuter: w(nested),
  nestedLabel: w(nested?.querySelector('button[class*="flex-1"]')),
  nestedChildren: nested ? [...nested.children].map((k) => (k.getAttribute('aria-label') || k.tagName.toLowerCase()) + '=' + w(k)) : null,
  rowHeights: [...document.querySelectorAll('#body li > div')].map((r) => Math.round(r.getBoundingClientRect().height)),
  radii: [...document.querySelectorAll('#body li > div')].slice(0,1).map((r) => getComputedStyle(r).borderRadius),
};
document.getElementById('out').textContent = JSON.stringify(out, null, 2);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'panelprobe-'));
const file = path.join(dir, 'panel.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--virtual-time-budget=3000', '--dump-dom', 'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '[probe] no output — page did not run');
console.log('[probe] html at', file);
