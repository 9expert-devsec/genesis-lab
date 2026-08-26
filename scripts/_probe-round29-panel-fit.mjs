/**
 * ROUND 29 ITEM I — how many section rows fit in the structure panel before it
 * scrolls, at the shipped 276px width, at TODAY'S row height and at the
 * DESIGN'S card height.
 *
 * The question the survey has to answer before card rows can be approved: a
 * 54px card with an 8px gap is a 62px pitch against today's much shorter row,
 * and round 16's own screenshots showed ~6 sections nearly filling the column.
 * If the design's number is materially worse, the proposal owes a mitigation
 * rather than a panel that shows four items.
 *
 * WHAT IS REAL HERE, and what is not — the same split as round 17's and round
 * 28's probes:
 *   REAL — StructurePanel SSR'd through EditorProvider exactly as
 *          test/render/structureRowLines renders it; the stylesheet compiled by
 *          postcss from the app's own tailwind.config.js through globals.css;
 *          the 276px grid column, the Panel header and its p-3 body, and the
 *          100dvh shell chain lifted from EditorShell.jsx; Chrome's own layout
 *          at three real viewport heights.
 *   NOT   — the authenticated /admin route (NextAuth-guarded), and the LINE
 *          Seed Sans TH webfont. Neither changes a row PITCH, which is set by
 *          padding and line-height on a fixed type scale.
 *
 * THE DESIGN'S NUMBER IS NOT RENDERED FROM THE DESIGN — nothing here builds the
 * card. It is computed from the design's own measurements (Figma 20:119 / 20:278
 * / 20:307: card min-h 54, 61 when the second line wraps, 8px between cards)
 * against the SAME measured available height. One measured quantity, one
 * specified quantity, and the file says which is which.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round29-panel-fit.mjs
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

/**
 * TWENTY top-level sections, all leaves, all with a name.
 *
 * Twenty rather than the design's six on purpose: the question is how many fit,
 * so the list must overflow at every viewport under test. All LEAVES, because a
 * container renders its children inline today and that would measure a
 * different thing — the fit question is about top-level pitch.
 *
 * Named, because an unnamed row can fall back to a one-line label and a
 * two-line row is the honest worst case: the design's own card grows 54 -> 61
 * when its second line wraps, and today's row does the same.
 */
const sections = Array.from({ length: 20 }, (_, i) =>
  sec(`s${i}`, 'heading', { text: `หัวข้อของ Section ที่ ${i + 1}` }, { name: `Section ที่ ${i + 1}` }));

const markup = renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})),
);

/**
 * THE SECOND FIXTURE — the design's OWN page, rebuilt from what frame 20:2
 * draws: six top-level sections, five of which are containers holding 6 / 4 / 3
 * / 2 / 2 children.
 *
 * This is the comparison that actually decides the question, and the first
 * fixture cannot make it. Today's panel has NO COLLAPSE — SectionList renders
 * every container's children unconditionally, plus a slot header and an AddRow
 * per slot — so a container costs its own row PLUS all of that, always. The
 * design's card collapses. So the taller card is not simply a loss: on a page
 * with containers it may be a net win, and a fit number taken on twenty leaves
 * would report only the half that favours today.
 */
const designPage = [
  sec('c1', 'container', { children: Array.from({ length: 6 }, (_, i) =>
    sec(`c1k${i}`, 'heading', {}, { name: `Component ${i + 1}` })) }, { name: 'Hero Promotion' }),
  sec('c2', 'two_column', {
    left: [sec('c2a', 'rich_text', {}, { name: 'ซ้าย 1' }), sec('c2b', 'image', {}, { name: 'ซ้าย 2' })],
    right: [sec('c2c', 'rich_text', {}, { name: 'ขวา 1' }), sec('c2d', 'cta', {}, { name: 'ขวา 2' })],
  }, { name: 'ภาพรวมโปรโมชัน' }),
  sec('c3', 'container', { children: Array.from({ length: 3 }, (_, i) =>
    sec(`c3k${i}`, 'heading', {}, { name: `รอบ ${i + 1}` })) }, { name: 'รอบอบรม' }),
  sec('c4', 'card_grid', { children: Array.from({ length: 2 }, (_, i) =>
    sec(`c4k${i}`, 'icon_card', {}, { name: `การ์ด ${i + 1}` })) }, { name: 'สิ่งที่จะได้รับ' }),
  sec('c5', 'accordion', { children: Array.from({ length: 2 }, (_, i) =>
    sec(`c5k${i}`, 'rich_text', {}, { name: `ข้อ ${i + 1}` })) }, { name: 'คำถามที่พบบ่อย' }),
  sec('c6', 'course_list', {}, { name: 'Bundle Courses' }),
];

const designPageMarkup = renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections: designPage }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})),
);

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

/**
 * The shell chain, lifted from EditorShell.jsx: a 100dvh flex column holding
 * the top bar, then a grid whose first column is the 276px panel. The top bar's
 * real height is measured on the page rather than assumed — EditorTopBar is not
 * rendered here (it reads the editor context for save state), so a spacer of
 * its measured height stands in and the probe reports what it used.
 */
const TOPBAR = 53; // measured separately; reported in the output so it is not silent

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
body{margin:0}
</style></head><body>
<div class="flex h-[100dvh] flex-col">
  <div id="topbar" style="height:${TOPBAR}px;flex:none"></div>
  <div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[276px_1fr_330px]">
    <section id="panel" class="min-h-0 overflow-y-auto border-r border-[var(--surface-border)] bg-[var(--surface)]">
      <div id="panel-head" class="border-b border-[var(--surface-border)] px-3 py-2">
        <h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2>
        <p class="mt-0.5 text-[10px] normal-case text-9e-slate-dp-50/70">ลากเพื่อจัดลำดับ</p>
      </div>
      <div id="panel-body" class="p-3">${markup}</div>
    </section>
    <div></div><div></div>
  </div>
</div>
<!-- The design's own page, laid out in an identical 276px column off-screen so
     its rendered height can be read without disturbing the fit measurement. -->
<div style="position:absolute;left:-4000px;top:0;width:276px">
  <div id="design-body" class="p-3">${designPageMarkup}</div>
</div>
<pre id="out"></pre>
<script>
const n = (v) => Math.round(v * 100) / 100;
const panel = document.getElementById('panel');
const rows = [...document.querySelectorAll('#panel-body li > div')];
const addBtn = document.querySelector('#panel-body button.border-dashed')
  || [...document.querySelectorAll('#panel-body button')].pop();

// The scroll viewport: the panel's own client box, minus its sticky-free header.
const panelBox = panel.getBoundingClientRect();
const headBox = document.getElementById('panel-head').getBoundingClientRect();
const bodyStyle = getComputedStyle(document.getElementById('panel-body'));
const padTop = parseFloat(bodyStyle.paddingTop);
const padBottom = parseFloat(bodyStyle.paddingBottom);

// PITCH: top of row N+1 minus top of row N, measured rather than derived from
// the row height plus a guessed margin.
const tops = rows.map((r) => r.getBoundingClientRect().top);
const pitches = tops.slice(1).map((t, i) => n(t - tops[i]));
const pitch = pitches.length ? pitches[0] : null;
const uniformPitch = pitches.every((p) => Math.abs(p - pitch) < 0.5);

// The height a row list can occupy before the panel scrolls: the panel's
// viewport minus the header, minus the body's own vertical padding, minus the
// add-section button and its margin (it is always the last thing in the list
// and always in flow).
const addBox = addBtn ? addBtn.getBoundingClientRect() : null;
const addMargin = addBtn ? parseFloat(getComputedStyle(addBtn).marginTop) : 0;
const addCost = addBox ? addBox.height + addMargin : 0;
const listBudget = n(panelBox.height - headBox.height - padTop - padBottom - addCost);

// TODAY, counted rather than divided: how many rows have their whole box above
// the panel's visible bottom edge.
const visibleBottom = panelBox.bottom;
const fitToday = rows.filter((r) => r.getBoundingClientRect().bottom <= visibleBottom - addCost).length;

// THE DESIGN'S PITCH — from Figma 20:119/20:278/20:307, not rendered here.
const DESIGN_CARD_1LINE = 54, DESIGN_CARD_2LINE = 61, DESIGN_GAP = 8;
const designPitch1 = DESIGN_CARD_1LINE + DESIGN_GAP;   // 62
const designPitch2 = DESIGN_CARD_2LINE + DESIGN_GAP;   // 69
const fitDesign1 = Math.floor(listBudget / designPitch1);
const fitDesign2 = Math.floor(listBudget / designPitch2);

// ── THE DESIGN'S OWN CHROME, which is taller than today's ────────────────
// Figma 20:94 header = 93 (against today's measured panel header), 20:439 hint
// banner = 66, both above the list. Applied to the SAME measured budget.
const DESIGN_HEADER = 93, DESIGN_HINT = 66;
const designBudget = n(listBudget + headBox.height - DESIGN_HEADER - DESIGN_HINT);

// ── THE DESIGN'S PAGE, rendered by TODAY'S panel ─────────────────────────
// Five containers, all forced open because today cannot collapse them.
const designBody = document.getElementById('design-body');
const todayHeightForDesignPage = n(designBody.getBoundingClientRect().height);
const firstUl = designBody.querySelector('ul');
const topLevelRows = firstUl ? [...firstUl.children] : [];
const topLevelCount = topLevelRows.length;
// What the SAME six sections cost as collapsed design cards: 5 two-line
// (they carry a "· N Components" subtitle) + 1 one-line, plus the gaps.
const designCollapsedHeight = 5 * designPitch2 + 1 * designPitch1;

document.getElementById('out').textContent = JSON.stringify({
  viewportHeight: window.innerHeight,
  topBarSpacer: ${TOPBAR},
  panelBox: n(panelBox.width) + ' x ' + n(panelBox.height),
  panelHeader: n(headBox.height),
  bodyPaddingY: padTop + ' / ' + padBottom,
  addSectionCost: n(addCost),
  listBudget,
  todayRowHeight: rows.length ? n(rows[0].getBoundingClientRect().height) : null,
  todayPitch: pitch,
  todayPitchUniform: uniformPitch,
  todayPitchesSeen: [...new Set(pitches)],
  FIT_TODAY: fitToday,
  FIT_TODAY_byBudget: Math.floor(listBudget / pitch),
  designPitch_1line: designPitch1,
  designPitch_2line: designPitch2,
  FIT_DESIGN_1line: fitDesign1,
  FIT_DESIGN_2line: fitDesign2,

  '── with the design own taller chrome (header 93 + hint 66) ──': '',
  designListBudget: designBudget,
  FIT_DESIGN_1line_withChrome: Math.floor(designBudget / designPitch1),
  FIT_DESIGN_2line_withChrome: Math.floor(designBudget / designPitch2),

  '── the design page, six sections, five of them containers ──': '',
  designPageTopLevelSections: topLevelCount,
  todayRenderedHeight_alwaysExpanded: todayHeightForDesignPage,
  designRenderedHeight_allCollapsed: designCollapsedHeight,
  todayFitsWholePage: todayHeightForDesignPage <= listBudget,
  designFitsWholePage: designCollapsedHeight <= designBudget,
}, null, 2);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'r29fit-'));
const file = path.join(dir, 'fit.html');
writeFileSync(file, html);

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [w, h] of [[1920, 1080], [1536, 864], [1440, 900], [1366, 768]]) {
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, '--hide-scrollbars',
    '--virtual-time-budget=4000', '--dump-dom', 'file:///' + file.split(path.sep).join('/'),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  console.log(`\n══ viewport ${w} x ${h} ══`);
  console.log(m
    ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : '[probe] no output — page did not run');
}
console.log('\n[probe] html at', file);
