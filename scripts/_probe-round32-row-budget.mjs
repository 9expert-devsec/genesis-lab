/**
 * ROUND 32 — the two questions that must be answered BEFORE the row changes.
 *
 *   A. WHAT AN UNNAMED RUN READS ONCE THE NUMBERS GO. Round 16 introduced the
 *      leading position number with a stated reason: a run of same-type
 *      sections with no name and no summary has no distinguishing data at all.
 *      Round 17 made `name` authorable, which answers it — for named sections.
 *      This renders three adjacent UNNAMED rich_text sections and prints what
 *      each row actually says, with the number and without it. No reasoning:
 *      the strings.
 *
 *   C/D. THE LEADING SLOT'S WIDTH BUDGET. Round 28 measured the label at 91px
 *      top-level and 39.4px nested, with a 96px action cluster, at 276px. A
 *      drag handle in the leading slot competes for that budget and the
 *      position number's removal repays it. Both are measured here rather than
 *      argued: the label button's width today, with the number present, and
 *      with the number's own box subtracted.
 *
 * REAL: StructurePanel SSR'd through EditorProvider as the render tests do;
 * the app's own compiled stylesheet; the 276px column and the shell chain from
 * EditorShell.jsx. NOT: the authenticated route, and the webfont.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round32-row-budget.mjs
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
 * A. THREE ADJACENT UNNAMED rich_text SECTIONS. No name, no content — the
 * exact case round 16's note describes. A fourth, NAMED, stands beside them so
 * the contrast is in the same output rather than in a second run.
 */
const unnamedRun = [
  sec('r1', 'rich_text'),
  sec('r2', 'rich_text'),
  sec('r3', 'rich_text'),
  sec('r4', 'rich_text', {}, { name: 'บทนำของหน้า' }),
];

/**
 * C/D. A page carrying both a top-level leaf and a NESTED one — round 28
 * measured the label at both depths and they are different budgets.
 */
const depths = [
  sec('leaf', 'heading', { text: 'หัวข้อยาวพอที่จะถูกตัดท้าย' }, { name: 'แถวใบไม้ระดับบนสุด' }),
  sec('c', 'card_grid', { children: [sec('k', 'icon_card', {}, { name: 'การ์ดใบแรกของกริด' })] },
    { name: 'กริดการ์ดหน้าแรก' }),
  sec('t', 'heading', { text: 'หัวข้อยาวพอที่จะถูกตัดท้ายในคอลัมน์แคบ' }),
];

const render = (sections) => renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})));

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

const TOPBAR = 53;
const headBand = '<div class="' + HEAD + '">'
  + '<h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2>'
  + '<p class="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">ลากเพื่อจัดลำดับ</p></div>';

const script = `
const n = (v) => Math.round(v * 100) / 100;
const w = (el) => (el ? n(el.getBoundingClientRect().width) : null);
const txt = (el) => (el ? el.textContent.replace(/\\s+/g, ' ').trim() : null);

function rowsOf(id) {
  // [draggable] is what distinguishes a ROW from a slot wrapper — the <li>
  // holds both as direct children, so 'li > div' matches the wrapper too.
  return [...document.querySelectorAll('#' + id + ' li > div[draggable]')];
}

// ── A: what each row of the unnamed run actually reads ───────────────────
const runRows = rowsOf('run').map((row) => {
  const pos = row.querySelector('[data-testid="row-position"]');
  const pri = row.querySelector('[data-testid="row-primary"]');
  const sec2 = row.querySelector('[data-testid="row-secondary"]');
  return {
    withNumber: [txt(pos), txt(pri)].filter(Boolean).join(' '),
    withoutNumber: txt(pri),
    secondLine: txt(sec2),
  };
});
const distinctWith = new Set(runRows.map((r) => r.withNumber + '|' + (r.secondLine ?? ''))).size;
const distinctWithout = new Set(runRows.map((r) => r.withoutNumber + '|' + (r.secondLine ?? ''))).size;

// ── C/D: the leading slot and the label budget, per depth ────────────────
function anatomy(row) {
  const kids = [...row.children];
  const label = row.querySelector(':scope > button');
  const pos = row.querySelector('[data-testid="row-position"]');
  const icon = row.querySelector(':scope > svg');
  const cluster = row.querySelector(':scope > span.flex.shrink-0');
  const eye = [...row.querySelectorAll(':scope > button[aria-label]')].pop();
  const posBox = pos ? pos.getBoundingClientRect().width : 0;
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  return {
    rowWidth: w(row),
    leadingSlot: kids.filter((k) => k.tagName === 'svg').map((k) => k.getAttribute('class')),
    typeIconWidth: w(icon),
    labelButton: w(label),
    positionBox: n(posBox),
    gapBetweenChildren: gap,
    labelIfNumberRemoved: n(w(label)),
    primaryTextBox: w(row.querySelector('[data-testid="row-primary"]')),
    primaryIfNumberRemoved: n(w(row.querySelector('[data-testid="row-primary"]')) + posBox + gap),
    actionCluster: w(cluster),
    eyeButton: w(eye),
    actionButtons: [...row.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label') + ':' + w(b)),
  };
}
const rows = rowsOf('depths');
const topLevel = rows.find((r) => !r.parentElement.parentElement.closest('.ml-3'));
const nestedRow = rows.find((r) => r.parentElement.parentElement.closest('.ml-3'));

document.getElementById('out').textContent = JSON.stringify({
  viewport: window.innerWidth + ' x ' + window.innerHeight,
  '-- A: three unnamed rich_text sections, and one named --': '',
  unnamedRun: runRows,
  distinctRowsWithTheNumber: distinctWith,
  distinctRowsWithoutTheNumber: distinctWithout,
  rowsInRun: runRows.length,
  '-- C/D: the leading slot and the label budget --': '',
  topLevelRow: topLevel ? anatomy(topLevel) : null,
  nestedRow: nestedRow ? anatomy(nestedRow) : null,
}, null, 2);
`;

const page = [
  '<!doctype html><html><head><meta charset="utf-8"><style>', css, 'body{margin:0}',
  '</style></head><body>',
  '<div class="flex h-[100dvh] flex-col">',
  '  <div style="height:' + TOPBAR + 'px;flex:none"></div>',
  '  <div class="' + GRID + '">',
  '    <section id="panel" class="' + PANEL + '">', headBand, render(depths), '</section>',
  '    <div></div><div></div>',
  '  </div>',
  '</div>',
  '<div id="depths" style="position:absolute;left:-4000px;top:0;width:276px">',
  '<section class="' + PANEL + '" style="height:600px">' + headBand + render(depths) + '</section></div>',
  '<div id="run" style="position:absolute;left:-5000px;top:0;width:276px">',
  '<section class="' + PANEL + '" style="height:600px">' + headBand + render(unnamedRun) + '</section></div>',
  '<pre id="out"></pre>',
  '<script>', script, '</script></body></html>',
].join('\n');

const dir = mkdtempSync(path.join(tmpdir(), 'r32budget-'));
const file = path.join(dir, 'budget.html');
writeFileSync(file, page);

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1440,900', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
console.log(m
  ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  : '[probe] no output - page did not run');
console.log('\n[probe] html at', file);
