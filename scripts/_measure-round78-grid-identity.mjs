/**
 * ROUND 78 §B — what still separates `highlight_grid` from `card_grid` once
 * the accent bar is gone. A finding for the record, not an argument.
 *
 * A previous survey put the difference at "the per-child box's padding and
 * radius only, with both backgrounds transparent". That is CITED, not measured,
 * and the box's class attribute plainly carries `bg-9e-ice/50` — so this
 * renders both types with the same children and reads the real computed values
 * out of Chrome, in both modes.
 *
 * jsdom cannot answer this: it compiles no Tailwind and returns "" for every
 * computed style, so a jsdom reading would report "both transparent" for
 * exactly the reason the previous survey did.
 *
 * ── THE CONTROL ───────────────────────────────────────────────────────────
 * Two renderers that produced identical trees would make every difference
 * below read as zero, which is indistinguishable from "they are the same
 * component". So the run asserts that at least one measured property DIFFERS,
 * and dies if none does.
 *
 * Nothing is written into public/.
 *
 * Run:
 *   node --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round78-grid-identity.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require_ = createRequire(path.join(ROOT, 'noop.js'));
function die(m) { console.error('X ' + m); process.exit(1); }

async function compileGlobals(content) {
  const src = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
  const config = { presets: [require_(path.join(ROOT, 'tailwind.config.js'))], content };
  return (await postcss([tailwindcss(config)]).process(src, { from: undefined })).css;
}

const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');

const leaf = (id) => ({
  id, type: 'custom_html', enabled: true,
  content: { html: '<span>เนื้อหา</span>' },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
});
const grid = (id, type) => ({
  id, type, enabled: true,
  content: { children: [leaf(id + '-a'), leaf(id + '-b')] },
  settings: { spacingTop: 'none', spacingBottom: 'none' },
  layout: { columns: 2 },
  // An accent is SET on both, so "does the accent still reach anything the
  // component itself paints" is answered rather than assumed.
  style: { accentColor: 'green' },
});

const body = ['card_grid', 'highlight_grid']
  .map((t) => `<div data-t="${t}">${renderToStaticMarkup(createElement(SectionRenderer, { section: grid(t, t), depth: 0, resolvedData: {} }))}</div>`)
  .join('\n');
const css = await compileGlobals([{ raw: body, extension: 'html' }]);
const doc = (dark) => `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8">`
  + `<style>${css}</style><style>body{margin:0;width:1200px}</style></head><body>${body}</body></html>`;

const READER = () => {
  const out = {};
  for (const scope of document.querySelectorAll('[data-t]')) {
    // The element wrapping the FIRST child: for highlight_grid the per-child
    // box, for card_grid the child <section> itself. Addressed structurally so
    // neither type is given a selector the other cannot match.
    const gridEl = scope.querySelector('div.grid') || scope.querySelector('div');
    const firstWrapper = gridEl ? gridEl.firstElementChild : null;
    const cs = firstWrapper ? getComputedStyle(firstWrapper) : null;
    const g = gridEl ? getComputedStyle(gridEl) : null;
    out[scope.dataset.t] = {
      gridGap: g ? g.gap : null,
      gridTemplateColumns: g ? g.gridTemplateColumns : null,
      wrapperTag: firstWrapper ? firstWrapper.tagName : null,
      backgroundColor: cs ? cs.backgroundColor : null,
      borderTopWidth: cs ? cs.borderTopWidth : null,
      borderLeftWidth: cs ? cs.borderLeftWidth : null,
      borderLeftColor: cs ? cs.borderLeftColor : null,
      borderColor: cs ? cs.borderTopColor : null,
      borderRadius: cs ? cs.borderTopLeftRadius : null,
      paddingLeft: cs ? cs.paddingLeft : null,
      paddingTop: cs ? cs.paddingTop : null,
      display: cs ? cs.display : null,
    };
  }
  return out;
};

const { browser, close } = await launch();
const report = {};
try {
  for (const [label, dark] of [['light', false], ['dark', true]]) {
    const page = await openPage(browser, { width: 1200, height: 1200 });
    try {
      await page.eval((h) => { document.open(); document.write(h); document.close(); }, doc(dark));
      report[label] = await page.eval(READER);
    } finally { await page.close().catch(() => {}); }
  }
} finally { await close().catch(() => {}); }

const keys = Object.keys(report.light.card_grid);
const differing = keys.filter((k) => report.light.card_grid[k] !== report.light.highlight_grid[k]);
if (differing.length === 0) die('no measured property differs between the two types — either they are now identical or the reader addressed the same element twice');

console.log(JSON.stringify({
  light: report.light,
  dark: report.dark,
  differingInLight: differing.map((k) => ({
    property: k, card_grid: report.light.card_grid[k], highlight_grid: report.light.highlight_grid[k],
  })),
  identicalInLight: keys.filter((k) => !differing.includes(k)),
}, null, 2));
