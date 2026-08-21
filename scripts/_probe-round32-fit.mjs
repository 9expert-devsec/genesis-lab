/**
 * ROUND 32 ITEM K — round 29's fit measurement, re-run with collapse shipped.
 *
 * Round 29 asked how many top-level rows fit before the panel scrolls, and
 * measured TODAY (which could not collapse anything) at 10 rows at 1366 × 768,
 * projecting 7 for the design's 62px card. This re-runs the SAME question
 * against the panel as it now stands, in both states, plus the height of round
 * 29's own six-section example page — the 1297px number that decided the
 * sequence — so the two are directly comparable.
 *
 * WHAT IS REAL: StructurePanel SSR'd through EditorProvider as the render tests
 * render it; the stylesheet compiled by postcss from the app's own
 * tailwind.config.js through globals.css; the 276px column, round 31's three
 * bands and the 100dvh shell chain lifted from EditorShell.jsx and CHECKED
 * against it, so this cannot drift silently; Chrome's own layout and Chrome's
 * own scrollbars.
 * WHAT IS NOT: the authenticated /admin route (middleware rule 6 answers 404
 * without a session) and the LINE Seed Sans TH webfont. Neither changes a row
 * pitch, which is set by padding and line-height on a fixed type scale.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round32-fit.mjs
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

const SHELL_SRC = readFileSync(path.join(ROOT, 'src/components/pageBuilder/editor/EditorShell.jsx'), 'utf8');
const GRID = 'grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[276px_1fr_330px]';
const PANEL = 'flex min-h-0 flex-col border-r border-[var(--surface-border)] bg-[var(--surface)]';
const HEAD = 'border-b border-[var(--surface-border)] px-3 py-2';
for (const [n, c] of [['GRID', GRID], ['PANEL', PANEL], ['HEAD', HEAD]]) {
  if (!SHELL_SRC.includes(c)) throw new Error('[probe] ' + n + ' drifted from EditorShell.jsx');
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
 * TWENTY top-level LEAVES — round 29's first fixture, unchanged. This is the
 * page collapse buys nothing on, so it is the honest floor: whatever the fit
 * number is here, collapse cannot improve it.
 */
const leaves = Array.from({ length: 20 }, (_, i) =>
  sec('s' + i, 'heading', { text: 'หัวข้อของ Section ที่ ' + (i + 1) }, { name: 'Section ที่ ' + (i + 1) }));

/**
 * ROUND 29's OWN EXAMPLE PAGE, rebuilt from what frame 20:2 draws: six
 * top-level sections, five of them containers holding 6 / 4 / 3 / 2 / 2
 * children. This is the fixture that produced 1297px against 407px, so it is
 * the one that says whether the sequence's premise held.
 */
const designPage = [
  sec('c1', 'container', { children: Array.from({ length: 6 }, (_, i) =>
    sec('c1k' + i, 'heading', {}, { name: 'Component ' + (i + 1) })) }, { name: 'Hero Promotion' }),
  sec('c2', 'two_column', {
    left: [sec('c2a', 'rich_text', {}, { name: 'ซ้าย 1' }), sec('c2b', 'image', {}, { name: 'ซ้าย 2' })],
    right: [sec('c2c', 'rich_text', {}, { name: 'ขวา 1' }), sec('c2d', 'cta', {}, { name: 'ขวา 2' })],
  }, { name: 'ภาพรวมโปรโมชัน' }),
  sec('c3', 'container', { children: Array.from({ length: 3 }, (_, i) =>
    sec('c3k' + i, 'heading', {}, { name: 'รอบ ' + (i + 1) })) }, { name: 'รอบอบรม' }),
  sec('c4', 'card_grid', { children: Array.from({ length: 2 }, (_, i) =>
    sec('c4k' + i, 'icon_card', {}, { name: 'การ์ด ' + (i + 1) })) }, { name: 'สิ่งที่จะได้รับ' }),
  sec('c5', 'accordion', { children: Array.from({ length: 2 }, (_, i) =>
    sec('c5k' + i, 'rich_text', {}, { name: 'ข้อ ' + (i + 1) })) }, { name: 'คำถามที่พบบ่อย' }),
  sec('c6', 'course_list', {}, { name: 'Bundle Courses' }),
];
/**
 * Every container in the fixture above, BY SECTION ID.
 *
 * ── CORRECTED IN ROUND 40, AND THE OLD VALUE WAS SILENTLY WRONG ───────────
 * These were context PATHS ('sections.0', …). Round 32 shipped expansion keyed
 * by section ID — its own note says path-keying broke when a reorder moved a
 * container — but this probe was never moved to the fixed key form. So every
 * seed missed, the "expanded" page rendered COLLAPSED, and the probe reported
 * the same 286px for both states without ever failing.
 *
 * The assertion below is what stops that recurring: a seed that opens nothing
 * is now a hard error rather than a number that looks plausible.
 */
const ALL_OPEN = ['c1', 'c2', 'c3', 'c4', 'c5'];

const render = (sections, expanded = []) => renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, { initialExpanded: expanded })));

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

const TOPBAR = 53;
const headBand = '<div id="panel-head" class="' + HEAD + '">'
  + '<h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2>'
  + '<p class="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">ลากเพื่อจัดลำดับ</p></div>';

const script = `
const n = (v) => Math.round(v * 100) / 100;
const panel = document.getElementById('panel');
const scroll = panel.querySelector('[data-testid="structure-scroll"]');
const foot = panel.querySelector('[data-testid="structure-add"]');
const rows = [...scroll.querySelectorAll('li > div[draggable]')];

// The viewport a list may occupy before the panel scrolls is now the BODY's
// own client box — round 31 gave the panel three bands, so the header and the
// pinned footer are outside it and no longer have to be subtracted by hand.
const budget = n(scroll.clientHeight);
const tops = rows.map((r) => r.getBoundingClientRect().top);
const pitches = tops.slice(1).map((t, i) => n(t - tops[i]));
const pitch = pitches.length ? pitches[0] : null;
const bottom = scroll.getBoundingClientRect().bottom;
const fit = rows.filter((r) => r.getBoundingClientRect().bottom <= bottom + 0.5).length;

// The two states of round 29's own example page, measured off-screen.
function heightOf(id) {
  const el = document.getElementById(id);
  const ul = el.querySelector('ul');
  return {
    // The UL, not the scroller: a scroller shorter than its box reports
    // scrollHeight === clientHeight, which would report the BOX every time a
    // page fits — exactly the case this is measuring.
    renderedHeight: n(ul ? ul.getBoundingClientRect().height : 0),
    topLevelRows: ul ? ul.children.length : 0,
    allRows: el.querySelectorAll('li > div[draggable]').length,
  };
}

document.getElementById('out').textContent = JSON.stringify({
  viewport: window.innerWidth + ' x ' + window.innerHeight,
  topBarSpacer: ${TOPBAR},
  panelBox: n(panel.getBoundingClientRect().width) + ' x ' + n(panel.getBoundingClientRect().height),
  listBudget: budget,
  footerHeight: n(foot.getBoundingClientRect().height),
  '-- twenty top-level LEAVES: the page collapse cannot help --': '',
  rowPitch: pitch,
  pitchUniform: pitches.every((p) => Math.abs(p - pitch) < 0.5),
  FIT_LEAVES: fit,
  FIT_LEAVES_byBudget: pitch ? Math.floor(budget / pitch) : null,
  '-- round 29 example page: six sections, five of them containers --': '',
  collapsed: heightOf('design-collapsed'),
  expanded: heightOf('design-expanded'),
  collapsedFitsWithoutScrolling: heightOf('design-collapsed').renderedHeight <= budget,
  expandedFitsWithoutScrolling: heightOf('design-expanded').renderedHeight <= budget,
  /**
   * THE SEED ACTUALLY OPENED SOMETHING. Round 40 found this probe seeding
   * expansion with context PATHS against an ID-keyed set: every seed missed and
   * both states reported the collapsed height, identically, for four rounds.
   * An expanded page must have strictly more rows than the collapsed one, and
   * saying so here is what makes the pair of numbers above mean anything.
   */
  EXPANSION_SEED_WORKED:
    heightOf('design-expanded').allRows > heightOf('design-collapsed').allRows,
  FIT_COLLAPSED_topLevel: (function () {
    const el = document.getElementById('design-collapsed');
    const s = el.querySelector('[data-testid="structure-scroll"]');
    const b = s.getBoundingClientRect().bottom;
    return [...s.querySelectorAll('li > div[draggable]')]
      .filter((r) => r.getBoundingClientRect().bottom <= b + 0.5).length;
  })(),
}, null, 2);
`;

const offscreen = (id, sections, expanded, left) =>
  '<div id="' + id + '" style="position:absolute;left:' + left + 'px;top:0;width:276px">'
  + '<section class="' + PANEL + '" style="height:HEIGHTpx">' + headBand + render(sections, expanded)
  + '</section></div>';

const page = (h) => [
  '<!doctype html><html><head><meta charset="utf-8"><style>', css, 'body{margin:0}',
  '</style></head><body>',
  '<div class="flex h-[100dvh] flex-col">',
  '  <div style="height:' + TOPBAR + 'px;flex:none"></div>',
  '  <div class="' + GRID + '">',
  '    <section id="panel" class="' + PANEL + '">', headBand, render(leaves), '</section>',
  '    <div></div><div></div>',
  '  </div>',
  '</div>',
  offscreen('design-collapsed', designPage, [], -4000).replace('HEIGHT', h),
  offscreen('design-expanded', designPage, ALL_OPEN, -4600).replace('HEIGHT', h),
  '<pre id="out"></pre>',
  '<script>', script, '</script></body></html>',
].join('\n');

const dir = mkdtempSync(path.join(tmpdir(), 'r32fit-'));
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [w, h] of [[1366, 768], [1440, 900], [1536, 864]]) {
  const file = path.join(dir, 'fit-' + w + '.html');
  // The off-screen columns are given the same height the real panel resolves
  // to at this viewport, so their scrollHeight is measured against the same
  // budget rather than an invented one.
  writeFileSync(file, page(h - 96 - TOPBAR));
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
    '--window-size=' + w + ',' + h, '--virtual-time-budget=4000', '--dump-dom',
    'file:///' + file.split(path.sep).join('/'),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  console.log('\n== viewport ' + w + ' x ' + h + ' ==');
  console.log(m
    ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : '[probe] no output - page did not run');
}
console.log('\n[probe] html in', dir);
