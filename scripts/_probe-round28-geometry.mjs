/**
 * ROUND 28 — measure the Figma pass in a REAL browser, light and dark.
 *
 * Round 17's `_probe-panel-width.mjs` measured the structure row at the 260px
 * column and produced the numbers this round is judged against: 85px of label
 * at top level, 33.4px on a nested row carrying a badge, 88px for an action
 * cluster that is always in flow, and a 22px icon hit area. The column is
 * 276px now and the settings column is 330px, so those numbers are re-taken
 * here at the new widths rather than re-derived on paper.
 *
 * What is real here, and what is not — the same honest split as round 17:
 *   REAL — StructurePanel SSR'd through EditorProvider exactly as
 *          test/render/structureRowLines renders it; SelectionHeader and
 *          SectionNameField; PageSettingsBody with its menu; the stylesheet
 *          compiled by postcss from the app's own tailwind.config.js over the
 *          app's own content globs, THROUGH globals.css so every --surface-*
 *          and --9e-* token block is present in both themes; the grid columns
 *          and Panel padding lifted from EditorShell.jsx; Chrome's own layout.
 *   NOT   — the authenticated /admin route (NextAuth-guarded; a headless
 *          session is not mintable here), the LINE Seed Sans TH webfont, and
 *          the Dialog WRAPPER, which is a Radix portal and renders zero bytes
 *          on the server. The dialog is therefore measured as its real BODY
 *          inside a div carrying the wrapper's own class string, lifted
 *          verbatim — which measures what Tailwind compiles for those classes.
 *
 * Dark mode is measured by adding `.dark` to <html> and re-reading, which is
 * how the app itself switches (next-themes, attribute="class" — pinned by
 * test/fs/authoredColorTokens).
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round28-geometry.mjs
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
const { SelectionHeader, SectionNameField } = await import('@/components/pageBuilder/editor/SettingsPanel');
const { PageSettingsBody } = await import('@/components/pageBuilder/editor/PageSettingsDialog');

const noop = () => {};
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

// The SAME fixture round 17 measured, so the two runs are comparable. The
// nested rich_text row is the one that carries the ว่าง badge.
const sections = [
  sec('a', 'heading', { text: 'ยินดีต้อนรับสู่หลักสูตรของเรา' }),
  sec('b', 'two_column', {
    left:  [sec('b1', 'rich_text')],
    right: [sec('b2', 'cta', { buttonText: 'สมัครเลย' })],
  }),
  sec('c', 'container', { children: [sec('c1', 'image', { alt: 'ภาพปก' })] }),
];

const structure = renderToStaticMarkup(
  createElement(EditorProvider,
    { page: { ...PAGE, sections }, pageId: 'p1', updatedAt: 'T0', tier: TIER },
    createElement(StructurePanel, {})),
);

const settings = renderToStaticMarkup(createElement('div', null,
  createElement(SelectionHeader, { type: 'heading', parentType: 'two_column' }),
  createElement(SectionNameField, { name: '', onChange: noop }),
));

const dialogBody = renderToStaticMarkup(createElement(PageSettingsBody, {
  page: PAGE, pageId: 'p1', dispatch: noop, open: true, dirty: false, saving: false,
  tier: TIER, previewStatus: 'active',
}));

/** PageSettingsDialog.jsx's Dialog.Content class string, lifted verbatim. */
const DIALOG_SHELL = [
  'fixed left-1/2 top-1/2 z-50 flex w-[min(57.5rem,calc(100vw-2rem))] flex-col',
  '-translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-9e-md border',
  'border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-lg',
  'h-[42.5rem] max-h-[calc(100dvh-4rem)]',
].join(' ');

// Compiled THROUGH globals.css rather than from bare @tailwind directives, so
// the :root and .dark token blocks both land — without them every
// var(--surface-*) reads as empty and dark mode cannot be measured at all.
const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${css}
body{margin:0}
</style></head><body>
<div style="display:grid;grid-template-columns:276px 1fr 330px;width:1920px;height:945px">
  <section id="structure" class="border-r border-[var(--surface-border)] bg-[var(--surface)]">
    <div class="border-b border-[var(--surface-border)] px-3 py-2"><h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">โครงสร้างหน้า</h2></div>
    <div id="structure-body" class="p-3">${structure}</div>
  </section>
  <div></div>
  <section id="settings" class="border-l border-[var(--surface-border)] bg-[var(--surface)]">
    <div class="border-b border-[var(--surface-border)] px-3 py-2"><h2 class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">ตั้งค่า</h2></div>
    <div id="settings-body" class="p-3">${settings}</div>
  </section>
</div>
<div id="dialog" class="${DIALOG_SHELL}">${dialogBody}</div>
<pre id="out"></pre>
<script>
const n = (v) => Math.round(v * 100) / 100;
const w = (el) => el ? n(el.getBoundingClientRect().width) : null;
const h = (el) => el ? n(el.getBoundingClientRect().height) : null;
const box = (el) => el ? (w(el) + ' x ' + h(el)) : null;
const q = (s) => document.querySelector(s);

const rows = [...document.querySelectorAll('#structure-body li > div')];
const rowInfo = (row) => {
  if (!row) return null;
  const label = row.querySelector(':scope > button');
  const spans = [...row.querySelectorAll(':scope > span')];
  const actions = spans[spans.length - 1];
  const badges = spans.slice(0, -1);
  const btns = [...row.querySelectorAll('button[aria-label]')];
  return {
    outer: box(row),
    labelButton: w(label),
    primaryText: w(row.querySelector('[data-testid="row-primary"]')),
    badges: badges.map((b) => b.textContent.trim() + '=' + w(b)),
    actionCluster: w(actions),
    actionButton: btns.length ? box(btns[0]) : null,
    actionGlyph: btns.length ? box(btns[0].querySelector('svg')) : null,
  };
};
// The nested row that also carries a badge — round 17's worst case.
const nestedBadged = rows.find((r, i) => i > 0 && r.closest('li li') && r.querySelectorAll(':scope > span').length > 1)
  || document.querySelector('#structure-body li li > div');

const navBtn = q('#dialog nav button');
const out = {
  '── columns ──': '',
  structureColumn: w(q('#structure')),
  structureBody:   w(q('#structure-body')),
  settingsColumn:  w(q('#settings')),
  settingsBody:    w(q('#settings-body')),

  '── structure rows (round 17 re-measured) ──': '',
  topLevelRow: rowInfo(rows[0]),
  nestedBadgedRow: rowInfo(nestedBadged),

  '── settings panel header ──': '',
  headingBox:      box(q('#settings [data-testid="settings-header-type"]')),
  headingFontSize: q('#settings [data-testid="settings-header-type"]') ? getComputedStyle(q('#settings [data-testid="settings-header-type"]')).fontSize : null,
  breadcrumbCard:  box(q('#settings [data-testid="settings-header-parent"]')),
  breadcrumbRadius: q('#settings [data-testid="settings-header-parent"]') ? getComputedStyle(q('#settings [data-testid="settings-header-parent"]')).borderRadius : null,

  '── dialog ──': '',
  dialog:        box(q('#dialog')),
  dialogRadius:  getComputedStyle(q('#dialog')).borderRadius,
  dialogShadow:  getComputedStyle(q('#dialog')).boxShadow,
  dialogNav:     box(q('#dialog nav')),
  dialogNavItem: box(navBtn),
  navItemRadius: navBtn ? getComputedStyle(navBtn).borderRadius : null,
  navGlyph:      box(q('#dialog nav button svg')),
  dialogContent: box(q('#dialog nav') ? q('#dialog nav').nextElementSibling : null),
  dialogFooter:  box(q('#dialog [data-testid="settings-save-state"]')),
  previewDot:    box(q('#dialog [data-testid="nav-preview-dot"]')),

  '── colour, light ──': '',
  navBg:      q('#dialog nav') ? getComputedStyle(q('#dialog nav')).backgroundColor : null,
  activeBg:   getComputedStyle(q('#dialog nav button[aria-current="true"]')).backgroundColor,
  activeText: getComputedStyle(q('#dialog nav button[aria-current="true"]')).color,
  dotBg:      getComputedStyle(q('#dialog [data-testid="nav-preview-dot"]')).backgroundColor,
  footerBg:   getComputedStyle(q('#dialog [data-testid="settings-save-state"]')).backgroundColor,
  panelBg:    getComputedStyle(q('#structure')).backgroundColor,
};

// ── the same page, one class on <html> ──────────────────────────────────
document.documentElement.classList.add('dark');
out['── colour, DARK ──'] = '';
out.darkDialogSurface = getComputedStyle(q('#dialog')).backgroundColor;
out.darkNavBg          = getComputedStyle(q('#dialog nav')).backgroundColor;
out.darkActiveBg       = getComputedStyle(q('#dialog nav button[aria-current="true"]')).backgroundColor;
out.darkActiveText     = getComputedStyle(q('#dialog nav button[aria-current="true"]')).color;
out.darkDotBg          = getComputedStyle(q('#dialog [data-testid="nav-preview-dot"]')).backgroundColor;
out.darkFooterBg       = getComputedStyle(q('#dialog [data-testid="settings-save-state"]')).backgroundColor;
out.darkPanelBg        = getComputedStyle(q('#structure')).backgroundColor;
out.darkBreadcrumbBg   = getComputedStyle(q('#settings [data-testid="settings-header-parent"]')).backgroundColor;
out.darkHeadingText    = getComputedStyle(q('#settings [data-testid="settings-header-type"]')).color;
out.darkRowHoverToken  = getComputedStyle(document.documentElement).getPropertyValue('--surface-hover').trim();
document.documentElement.classList.remove('dark');
out.lightRowHoverToken = getComputedStyle(document.documentElement).getPropertyValue('--surface-hover').trim();

document.getElementById('out').textContent = JSON.stringify(out, null, 2);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'r28probe-'));
const file = path.join(dir, 'geometry.html');
writeFileSync(file, html);

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1920,1080', '--hide-scrollbars',
  '--virtual-time-budget=4000', '--dump-dom', 'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
console.log(m
  ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  : '[probe] no output — page did not run');
console.log('[probe] html at', file);
