/**
 * ROUND 39 — what a preset colour and a custom colour actually PAINT, in both
 * themes, measured in Chrome.
 *
 * ── WHY A BROWSER AND NOT THE RENDER TIER ──────────────────────────────────
 * The whole claim of this round is a claim about resolution. A preset resolves
 * `--pb-accent-fill` -> `var(--9e-green-50)` -> a `:root` / `.dark` custom
 * property; a custom colour is a literal that resolves to itself. JSDOM
 * resolves NEITHER end of that chain (rounds 23-25 established this three
 * times), so "a preset follows dark mode and a custom one does not" is not a
 * sentence the test tier can evaluate. It can only be measured.
 *
 * Eight cases, each rendered under FOUR conditions: theme=default in light and
 * in dark, theme=corporate_navy (the one dark-surfaced theme), and
 * theme=ai_purple (the one whose DEFAULT ACCENT differs from default's).
 *
 * ── WHAT IT FOUND, AND IT IS NOT WHAT THIS ROUND'S BRIEF ASSUMED ──────────
 * The brief describes preset mode as resolving "through the theme's CSS
 * variables and therefore FOLLOWING dark mode, exactly as today". "Exactly as
 * today" is right. "Follows dark mode" is not — measured:
 *
 *   case                    follows dark mode   follows page theme
 *   preset background       no                  no
 *   custom background       no                  no
 *   preset accent (green)   no                  no
 *   custom accent           no                  no
 *   DEFAULT accent (absent) no                  YES  (#005CFF -> #9124FF)
 *
 * Nothing in the Page Builder's colour system follows dark mode. `bg-9e-ice`
 * and `bg-9e-navy` compile to literal hexes; `--9e-green-50`, `--9e-purple-50`,
 * `--9e-orange-50` and `--9e-cyan-50` are re-declared in `.dark` to the SAME
 * values, and `--9e-action`, `--9e-navy` and `--9e-ice` are not re-declared
 * there at all. 91 custom properties DO differ between the two schemes — every
 * one of them in the `--surface-*` / `--page-*` / `--text-*` families, which
 * the colour presets do not resolve through. That is a deliberate design (a
 * brand green is the same green on both canvases), not a defect, and it is
 * recorded here because the round's caveat copy would otherwise have promised
 * a contrast that does not exist.
 *
 * The ONE thing that follows the page theme is the DEFAULT accent — a section
 * that sets none inherits `THEME[theme].accent`. That is the real difference
 * custom mode gives up, and it is what the copy says.
 *
 * ── A LIMIT OF THIS PROBE, STATED ────────────────────────────────────────
 * `theme-default-bg` reads rgba(0,0,0,0): a `background: 'default'` section
 * paints NOTHING and shows the wrapper above it. Its "no" means "the section is
 * transparent", not "the theme does not vary" — the theme's surface class is on
 * PageBuilderView, a different element from the one measured here.
 *
 * ── THE CONTROL IS NOT OPTIONAL ──────────────────────────────────────────
 * Six identical light/dark pairs and a `.dark` block that never applied produce
 * the same output. So `--surface-hover` is read from both roots first and must
 * differ (#F8FAFD vs #20344C) before any pair below means anything.
 *
 * Read through the REAL renderer, so what is measured is what publishes.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-round39-colours-browser.mjs
 */
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire as _cr } from 'node:module';
import { SectionRenderer } from '@/components/pageBuilder/SectionRenderer';
import { themeStyle, themeSurface } from '@/lib/pageBuilder/presets';

const require_ = _cr(import.meta.url);
const ROOT = process.cwd();

const sec = (id, over = {}) => ({
  id, type: 'checklist', name: '', enabled: true, sortOrder: 0,
  content: { items: [{ text: 'รายการทดสอบ', checked: true }] },
  settings: {}, layout: {}, style: {}, advanced: {},
  ...over,
});

/** The six cases. `probe` names the element whose computed value is read. */
const CASES = [
  { key: 'preset-bg',      read: 'background-color',
    section: sec('c1', { settings: { background: 'light' } }) },
  { key: 'custom-bg-1stop', read: 'background-color',
    section: sec('c2', { settings: { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc' } } }) },
  { key: 'custom-bg-2stop-down', read: 'background-image',
    section: sec('c3', { settings: { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc', to: '#cc6633', direction: 'to_bottom' } } }) },
  { key: 'custom-bg-2stop-right', read: 'background-image',
    section: sec('c4', { settings: { backgroundMode: 'custom', backgroundCustom: { from: '#3366cc', to: '#cc6633', direction: 'to_right' } } }) },
  // The two cases D1 calls 'ตามธีม': the DEFAULT value inside preset mode, which
  // is the one that is supposed to follow the page. Measured separately from the
  // NAMED presets above, because they are different claims.
  { key: 'theme-default-bg', read: 'background-color',
    section: sec('c7', { settings: { background: 'default' } }) },
  { key: 'theme-default-accent', read: 'accent', section: sec('c8') },
  { key: 'preset-accent',  read: 'accent',
    section: sec('c5', { style: { accentColor: 'green' } }) },
  { key: 'custom-accent',  read: 'accent',
    section: sec('c6', { style: { accentMode: 'custom', accentCustom: '#3366cc' } }) },
];

const blocks = CASES.map((c) =>
  `<div class="case" data-key="${c.key}" data-read="${c.read}">${
    renderToStaticMarkup(createElement(SectionRenderer, { section: c.section }))}</div>`).join('\n');

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const sliceBlock = (marker) => {
  const at = globals.indexOf(marker);
  return at === -1 ? '' : globals.slice(at, globals.indexOf('\n}', at) + 2);
};
// Both halves — the light `:root` set and the `.dark` overrides — so the same
// page can render each case under each theme without a second Chrome run.
const rootVars = sliceBlock(':root {');
const darkVars = sliceBlock('.dark {');
const themeVars = Object.entries(themeStyle('default')).map(([k, v]) => `${k}:${v}`).join(';');
/**
 * TWO more page themes, so "follows the page theme" can be told apart from
 * "follows dark mode" — and it takes two, not one.
 *
 * corporate_navy is the one DARK-SURFACED theme, which is what a
 * `background: 'default'` section inherits. Its default accent, though, is
 * `brand_blue` — the SAME as default's — so it cannot show an accent following
 * the theme even when one does. ai_purple's default accent is purple, so it can.
 *
 * The theme's SURFACE CLASS is applied to each block too: `background: 'default'`
 * emits no class of its own and inherits the wrapper's, which lives on
 * PageBuilderView in production and is otherwise absent from this page.
 */
const navyThemeVars = Object.entries(themeStyle('corporate_navy')).map(([k, v]) => `${k}:${v}`).join(';');
const purpleThemeVars = Object.entries(themeStyle('ai_purple')).map(([k, v]) => `${k}:${v}`).join(';');
const cls = (t) => themeSurface(t).pageClass;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${darkVars}
${css}
body{margin:0;width:1000px}
.case{width:1000px}
</style></head><body>
<div id="light" class="${cls('default')}" style="${themeVars}">${blocks}</div>
<div id="dark" class="dark ${cls('default')}" style="${themeVars}">${blocks}</div>
<div id="navytheme" class="${cls('corporate_navy')}" style="${navyThemeVars}">${blocks}</div>
<div id="purpletheme" class="${cls('ai_purple')}" style="${purpleThemeVars}">${blocks}</div>
<pre id="out"></pre>
<script>
const read = (root, key, what) => {
  const wrap = root.querySelector('[data-key="' + key + '"] > section');
  if (what === 'accent') {
    // The three variables AS RESOLVED, plus the colour a real consumer paints —
    // the checklist's checked icon, which is the whole point of measuring
    // rather than reading the class.
    const cs = getComputedStyle(wrap);
    const icon = root.querySelector('[data-key="' + key + '"] svg');
    return {
      fill: cs.getPropertyValue('--pb-accent-fill').trim(),
      on: cs.getPropertyValue('--pb-accent-on').trim(),
      painted: icon ? getComputedStyle(icon).color : '(no consumer drawn)',
    };
  }
  return { value: getComputedStyle(wrap)[what === 'background-color' ? 'backgroundColor' : 'backgroundImage'] };
};
const light = document.getElementById('light');
const dark = document.getElementById('dark');
const navy = document.getElementById('navytheme');
const rows = [];
for (const el of light.querySelectorAll('.case')) {
  const key = el.dataset.key, what = el.dataset.read;
  rows.push({
    key, what,
    light: read(light, key, what),
    dark: read(dark, key, what),
    navyTheme: read(navy, key, what),
    purpleTheme: read(document.getElementById('purpletheme'), key, what),
  });
}
// CONTROL: a variable KNOWN to differ between the two colour schemes. Without
// it, six identical pairs cannot be told from a .dark block that never applied.
const ctl = (root) => getComputedStyle(root).getPropertyValue('--surface-hover').trim();
document.getElementById('out').textContent = JSON.stringify(
  { control: { surfaceHoverLight: ctl(light), surfaceHoverDark: ctl(dark) }, rows }, null, 1);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'r39colour-'));
const file = path.join(dir, 'c.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1000,2400', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.log('[probe] page did not run'); process.exit(1); }
const parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
const { control, rows } = parsed;
console.log('── CONTROL: is .dark actually applied? ────────────────────────');
console.log('  --surface-hover  light:', control.surfaceHoverLight, ' dark:', control.surfaceHoverDark);
console.log('  .dark IS LIVE:', control.surfaceHoverLight !== control.surfaceHoverDark);
if (control.surfaceHoverLight === control.surfaceHoverDark) {
  console.log('  !! every identical pair below is meaningless — the dark block never applied');
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
const followsDark = (k) => !same(byKey[k].light, byKey[k].dark);
const followsTheme = (k) => !same(byKey[k].light, byKey[k].navyTheme) || !same(byKey[k].light, byKey[k].purpleTheme);

console.log('');
console.log('-- computed, per case ------------------------------------------');
for (const r of rows) {
  console.log('');
  console.log(r.key + '  (' + r.what + ')');
  console.log('  theme=default  scheme=light :', JSON.stringify(r.light));
  console.log('  theme=default  scheme=dark  :', JSON.stringify(r.dark));
  console.log('  theme=corporate_navy        :', JSON.stringify(r.navyTheme));
  console.log('  theme=ai_purple             :', JSON.stringify(r.purpleTheme));
}

console.log('');
console.log('-- what actually varies ----------------------------------------');
console.log('case'.padEnd(26) + 'dark mode'.padEnd(12) + 'page theme');
for (const r of rows) {
  console.log(r.key.padEnd(26) + String(followsDark(r.key)).padEnd(12) + String(followsTheme(r.key)));
}

console.log('');
console.log('-- E: one stop vs two ------------------------------------------');
console.log('one stop, background-color :', byKey['custom-bg-1stop'].light.value);
console.log('two stops, to_bottom       :', byKey['custom-bg-2stop-down'].light.value);
console.log('two stops, to_right        :', byKey['custom-bg-2stop-right'].light.value);
console.log('the two directions differ  :',
  byKey['custom-bg-2stop-down'].light.value !== byKey['custom-bg-2stop-right'].light.value);
console.log('[probe] html at', file);
