/**
 * ROUND 31 — the structure panel split into a fixed header, a scrolling
 * section list, and a pinned add-section footer. Measured, not reasoned.
 *
 * WHAT IT ANSWERS
 *   H — the header's top offset before and after the body is scrolled (it must
 *       not move), the footer's position (same), and whether the LAST section
 *       becomes reachable. scrollTop is reported, as rounds 12/13 did.
 *   I — exactly one scrollbar is added, the body's, and the PANEL itself does
 *       not scroll.
 *   J — the panel's outer width is identical across scroll states.
 *   E — the reserved gutter is on the SCROLLER. Proved the way round 13 proved
 *       it for the picker: by counter-example. The same panel is measured with
 *       the gutter on the scroller and with it moved out to the panel, at a
 *       list long enough to scroll and one short enough not to. Only the first
 *       arrangement holds the content width still.
 *
 * WHAT IS REAL, and what is not — the split round 17/28/29's probes drew:
 *   REAL — StructurePanel SSR'd through EditorProvider exactly as
 *          test/render/structureRowLines renders it; the stylesheet compiled by
 *          postcss from the app's own tailwind.config.js through globals.css;
 *          the 276px grid column and the 100dvh shell chain lifted from
 *          EditorShell.jsx and CHECKED against it below, so this cannot drift
 *          silently; Chrome's own layout and Chrome's own scrollbars.
 *   NOT   — the authenticated /admin route (middleware.js rule 6 answers 404
 *          without a session, by design), and the LINE Seed Sans TH webfont.
 *          Neither moves a scroll offset or a border-box width.
 *
 * NOTE: --hide-scrollbars is deliberately NOT passed. The whole question is
 * where the scrollbar takes its width from.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round31-bands.mjs
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

// ── the shell chain, lifted from EditorShell.jsx AND verified against it ────
const SHELL_SRC = readFileSync(path.join(ROOT, 'src/components/pageBuilder/editor/EditorShell.jsx'), 'utf8');
const GRID = 'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[276px_1fr_330px]';
const PANEL = 'flex min-h-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]';
const HEAD = 'border-b border-[var(--surface-border)] px-3 py-2';
const SCROLLER = 'flex-1 overflow-y-auto p-3 [scrollbar-gutter:stable]';
for (const [name, cls] of [['GRID', GRID], ['PANEL', PANEL], ['HEAD', HEAD]]) {
  if (!SHELL_SRC.includes(cls)) throw new Error('[probe] ' + name + ' has drifted from EditorShell.jsx');
}

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

/**
 * TWENTY named top-level sections — enough to overflow at every viewport under
 * test, so "does the last one become reachable" is a real question. The last
 * one carries a name nothing else does, so "what became visible" can be
 * reported as text rather than as an index.
 */
const many = Array.from({ length: 20 }, (_, i) =>
  sec('s' + i, 'heading', { text: 'หัวข้อของ Section ที่ ' + (i + 1) },
    { name: i === 19 ? 'ท้ายสุดของรายการ' : 'Section ที่ ' + (i + 1) }));
/** ONE section — short enough that the body does not scroll at any height. */
const few = [sec('only', 'heading', { text: 'เดียว' }, { name: 'Section เดียว' })];
/** A container, so a NESTED AddRow is on the page and can be located. */
const nested = [
  sec('c1', 'card_grid', { children: [sec('k1', 'icon_card', {}, { name: 'การ์ด 1' })] }, { name: 'กริดการ์ด' }),
  ...many.slice(0, 12),
];

const render = (sections) => renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})));

const markupHasScroller = render(few).includes(SCROLLER);
if (!markupHasScroller) throw new Error('[probe] the scroller class has drifted from StructurePanel.jsx');

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

const TOPBAR = 53; // EditorTopBar reads the editor context; a spacer of its measured height stands in

const headBand = '<div class="' + HEAD + '">'
  + '<h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2>'
  + '<p class="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">ลากเพื่อจัดลำดับ</p></div>';

/**
 * The E counter-example columns. Four fixed-height 276px panels, off-screen:
 * gutter on the scroller (as shipped) and gutter moved out to the panel (the
 * arrangement round 13 showed reintroduces the defect), each with a list that
 * overflows and one that does not.
 */
const variants = [
  { id: 'g-long', onScroller: true, sections: many },
  { id: 'g-short', onScroller: true, sections: few },
  { id: 'n-long', onScroller: false, sections: many },
  { id: 'n-short', onScroller: false, sections: few },
];
const variantHtml = variants.map((v, i) => {
  const markup = v.onScroller
    ? render(v.sections)
    : render(v.sections).replace(SCROLLER, 'flex-1 overflow-y-auto p-3');
  const panelCls = PANEL + (v.onScroller ? '' : ' [scrollbar-gutter:stable]');
  return '<section id="v-' + v.id + '" class="' + panelCls + '" '
    + 'style="position:absolute;left:' + (-4000 - i * 400) + 'px;top:0;width:276px;height:600px">'
    + headBand + markup + '</section>';
}).join('\n');

const page = [
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  css,
  'body{margin:0}',
  '</style></head><body>',
  '<div class="flex h-[100dvh] flex-col">',
  '  <div id="topbar" style="height:' + TOPBAR + 'px;flex:none"></div>',
  '  <div class="' + GRID + '">',
  '    <section id="panel" class="' + PANEL + '">',
  '      <div id="panel-head" class="' + HEAD + '">',
  '        <h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2>',
  '        <p class="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">ลากเพื่อจัดลำดับ</p>',
  '      </div>',
  render(nested),
  '    </section>',
  '    <div></div><div></div>',
  '  </div>',
  '</div>',
  variantHtml,
  '<pre id="out"></pre>',
  '<script>',
  MEASURE(),
  '</script></body></html>',
].join('\n');

function MEASURE() {
  return `
const n = (v) => Math.round(v * 100) / 100;
const panel = document.getElementById('panel');
const head = document.getElementById('panel-head');
const scroll = panel.querySelector('[data-testid="structure-scroll"]');
const foot = panel.querySelector('[data-testid="structure-add"]');

const scrollsNow = (el) => {
  const oy = getComputedStyle(el).overflowY;
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
};

const before = {
  panelBox: n(panel.getBoundingClientRect().width) + ' x ' + n(panel.getBoundingClientRect().height),
  panelWidth: n(panel.getBoundingClientRect().width),
  headTop: n(head.getBoundingClientRect().top),
  footTop: n(foot.getBoundingClientRect().top),
  footBottom: n(foot.getBoundingClientRect().bottom),
  scrollTop: scroll.scrollTop,
  scrollViewport: n(scroll.clientHeight) + ' of ' + n(scroll.scrollHeight),
  scrollerClientWidth: n(scroll.clientWidth),
};

const rows = [...scroll.querySelectorAll('li > div')];
const lastRow = rows[rows.length - 1];
const sBox = () => scroll.getBoundingClientRect();
const visible = (el) => {
  const r = el.getBoundingClientRect(), s = sBox();
  return r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5;
};
const rowName = (el) => {
  const p = el.querySelector('[data-testid="row-primary"]');
  return p ? p.textContent : '(none)';
};
before.lastRowName = rowName(lastRow);
before.lastRowVisible = visible(lastRow);

const scrollersInPanel = [...panel.querySelectorAll('*')].filter(scrollsNow)
  .map((el) => el.getAttribute('data-testid') || el.tagName.toLowerCase());
panel.scrollTop = 9999;
const panelScrollTopAfterPush = panel.scrollTop;
panel.scrollTop = 0;
const documentScrolls = document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1;

scroll.scrollTop = scroll.scrollHeight;
const after = {
  panelWidth: n(panel.getBoundingClientRect().width),
  headTop: n(head.getBoundingClientRect().top),
  footTop: n(foot.getBoundingClientRect().top),
  footBottom: n(foot.getBoundingClientRect().bottom),
  scrollTop: n(scroll.scrollTop),
  scrollerClientWidth: n(scroll.clientWidth),
  lastRowVisible: visible(lastRow),
  lastRowName: rowName(lastRow),
};

const nestedAdds = [...scroll.querySelectorAll('button')].filter((b) => /เพิ่ม section/.test(b.textContent));
const outerAdd = foot.querySelector('button');

const variant = {};
for (const id of ['g-long', 'g-short', 'n-long', 'n-short']) {
  const v = document.getElementById('v-' + id);
  const s = v.querySelector('[data-testid="structure-scroll"]');
  const r = s.querySelector('li > div');
  variant[id] = {
    scrollerClientWidth: n(s.clientWidth),
    scrolls: scrollsNow(s),
    firstRowWidth: n((r || s).getBoundingClientRect().width),
  };
}

document.getElementById('out').textContent = JSON.stringify({
  viewport: window.innerWidth + ' x ' + window.innerHeight,
  topBarSpacer: ${TOPBAR},
  BEFORE: before,
  AFTER: after,
  headMoved: n(after.headTop - before.headTop),
  footMoved: n(after.footTop - before.footTop),
  panelWidthMoved: n(after.panelWidth - before.panelWidth),
  '-- I --': '',
  scrollersInsidePanel: scrollersInPanel,
  panelScrollTopAfterPushingIt: panelScrollTopAfterPush,
  documentScrolls,
  '-- the add rows --': '',
  nestedAddButtonsInsideScroller: nestedAdds.length,
  outermostAddInFooter: Boolean(outerAdd) && outerAdd.textContent.trim(),
  footerContainsAnyList: Boolean(foot.querySelector('ul')),
  '-- E: gutter on scroller (shipped) vs on panel (counter-example) --': '',
  variant,
  gutterOnScroller_widthDelta: n(variant['g-short'].scrollerClientWidth - variant['g-long'].scrollerClientWidth),
  gutterOnPanel_widthDelta: n(variant['n-short'].scrollerClientWidth - variant['n-long'].scrollerClientWidth),
}, null, 2);
`;
}

const dir = mkdtempSync(path.join(tmpdir(), 'r31bands-'));
const file = path.join(dir, 'bands.html');
writeFileSync(file, page);

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [w, h] of [[1440, 900], [1536, 864], [1366, 768]]) {
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
    '--window-size=' + w + ',' + h,
    '--virtual-time-budget=4000', '--dump-dom', 'file:///' + file.split(path.sep).join('/'),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  console.log('\n== viewport ' + w + ' x ' + h + ' ==');
  console.log(m
    ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : '[probe] no output - page did not run');
}
console.log('\n[probe] html at', file);
