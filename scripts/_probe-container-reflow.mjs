/**
 * ROUND 25 — does `container`'s width control work, and does anything BREAK
 * when it does?
 *
 * ── WHY A BROWSER, AND WHY THIS STEP NEEDED ONE MOST ───────────────────────
 * The other three steps of this sequence were colour-only. This one changes
 * LAYOUT: a container holds nested sections, so widening it reflows everything
 * inside. A markup diff cannot tell a reflow from a break — both are "the class
 * string changed" — and JSDOM has no layout engine at all, so the only honest
 * instrument is real Chrome with the real compiled Tailwind.
 *
 * ── WHAT IT MEASURES ───────────────────────────────────────────────────────
 * 1. THE CONTROL ITSELF. A bare `container` at all four `containerWidth`
 *    values. Round 18 measured 640 / 768 / 768 / 768 — three settings that
 *    paint the same pixels. Four distinct numbers is the fix.
 * 2. THE TYPE DISTINCTION. `container` and `full_width` at their DEFAULTS.
 *    The clamp was the only thing separating them, so this is what proves the
 *    distinction survived being moved into the schema. It is a MEASUREMENT and
 *    not a class check on purpose: after the clamp goes, the two differ by a
 *    centring utility that has no visual effect on its own, so comparing class
 *    strings would report a difference that is not there.
 * 3. REFLOW. Nested children at every width; a container inside a container;
 *    and the two types whose column count is viewport-driven — `card_grid` and
 *    `two_column`. Widths, heights and overflow are reported for each, because
 *    "it got wider" and "it burst out of its box" look identical in markup.
 *
 * OVERFLOW is measured as scrollWidth against clientWidth on the section box —
 * a child painting wider than its parent is the failure this step could plausibly
 * produce, and it is invisible to every other instrument here.
 *
 * `--json <file>` writes the measurements so a run against the pre-change code
 * and a run against this one can be compared directly.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-container-reflow.mjs
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
const { SectionRenderer } = await import('@/components/pageBuilder/SectionRenderer');
const { CONTAINER_WIDTHS } = await import('@/lib/schemas/pageBuilder');
const { themeStyle } = await import('@/lib/pageBuilder/presets');

const jsonAt = process.argv.indexOf('--json');
const JSON_OUT = jsonAt > -1 ? process.argv[jsonAt + 1] : null;

let seq = 0;
const sec = (type, content, settings = {}) => ({
  id: `s${++seq}`, type, name: '', enabled: true, sortOrder: 0,
  content, settings: { spacingTop: 'none', spacingBottom: 'none', ...settings },
  style: {}, layout: {}, advanced: {},
});

const heading = (text) => sec('heading', { text, level: 'h3', align: 'left' });
const richText = () => sec('rich_text', {
  html: '<p>ข้อความตัวอย่างที่ยาวพอจะไหลไปเต็มความกว้างของคอลัมน์ที่มันอยู่ เพื่อให้วัดการจัดวางได้จริง</p>',
});

/**
 * The cases. Each is one section tree rendered at one width, so a row of the
 * output is directly comparable across widths and across the before/after runs.
 */
const CASES = [];
for (const w of CONTAINER_WIDTHS) {
  CASES.push({ id: `bare-${w}`, what: 'container, no children', width: w,
    section: sec('container', { children: [] }, { containerWidth: w }) });

  CASES.push({ id: `kids-${w}`, what: 'container + heading + rich_text', width: w,
    section: sec('container', { children: [heading('หัวข้อ'), richText()] }, { containerWidth: w }) });

  CASES.push({ id: `nested-${w}`, what: 'container inside container', width: w,
    section: sec('container', {
      children: [sec('container', { children: [heading('ลูกใน')] })],
    }, { containerWidth: w }) });

  CASES.push({ id: `grid-${w}`, what: 'card_grid (3 col) inside container', width: w,
    section: sec('container', {
      children: [{ ...sec('card_grid', { children: [heading('ก'), heading('ข'), heading('ค')] }), layout: { columns: 3 } }],
    }, { containerWidth: w }) });

  CASES.push({ id: `two-${w}`, what: 'two_column (50-50) inside container', width: w,
    section: sec('container', {
      children: [{ ...sec('two_column', { left: [heading('ซ้าย')], right: [heading('ขวา')] }), layout: { ratio: '50-50' } }],
    }, { containerWidth: w }) });
}

// The type distinction, at DEFAULTS — no containerWidth passed, so each type's
// own schema default is what decides. Parsed through the real union so the
// default comes from the schema and not from this file.
const { sectionSchema } = await import('@/lib/schemas/pageBuilder');
for (const type of ['container', 'full_width']) {
  const parsed = sectionSchema.parse({
    id: `d-${type}`, type,
    content: { children: [heading('เนื้อหา'), richText()] },
    settings: { spacingTop: 'none', spacingBottom: 'none' },
  });
  CASES.push({ id: `default-${type}`, what: `${type} at its DEFAULT width`, width: parsed.settings.containerWidth, section: parsed });
}

const blocks = CASES.map((c) => `<div class="probe" data-id="${c.id}">${
  renderToStaticMarkup(createElement(SectionRenderer, { section: c.section, resolvedData: null, path: null }))
}</div>`);

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);
const themeVars = Object.entries(themeStyle('default')).map(([k, v]) => `${k}:${v}`).join(';');

// 1440px — a desktop viewport, where all four width values are reachable. At a
// narrow viewport they all collapse to the screen and the question answers
// itself.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${css}
body{margin:0;width:1440px}
.probe{width:1440px}
</style></head><body>
<div id="theme" style="${themeVars}">
${blocks.join('\n')}
</div>
<pre id="out"></pre>
<script>
const rows = [];
for (const p of document.querySelectorAll('.probe')) {
  const section = p.querySelector('section');
  const boxEl = section.querySelector(':scope > div');            // the mx-auto px-4 width box
  const inner = boxEl.querySelector(':scope > div');              // the component's own root
  const kids = [...(inner ? inner.children : [])];

  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : null);

  /**
   * THE CELLS, not just the wrapper. A card_grid section reported at 1168 says
   * nothing about whether it is still three columns — the question F actually
   * asks. So for the grid and two-column cases the innermost grid/flex root is
   * found and its OWN children are measured: that is the column set.
   *
   * Column COUNT is derived from distinct y-offsets: cells sharing a row have
   * the same top, so the number of cells on the first row is the column count
   * the browser resolved, whatever the class said.
   */
  const gridRoot = inner ? inner.querySelector('section > div > div') : null;
  const cells = gridRoot ? [...gridRoot.children] : [];
  const firstRowTop = cells.length ? Math.round(cells[0].getBoundingClientRect().top) : null;
  const columnsResolved = cells.filter((c) => Math.round(c.getBoundingClientRect().top) === firstRowTop).length;

  rows.push({
    id: p.dataset.id,
    box: w(boxEl),
    inner: w(inner),
    kidWidths: kids.map(w),
    cellWidths: cells.map(w),
    columnsResolved: cells.length ? columnsResolved : null,
    gridTemplate: gridRoot ? getComputedStyle(gridRoot).gridTemplateColumns : null,
    // The failure this step could plausibly produce: content painting wider
    // than the box that is supposed to contain it.
    overflowPx: boxEl ? Math.max(0, boxEl.scrollWidth - boxEl.clientWidth) : null,
    innerOverflowPx: inner ? Math.max(0, inner.scrollWidth - inner.clientWidth) : null,
    height: section ? Math.round(section.getBoundingClientRect().height) : null,
  });
}
document.getElementById('out').textContent = JSON.stringify(rows, null, 1);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'cflow-'));
const file = path.join(dir, 'c.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1440,2400', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.log('[probe] page did not run'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

const label = Object.fromEntries(CASES.map((c) => [c.id, c.what]));

console.log('id'.padEnd(16) + 'what'.padEnd(36) + 'box'.padStart(6) + 'inner'.padStart(7) + '  children            ovf');
for (const c of CASES) {
  const r = byId[c.id];
  console.log(
    c.id.padEnd(16) + label[c.id].padEnd(36)
    + String(r.box).padStart(6) + String(r.inner).padStart(7)
    + '  ' + (r.kidWidths.join(', ') || '-').padEnd(20)
    + (r.overflowPx || r.innerOverflowPx ? `BOX ${r.overflowPx} / INNER ${r.innerOverflowPx}` : '0'),
  );
}

console.log('\n── E: the control itself — distinct painted widths per case family ──');
for (const fam of ['bare', 'kids', 'nested', 'grid', 'two']) {
  const vals = CONTAINER_WIDTHS.map((w) => byId[`${fam}-${w}`].inner);
  const set = [...new Set(vals)];
  console.log(`${fam.padEnd(8)} ${vals.join(' / ').padEnd(28)} -> ${set.length} distinct`);
}

console.log('\n── B: the type distinction at DEFAULTS ──');
const dc = byId['default-container'], df = byId['default-full_width'];
console.log(`  container  default width painted: ${dc.inner}`);
console.log(`  full_width default width painted: ${df.inner}`);
console.log(`  distinguishable: ${dc.inner !== df.inner ? 'YES' : 'NO — the two types collapsed'}`);

console.log('\n── F: the COLUMN sets — do card_grid / two_column still resolve? ──');
for (const fam of ['grid', 'two']) {
  for (const w of CONTAINER_WIDTHS) {
    const r = byId[`${fam}-${w}`];
    console.log(`  ${fam}-${w.padEnd(7)} cells [${r.cellWidths.join(', ')}]  columns=${r.columnsResolved}  ${r.gridTemplate ?? ''}`);
  }
}
for (const fam of ['grid', 'two']) {
  const counts = [...new Set(CONTAINER_WIDTHS.map((w) => byId[`${fam}-${w}`].columnsResolved))];
  console.log(`  ${fam}: column count across the four widths -> ${counts.join(', ')} (${counts.length === 1 ? 'STABLE' : 'CHANGES with width'})`);
}

console.log('\n── F: overflow anywhere? ──');
const bad = rows.filter((r) => r.overflowPx > 0 || r.innerOverflowPx > 0);
console.log(bad.length ? bad.map((r) => `  ${r.id}: box ${r.overflowPx}px, inner ${r.innerOverflowPx}px`).join('\n') : '  none — nothing paints wider than its box');

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  console.log(`\n[probe] measurements -> ${JSON_OUT}`);
}
console.log('[probe] html at', file);
