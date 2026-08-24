/**
 * ROUND 78 §M — LIGHT MODE IS BYTE-IDENTICAL, proved over every stored shape.
 *
 * The claim commit 2 rests on: converting `BACKGROUND_CLASS` and
 * `THEME.pageClass` from literal Tailwind colours to `--pb-bg-*` variables
 * changes NOTHING in light mode, because each variable's `:root` value is the
 * literal it replaced. This measures that instead of asserting it.
 *
 * ── HOW THE "BEFORE" IS PRODUCED ─────────────────────────────────────────
 * Not by hand. The pre-change `presets.js` is read out of git (`BASE_REF`,
 * default HEAD — commit 1) and BOTH versions are parsed for their
 * BACKGROUND_CLASS and THEME tables. The differences between them become a
 * substitution map, which is applied to the rendered markup to produce the
 * pre-change markup. So the map cannot drift from the change it describes: if
 * a key were converted and this script did not know, the diff would produce
 * the entry automatically.
 *
 * Both markups are then compiled and loaded in ONE light-mode document, and
 * the computed `background-color` and `color` of every section wrapper and
 * page shell are compared pairwise.
 *
 * ── THE CONTROLS, AND THERE ARE THREE ────────────────────────────────────
 * "Zero differing" is also what a comparison that never ran prints.
 *   1. The substitution map must be NON-EMPTY, and applying it must actually
 *      change the markup — a no-op substitution would compare markup to
 *      itself.
 *   2. No post-change class string may survive in the "before" markup.
 *   3. THE SAME COMPARISON IS RUN IN DARK MODE and must report differences.
 *      Light identity only means something if the instrument can see a
 *      difference when there is one.
 *
 * Shapes come from the real corpus (`page_builder_pages`, NOT `pagebuilders`;
 * `snapshot.sections`, NOT `content.sections`) plus a synthetic section for
 * every BACKGROUNDS key and every PAGE_THEMES value, because the corpus uses
 * only four of the seven keys and two of the seven themes — the unused ones
 * are exactly where an unmeasured regression would hide.
 *
 * Nothing is written into public/.
 *
 * Run:
 *   node --env-file=.env.local --import ./scripts/_probe-panel-register.mjs \
 *     scripts/_measure-round78-light-identity.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { launch, openPage } from '../test/browser/cdp.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require_ = createRequire(path.join(ROOT, 'noop.js'));
const BASE_REF = process.env.BASE_REF ?? 'HEAD';
function die(m) { console.error('X ' + m); process.exit(1); }

// ── the substitution map, DERIVED from the two versions of presets.js ──────
const NOW = readFileSync(path.join(ROOT, 'src/lib/pageBuilder/presets.js'), 'utf8');
const BEFORE = execFileSync('git', ['show', `${BASE_REF}:src/lib/pageBuilder/presets.js`],
  { encoding: 'utf8', cwd: ROOT });

function backgroundTable(src) {
  const start = src.indexOf('const BACKGROUND_CLASS = {');
  if (start < 0) die('BACKGROUND_CLASS not found');
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/^\s{2}(\w+):\s*'([^']*)'/gm)) out[m[1]] = m[2];
  return out;
}
function themeTable(src) {
  const start = src.indexOf('const THEME = {');
  if (start < 0) die('THEME not found');
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/^\s{2}(\w+):\s*\{\s*pageClass:\s*'([^']*)'/gm)) out[m[1]] = m[2];
  return out;
}

const subs = [];
for (const [k, nowCls] of Object.entries(backgroundTable(NOW))) {
  const wasCls = backgroundTable(BEFORE)[k];
  if (wasCls !== undefined && wasCls !== nowCls && nowCls !== '') subs.push([nowCls, wasCls, `background:${k}`]);
}
for (const [t, nowCls] of Object.entries(themeTable(NOW))) {
  const wasCls = themeTable(BEFORE)[t];
  if (wasCls !== undefined && wasCls !== nowCls) subs.push([nowCls, wasCls, `theme:${t}`]);
}
// CONTROL 1a — an empty map means nothing changed, so nothing is being proved.
if (subs.length === 0) die(`no differences between ${BASE_REF} and the working tree — there is nothing to prove`);

// ── the shapes ────────────────────────────────────────────────────────────
const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { themeSurface, themeStyle } = await import('@/lib/pageBuilder/presets');
const { BACKGROUNDS } = await import('@/lib/schemas/sections/base');
const { PAGE_THEMES } = await import('@/lib/schemas/pageBuilder');

const uri = process.env.MONGODB_URI;
if (!uri) die('MONGODB_URI missing — run with --env-file=.env.local');
await mongoose.connect(uri, { dbName: process.env.MONGODB_DB_NAME });
const db = mongoose.connection.db;
for (const name of ['page_builder_pages', 'page_versions']) {
  if (!(await db.listCollections({ name }).toArray()).length) die(`collection "${name}" missing — a zero from it would be a false zero`);
}
const pages = await db.collection('page_builder_pages').find({}).toArray();
const versions = await db.collection('page_versions').find({}).toArray();
await mongoose.disconnect();

const shapes = [];
for (const p of pages) shapes.push([`page:${p.slug}`, p.theme ?? 'default', p.sections ?? []]);
let snapCount = 0;
for (const v of versions) {
  const s = v.snapshot?.sections;
  if (Array.isArray(s) && s.length) { shapes.push([`snapshot:${v._id}`, v.snapshot?.theme ?? 'default', s]); snapCount += s.length; }
}
if (versions.length > 0 && snapCount === 0) die('page_versions non-empty but snapshot.sections yielded zero — the false-zero path');

// Every preset key and every theme, including the ones the corpus never uses.
const synth = (bg) => ({
  id: `s-${bg}`, type: 'heading', enabled: true,
  content: { text: 'หัวข้อ', level: 'h2' },
  settings: { background: bg, spacingTop: 'none', spacingBottom: 'none' },
});
for (const t of PAGE_THEMES) shapes.push([`synthetic:theme=${t}`, t, BACKGROUNDS.map(synth)]);

function renderShape([name, theme, sections]) {
  const { pageClass } = themeSurface(theme);
  const style = Object.entries(themeStyle(theme)).map(([k, v]) => `${k}:${v}`).join(';');
  const inner = [...sections]
    .sort((a, b) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0))
    .map((s, i) => renderToStaticMarkup(createElement(SectionRenderer, { section: s, depth: 0, resolvedData: {}, key: s?.id ?? i })))
    .join('');
  return `<div data-shape="${name}" class="${pageClass}" style="${style}">${inner}</div>`;
}

const afterMarkup = shapes.map(renderShape).join('\n');
let beforeMarkup = afterMarkup;
for (const [nowCls, wasCls] of subs) beforeMarkup = beforeMarkup.split(nowCls).join(wasCls);

// CONTROL 1b — the substitution must actually have changed something.
if (beforeMarkup === afterMarkup) die('the substitution map changed nothing in the markup — the two sides are the same document');
// CONTROL 2 — no post-change class may survive in the "before" side.
for (const [nowCls, , where] of subs) {
  if (beforeMarkup.includes(nowCls)) die(`"${nowCls}" (${where}) survives in the BEFORE markup — the substitution is incomplete`);
}

const body = `<div id="before">${beforeMarkup.replace(/data-shape="/g, 'data-shape="B|')}</div>`
  + `<div id="after">${afterMarkup.replace(/data-shape="/g, 'data-shape="A|')}</div>`;

const cssSrc = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
  content: [{ raw: body, extension: 'html' }],
})]).process(cssSrc, { from: undefined })).css;

const doc = (dark) => `<!doctype html><html class="${dark ? 'dark' : ''}"><head><meta charset="utf-8">`
  + `<style>${css}</style><style>body{margin:0;width:1200px}</style></head><body>${body}</body></html>`;

const READER = () => {
  const out = {};
  for (const scope of document.querySelectorAll('[data-shape]')) {
    const cs = getComputedStyle(scope);
    const rows = [{ el: 'shell', bg: cs.backgroundColor, fg: cs.color }];
    let i = 0;
    for (const sec of scope.querySelectorAll('section')) {
      const s = getComputedStyle(sec);
      rows.push({ el: `section[${i}]`, bg: s.backgroundColor, fg: s.color, img: s.backgroundImage });
      i += 1;
    }
    out[scope.dataset.shape] = rows;
  }
  return out;
};

const { browser, close } = await launch();
const seen = {};
try {
  for (const [label, dark] of [['light', false], ['dark', true]]) {
    const page = await openPage(browser, { width: 1200, height: 4000 });
    try {
      await page.eval((h) => { document.open(); document.write(h); document.close(); }, doc(dark));
      seen[label] = await page.eval(READER);
    } finally { await page.close().catch(() => {}); }
  }
} finally { await close().catch(() => {}); }

function compare(mode) {
  const rows = seen[mode];
  const names = Object.keys(rows).filter((k) => k.startsWith('A|')).map((k) => k.slice(2));
  let cells = 0; const diffs = [];
  for (const n of names) {
    const A = rows[`A|${n}`]; const B = rows[`B|${n}`];
    if (!B) die(`shape "${n}" has no BEFORE counterpart`);
    if (A.length !== B.length) die(`shape "${n}" rendered a different number of sections`);
    for (let i = 0; i < A.length; i += 1) {
      cells += 1;
      if (A[i].bg !== B[i].bg || A[i].fg !== B[i].fg || A[i].img !== B[i].img) {
        diffs.push({ shape: n, el: A[i].el, before: { bg: B[i].bg, fg: B[i].fg }, after: { bg: A[i].bg, fg: A[i].fg } });
      }
    }
  }
  return { shapes: names.length, cells, differing: diffs.length, diffs: diffs.slice(0, 12) };
}

const light = compare('light');
const dark = compare('dark');

// CONTROL 3 — the instrument must be able to see a difference.
if (dark.differing === 0) die('DARK mode reports zero differences too — the comparison cannot detect a change, so the light zero means nothing');

console.log(JSON.stringify({
  baseRef: BASE_REF,
  substitutions: subs.map(([now, was, where]) => ({ where, before: was, after: now })),
  corpus: { pages: pages.length, versions: versions.length, shapesCompared: light.shapes },
  LIGHT_MODE: light,
  DARK_MODE_control: dark,
  LIGHT_IS_BYTE_IDENTICAL: light.differing === 0,
}, null, 2));
