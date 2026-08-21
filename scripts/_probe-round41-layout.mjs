/**
 * ROUND 41 ITEM N — the two-column version history inside the fixed dialog, and
 * the regrouped top bar at real widths.
 *
 * TWO QUESTIONS, and the second is the one round 13 pinned:
 *   1. what are the columns actually resolving to inside the 920 x 680 dialog
 *      rounds 12/13 set and fixed;
 *   2. does the timeline fit WITHOUT A SECOND SCROLLBAR — i.e. is the dialog
 *      body still the only scrolling box in the dialog.
 *
 * WHAT IS REAL: VersionHistory and EditorTopBar SSR'd exactly as the render
 * tests render them; the stylesheet compiled by postcss from the app's own
 * tailwind.config.js through globals.css; the dialog shell, nav and body
 * classes LIFTED FROM PageSettingsDialog.jsx and checked against it, so they
 * cannot drift silently; Chrome's own layout and Chrome's own scrollbars.
 * WHAT IS NOT: the authenticated /admin route (middleware rule 6 answers 404
 * without a session), the Radix portal (it renders zero bytes server-side, so
 * the shell is reproduced rather than rendered), and the LINE Seed Sans TH
 * webfont — which changes glyph widths, not the box model this measures.
 *
 * ── PROBE HYGIENE, ROUND 40's RULE ────────────────────────────────────────
 * Round 40 found two probes that had rotted for four rounds while reporting
 * plausible numbers. Every number below is therefore guarded by an assertion
 * that the thing it measures was actually FOUND and is actually POPULATED:
 * MEASURED_* keys, and hard throws in Node when a selector comes back empty.
 * A probe that measured nothing is an error here, never a number.
 *
 * Not a test — a probe. Run:
 *   node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round41-layout.mjs
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

const { VersionHistory } = await import('@/components/pageBuilder/editor/VersionHistory');
const { EditorProvider } = await import('@/components/pageBuilder/editor/EditorProvider');
const { EditorTopBar } = await import('@/components/pageBuilder/editor/EditorTopBar');

// ── the shell, lifted and CHECKED ──────────────────────────────────────────
const DIALOG_SRC = readFileSync(path.join(ROOT, 'src/components/pageBuilder/editor/PageSettingsDialog.jsx'), 'utf8');
const SHELL = 'fixed left-1/2 top-1/2 z-50 flex w-[min(57.5rem,calc(100vw-2rem))] flex-col';
const SHELL_H = 'h-[42.5rem] max-h-[calc(100dvh-4rem)]';
const NAV = 'px-2.5 py-3 sm:w-[190px] sm:border-b-0 sm:border-r';
const BODY = 'min-w-0 flex-1 overflow-y-auto px-6 pb-7 pt-5';
const FOOT = 'flex min-h-[66px] shrink-0 items-center border-t border-[var(--surface-border)]';
for (const [n, c] of [['SHELL', SHELL], ['SHELL_H', SHELL_H], ['NAV', NAV], ['BODY', BODY], ['FOOT', FOOT]]) {
  if (!DIALOG_SRC.includes(c)) throw new Error('[probe] ' + n + ' drifted from PageSettingsDialog.jsx');
}

const TIER = { canUseAdvanced: true, canPublish: true, canManagePreview: true };
const PAGE = {
  slug: 'live-slug', title: 'แลนดิ้งเพจโปรโมชัน Power BI ปลายปี 2569', pageType: 'general',
  status: 'published', theme: 'default', showHeader: true, showFooter: true, showStickyCta: false,
  publishStartDate: null, publishEndDate: null, promotionId: '', promotionOrder: 0,
  promotionCover: '', sections: [], seo: {}, jsonLd: {}, slugHistory: [],
  publishedVersion: 12, preview: { enabled: true, passwordHash: 'x' },
  draft: { title: 'x', sections: [], savedAt: 'T', savedBy: { id: 'u', name: 'Yanisa P.' } },
};

const EDITOR = {
  pageId: 'p1', savedUpdatedAt: 'T0', dispatch: () => {},
  saving: false, conflict: null, hadDraft: true, contentDirty: false, identityDirty: false,
  page: { status: 'published', slug: 'live-slug' },
  publishedVersion: 12, previewEnabled: true,
};

/** TWELVE versions and one backup — a page with real history, newest first. */
const ROWS = [
  { _id: 'bk', label: 'draft-backup', actor: { name: 'Pirasak S.' }, versionNumber: null, createdAt: '2026-08-27T02:00:00.000Z' },
  ...Array.from({ length: 12 }, (_, i) => ({
    _id: 'v' + (12 - i),
    label: 'publish',
    actor: { name: i % 2 ? 'Yanisa P.' : 'Pirasak S.' },
    versionNumber: 12 - i,
    createdAt: new Date(Date.UTC(2026, 7, 26 - i, 4, 41)).toISOString(),
  })),
];

const history = renderToStaticMarkup(createElement(VersionHistory, {
  pageId: 'p1', open: true, editor: EDITOR, initialRows: ROWS,
}));
const topBar = renderToStaticMarkup(createElement(EditorProvider,
  { page: PAGE, pageId: 'p1', updatedAt: 'T0', tier: TIER, currentUserName: 'Yanisa P.' },
  createElement(EditorTopBar, {
    onSave: () => {}, onOpenSettings: () => {}, onOpenPreview: () => {},
    onPublish: () => {}, onDiscard: () => {},
  })));

// The seed has to have produced rows, or every width below is measured on an
// empty box. Round 40's lesson, applied before Chrome is ever started.
if (!/data-testid="version-entry"/.test(history)) {
  throw new Error('[probe] the history seed produced no entries — nothing below would mean anything');
}
if (!/data-testid="version-detail"/.test(history)) {
  throw new Error('[probe] the history seed produced no detail panel');
}
if (!/data-testid="editor-secondary-actions"/.test(topBar)) {
  throw new Error('[probe] the top bar rendered no secondary cluster');
}

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: ['./src/**/*.{js,jsx}'],
})]).process(readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8'), { from: undefined })).css;

const GROUP = '<fieldset class="mb-5 border-t border-[var(--surface-border)] pt-3">'
  + '<legend class="pr-2 text-xs font-bold uppercase tracking-wider text-9e-slate-dp-50">ประวัติการเผยแพร่</legend>';

const script = `
const n = (v) => Math.round(v * 100) / 100;
const q = (sel, root = document) => {
  const el = root.querySelector(sel);
  if (!el) throw new Error('[probe] selector found nothing: ' + sel);
  return el;
};
const qa = (sel, root = document) => {
  const els = [...root.querySelectorAll(sel)];
  if (!els.length) throw new Error('[probe] selector found nothing: ' + sel);
  return els;
};
const box = (el) => ({ w: n(el.getBoundingClientRect().width), h: n(el.getBoundingClientRect().height) });

const dialog = q('#dialog');
const body = q('#dialog-body');
const entries = qa('[data-testid="version-entry"]', body);
const detail = q('[data-testid="version-detail"]', body);
const rail = entries[0].closest('ul').parentElement;
const dots = qa('[data-testid="version-dot"]', body);

/**
 * EVERY BOX IN THE DIALOG, asked whether it scrolls. Round 13's split says the
 * body is the one scrolling region; a second one is the defect.
 */
const scrollers = [...dialog.querySelectorAll('*')]
  .filter((el) => el.scrollHeight - el.clientHeight > 1 && getComputedStyle(el).overflowY !== 'visible')
  .map((el) => (el.id || el.getAttribute('data-testid') || el.tagName.toLowerCase())
    + ' (' + n(el.scrollHeight) + ' in ' + n(el.clientHeight) + ')');

const bar = q('#topbar');
const cluster = q('[data-testid="editor-secondary-actions"]', bar);
const publish = q('[data-testid="publish-button"]', bar);
const stateLine = q('[data-testid="editor-state-line"]', bar);
const title = q('#topbar p');

document.getElementById('out').textContent = JSON.stringify({
  viewport: window.innerWidth + ' x ' + window.innerHeight,

  '-- 1. the dialog rounds 12/13 fixed --': '',
  dialogBox: box(dialog),
  DIALOG_IS_920x680: Math.abs(box(dialog).w - 920) < 1 && Math.abs(box(dialog).h - 680) < 1,
  navWidth: n(q('#dialog-nav').getBoundingClientRect().width),
  bodyContentBox: { w: n(body.clientWidth), h: n(body.clientHeight) },

  '-- 2. the two columns --': '',
  railBox: box(rail),
  detailBox: box(detail),
  gapBetween: n(detail.getBoundingClientRect().left - rail.getBoundingClientRect().right),
  columnsSideBySide: Math.abs(rail.getBoundingClientRect().top - detail.getBoundingClientRect().top) < 2,
  MEASURED_entries: entries.length,
  MEASURED_dots: dots.length,
  entryPitch: entries.length > 1
    ? n(entries[1].getBoundingClientRect().top - entries[0].getBoundingClientRect().top)
    : null,
  timelineHeight: n(entries[0].closest('ul').getBoundingClientRect().height),

  '-- 3. ONE scrolling region, per round 13 --': '',
  bodyScrolls: body.scrollHeight - body.clientHeight > 1,
  bodyOverflowBy: n(body.scrollHeight - body.clientHeight),
  SECOND_SCROLLBARS: scrollers.filter((s) => !s.startsWith('dialog-body')),
  NO_SECOND_SCROLLBAR: scrollers.filter((s) => !s.startsWith('dialog-body')).length === 0,
  detailStaysWithReader: getComputedStyle(detail).position === 'sticky',

  '-- 4. the regrouped top bar --': '',
  topBarBox: box(bar),
  topBarWraps: bar.getBoundingClientRect().height > 70,
  titleLeadsLine: n(title.getBoundingClientRect().left) <= n(q('[data-testid="pending-draft-chip"]', bar).getBoundingClientRect().left),
  clusterBox: box(cluster),
  publishBox: box(publish),
  gapClusterToPublish: n(publish.getBoundingClientRect().left - cluster.getBoundingClientRect().right),
  MEASURED_clusterButtons: cluster.querySelectorAll('button').length,
  publishOutsideCluster: !cluster.contains(publish),
  stateLineHeight: n(stateLine.getBoundingClientRect().height),
  stateLineWraps: n(stateLine.getBoundingClientRect().height) > 22,
}, null, 2);
`;

const page = (w) => [
  '<!doctype html><html><head><meta charset="utf-8"><style>', css,
  'body{margin:0;background:#fff}', '</style></head><body>',
  // The top bar, at the real width, in the shell's own band.
  '<div id="topbar" style="width:' + w + 'px">', topBar, '</div>',
  // The dialog, reproduced from the classes checked above.
  '<div id="dialog" class="', SHELL, ' -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-lg ', SHELL_H, '">',
  '  <div class="flex min-h-[93px] shrink-0 items-start justify-between border-b border-[var(--surface-border)] px-5 pb-4 pt-5">',
  '    <div class="min-w-0"><p class="text-xs font-bold uppercase tracking-widest text-9e-slate-dp-50">PAGE SETTINGS</p>',
  '    <h2 class="mt-0.5 text-xl leading-7 text-9e-navy">ตั้งค่าหน้า</h2>',
  '    <p class="mt-1 text-xs text-9e-slate-dp-50">จัดการข้อมูลหน้า SEO, Structured Data และ Preview Access</p></div></div>',
  '  <div class="flex min-h-0 flex-1 flex-col">',
  '    <div class="flex min-h-0 flex-1 flex-col sm:flex-row">',
  '      <nav id="dialog-nav" class="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-hover)] ', NAV, '"></nav>',
  '      <div id="dialog-body" class="', BODY, '">', GROUP, history, '</fieldset></div>',
  '    </div>',
  '    <p class="', FOOT, ' bg-[var(--surface-muted)] px-5 text-xs text-9e-slate-dp-50">บันทึกแล้ว</p>',
  '  </div>',
  '</div>',
  '<pre id="out"></pre>',
  '<script>try{', script, '}catch(e){document.getElementById("out").textContent="[probe] "+e.message}</script>',
  '</body></html>',
].join('\n');

const dir = mkdtempSync(path.join(tmpdir(), 'r41layout-'));
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [w, h] of [[1440, 900], [1366, 768]]) {
  const file = path.join(dir, 'layout-' + w + '.html');
  writeFileSync(file, page(w));
  const dom = execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
    '--window-size=' + w + ',' + h, '--virtual-time-budget=4000', '--dump-dom',
    'file:///' + file.split(path.sep).join('/'),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  const text = m
    ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    : '[probe] no output - page did not run';
  console.log('\n== viewport ' + w + ' x ' + h + ' ==');
  console.log(text);
  // Round 40's rule, at the Node end: a probe that measured nothing must FAIL,
  // not print a plausible-looking absence.
  if (text.startsWith('[probe]')) throw new Error(text);
  const out = JSON.parse(text);
  for (const key of ['MEASURED_entries', 'MEASURED_dots', 'MEASURED_clusterButtons']) {
    if (!out[key]) throw new Error('[probe] ' + key + ' is ' + out[key] + ' — the probe measured nothing');
  }
  if (out.MEASURED_entries !== ROWS.length) {
    throw new Error('[probe] measured ' + out.MEASURED_entries + ' entries for ' + ROWS.length + ' rows');
  }
  /**
   * 920 is unconditional. 680 is the DECLARED height and the shell's own
   * `max-h-[calc(100dvh-4rem)]` legitimately shortens it on a window under
   * 744px tall — which 1366 x 768 is, once Chrome's chrome is subtracted. Both
   * are asserted, so a silent widening cannot pass itself off as that clamp.
   */
  if (Math.abs(out.dialogBox.w - 920) > 1) throw new Error('[probe] the dialog is not 920 wide');
  const clamped = Number(out.viewport.split(' x ')[1]) - 64;
  const expectedH = Math.min(680, clamped);
  if (Math.abs(out.dialogBox.h - expectedH) > 1) {
    throw new Error('[probe] dialog height ' + out.dialogBox.h
      + ' is neither 680 nor the viewport clamp ' + clamped);
  }
}
console.log('\n[probe] html in', dir);
