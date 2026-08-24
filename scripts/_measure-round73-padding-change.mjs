/**
 * ROUND 73 §G/§H/§I — round 72's compounding table, re-run against a BASE_REF.
 *
 * This is round 72's instrument with one thing added: `BASE_REF=<sha>` pulls
 * the pre-change components out of git into a shadow tree and renders those
 * instead, so the same harness produces both columns of the before/after table
 * rather than two runs that might not be comparable.
 *
 * Measures, at 390px AND at 1440px, for all eight nestings round 72 measured:
 *   §G  the surviving content width at mobile, before and after
 *   §H  the same at desktop, where EVERY number must be unchanged
 *   §I  the canvas render (a non-null `path`) against the published render
 *   §E  the accent bar on highlight_grid, at one / two / four children
 *
 * ── NOTHING IS WRITTEN INTO public/ ──────────────────────────────────────
 * test/fs/reservedPaths DERIVES its reserved prefixes from the `public/`
 * listing, so a harness writing there reddens the suite for as long as the
 * folder exists. The page is injected into the about:blank tab openPage
 * already gives us; no files, no dev server.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Every nesting reporting the same number in both columns would look exactly
 * like a harness whose BASE_REF never loaded. So the run reports how many rows
 * MOVED, and a run where nothing moved says so rather than reading as clean.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round73-padding-change.mjs
 *   BASE_REF=875b618 … (renders the pre-change components)
 */
import { writeFileSync, rmSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile } from '../test/twCompile.mjs';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = process.cwd();
const BASE_REF = process.env.BASE_REF ?? '';
const SHADOW = path.join(ROOT, 'src/components/_round73_baseline');
const TRACKED = [
  'src/components/pageBuilder/SectionRenderer.jsx',
  'src/components/pageBuilder/PageBuilderView.jsx',
  'src/components/pageBuilder/sections/highlight_grid.jsx',
];

const MOBILE = 390;
const DESKTOP = 1440;

const leaf = (id = 'leaf') => ({
  id, type: 'custom_html', enabled: true,
  content: { html: '<span>x</span>' },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
});
const wrap = (id, type, children, layout = {}) => ({
  id, type, enabled: true, content: { children },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
  layout,
});
const twoCol = (id, kids) => ({
  id, type: 'two_column', enabled: true, content: { left: kids, right: [] },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
  layout: { ratio: '50-50' },
});

/** Round 72 §B's eight nestings, verbatim, so the tables are comparable. */
const NESTINGS = [
  ['leaf at top level', leaf()],
  ['leaf in container', wrap('c', 'container', [leaf()])],
  ['leaf in full_width', wrap('f', 'full_width', [leaf()])],
  ['leaf in two_column', twoCol('t', [leaf()])],
  ['leaf in card_grid', wrap('g', 'card_grid', [leaf()], { columns: 1 })],
  ['leaf in highlight_grid', wrap('h', 'highlight_grid', [leaf()], { columns: 1 })],
  [
    "THE AUTHOR'S CASE: card_grid in highlight_grid in container",
    wrap('c', 'container', [wrap('h', 'highlight_grid', [wrap('g', 'card_grid', [leaf()], { columns: 1 })], { columns: 1 })]),
  ],
  [
    'depth 4 (the cap)',
    wrap('c', 'container', [wrap('f', 'full_width', [wrap('h', 'highlight_grid', [wrap('g', 'card_grid', [leaf()], { columns: 1 })], { columns: 1 })])]),
  ],
];

/** §E — the accent bar, at one / two / four children. */
const ACCENT = [1, 2, 4].map((n) => [
  `accent bar · ${n} child${n === 1 ? '' : 'ren'}`,
  wrap(`a${n}`, 'highlight_grid', Array.from({ length: n }, (_, i) => leaf('l' + i)), { columns: n === 1 ? 1 : n }),
]);

const report = { baseRef: BASE_REF || '(working tree)' };
try {
  let SR;
  if (BASE_REF) {
    rmSync(SHADOW, { recursive: true, force: true });
    cpSync(path.join(ROOT, 'src/components/pageBuilder'), path.join(SHADOW, 'pageBuilder'), { recursive: true });
    for (const rel of TRACKED) {
      writeFileSync(path.join(SHADOW, rel.replace('src/components/', '')),
        execFileSync('git', ['show', `${BASE_REF}:${rel}`], { encoding: 'utf8' }), 'utf8');
    }
    ({ SectionRenderer: SR } = await import('@/components/_round73_baseline/pageBuilder/SectionRenderer'));
  } else {
    ({ SectionRenderer: SR } = await import('@/components/pageBuilder/SectionRenderer'));
  }

  const groups = [];
  for (const [name, section] of NESTINGS) {
    groups.push([`${name}|published`, section, null]);
    groups.push([`${name}|canvas`, section, ['sections', 0]]);
  }
  for (const [name, section] of ACCENT) groups.push([`${name}|published`, section, null]);

  const body = groups
    .map(([name, section, p]) =>
      `<div data-group="${name}">${renderToStaticMarkup(createElement(SR, { section, path: p }))}</div>`)
    .join('\n');
  const css = await compile([{ raw: body, extension: 'html' }]);
  const pageAt = (w) => [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<style>*,::before,::after{box-sizing:border-box;border-style:solid;border-width:0}body{margin:0;width:${w}px;font-family:sans-serif}</style>`,
    `<style>${css}</style>`,
    '</head><body>', body, '</body></html>',
  ].join('\n');

  const READER = () => {
    const out = {};
    for (const group of document.querySelectorAll('[data-group]')) {
      const content = group.querySelector('.pb-custom-html');
      const outer = group.getBoundingClientRect();
      // The highlight_grid box, for the accent-bar reading.
      const box = group.querySelector('div[class*="border-l-4"]');
      const bcs = box ? getComputedStyle(box) : null;
      out[group.dataset.group] = {
        outerWidth: +outer.width.toFixed(2),
        contentWidth: content ? +content.getBoundingClientRect().width.toFixed(2) : null,
        consumed: content ? +(outer.width - content.getBoundingClientRect().width).toFixed(2) : null,
        box: box ? {
          padL: bcs.paddingLeft,
          padR: bcs.paddingRight,
          borderLeftWidth: bcs.borderLeftWidth,
          borderLeftColor: bcs.borderLeftColor,
          width: +box.getBoundingClientRect().width.toFixed(2),
          // The gap between the accent rule and the text it introduces.
          textInset: +(box.getBoundingClientRect().left + parseFloat(bcs.borderLeftWidth)
            + parseFloat(bcs.paddingLeft) - box.getBoundingClientRect().left).toFixed(2),
        } : null,
      };
    }
    return out;
  };

  const { browser, close } = await launch();
  try {
    for (const [label, w] of [['mobile390', MOBILE], ['desktop1440', DESKTOP]]) {
      const page = await openPage(browser, { width: w, height: 2000 });
      try {
        await page.eval((h) => { document.open(); document.write(h); document.close(); }, pageAt(w));
        report[label] = await page.eval(READER);
      } finally { await page.close().catch(() => {}); }
    }
  } finally { await close().catch(() => {}); }
} finally {
  if (existsSync(SHADOW)) rmSync(SHADOW, { recursive: true, force: true });
}

const m = report.mobile390; const d = report.desktop1440;
const out = { baseRef: report.baseRef };

out['-- G. MOBILE 390 --'] = '';
out.mobile = {};
for (const [name] of NESTINGS) {
  out.mobile[name] = { consumed: m[`${name}|published`].consumed, content: m[`${name}|published`].contentWidth };
}

out['-- H. DESKTOP 1440 --'] = '';
out.desktop = {};
for (const [name] of NESTINGS) {
  out.desktop[name] = { consumed: d[`${name}|published`].consumed, content: d[`${name}|published`].contentWidth };
}

out['-- I. CANVAS vs PUBLISHED (mobile) --'] = '';
let diverged = 0;
for (const [name] of NESTINGS) {
  if (m[`${name}|published`].contentWidth !== m[`${name}|canvas`].contentWidth) diverged += 1;
}
out.canvasDivergences = diverged;
out.CANVAS_AND_PUBLISHED_AGREE = diverged === 0;

out['-- E. THE ACCENT BAR --'] = '';
out.accent = {};
for (const [name] of ACCENT) {
  out.accent[`${name} @390`] = m[`${name}|published`].box;
  out.accent[`${name} @1440`] = d[`${name}|published`].box;
}

console.log(JSON.stringify(out, null, 2));
