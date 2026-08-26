/**
 * ROUND 23 — does course_schedule's calendar icon follow the section accent,
 * and does swapping the hardcoded token for the variable repaint anything at
 * the DEFAULT accent?
 *
 * ── WHY A BROWSER, FOR A COLOUR-ONLY CHANGE ────────────────────────────────
 * The change swaps a Tailwind colour utility for one reading a CSS custom
 * property. The MARKUP therefore differs by construction — the class attribute
 * is the thing being changed — so a markup diff can only ever report "not
 * identical" and cannot answer the question that matters: does the painted
 * colour move?
 *
 * That question needs the real cascade. The utility resolves to a hex compiled
 * into the stylesheet; the variable resolves through --pb-accent-fill, which
 * the page theme wrapper sets from ACCENT_VARS, which points at a :root custom
 * property in globals.css. Three indirections, two files, one of them CSS.
 * JSDOM resolves none of it and getComputedStyle there returns the literal
 * `var(...)` string. So: real Chrome, real compiled Tailwind, the real :root
 * block, and getComputedStyle on the real element.
 *
 * ── WHAT IT PRINTS ─────────────────────────────────────────────────────────
 * One row per accent: the icon's computed colour, plus the row's primary text
 * and the status badge, which are the two things that must NOT move (round 21's
 * negative rules — body copy is never accented, semantic colour is never
 * overridden). A run against the pre-change component and a run against the
 * post-change one are compared by the caller; the icon row is the only one
 * allowed to differ, and only away from the default accent.
 *
 * `--json <file>` writes the measurements so two runs can be diffed byte-wise.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-schedule-accent.mjs
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
const { ACCENTS } = await import('@/lib/schemas/pageBuilder');
const { themeStyle } = await import('@/lib/pageBuilder/presets');

const jsonAt = process.argv.indexOf('--json');
const JSON_OUT = jsonAt > -1 ? process.argv[jsonAt + 1] : null;

// Two rows, so BOTH badge variants are measured — `open` and `nearly_full` are
// the semantic pair the second negative rule is about.
const ROWS = [
  { _id: '1', dates: ['2026-10-17', '2026-10-18'], status: 'open', type: 'classroom' },
  { _id: '2', dates: ['2026-11-02'], status: 'nearly_full', type: 'online' },
];

/** `undefined` = the author chose nothing, so the page theme's default stands. */
const CASES = [undefined, ...ACCENTS];

const blocks = CASES.map((accent) => {
  const markup = renderToStaticMarkup(createElement(SectionRenderer, {
    section: {
      id: 's1', type: 'course_schedule', name: '', enabled: true, sortOrder: 0,
      content: { courseId: 'MSE-AI' },
      settings: { containerWidth: 'large', spacingTop: 'none', spacingBottom: 'none' },
      style: accent ? { accentColor: accent } : {},
      layout: {}, advanced: {},
    },
    resolvedData: { s1: ROWS },
    path: null,
  }));
  return `<div class="probe" data-accent="${accent ?? '(default)'}">${markup}</div>`;
});

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);

// The page theme wrapper is what sets --pb-accent-* when the SECTION sets none.
// Without it the default case would measure an unset variable, which is not
// what any published page does.
const themeVars = Object.entries(themeStyle('default'))
  .map(([k, v]) => `${k}:${v}`).join(';');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${css}
body{margin:0;width:1200px}
.probe{width:1200px}
</style></head><body>
<div id="theme" style="${themeVars}">
${blocks.join('\n')}
</div>
<pre id="out"></pre>
<script>
const rows = [];
for (const p of document.querySelectorAll('.probe')) {
  const icon = p.querySelector('svg');
  const primary = p.querySelector('span.block.text-sm');
  const badges = [...p.querySelectorAll('span.rounded-full')];
  rows.push({
    accent: p.dataset.accent,
    icon: getComputedStyle(icon).color,
    primaryText: getComputedStyle(primary).color,
    badges: badges.map((b) => getComputedStyle(b).color + ' on ' + getComputedStyle(b).backgroundColor),
  });
}
document.getElementById('out').textContent = JSON.stringify(rows, null, 1);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'accprobe-'));
const file = path.join(dir, 'acc.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1200,900', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.log('[probe] page did not run'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

console.log('accent           icon colour        primary text       badges (text on bg)');
for (const r of rows) {
  console.log(
    `${r.accent.padEnd(16)} ${r.icon.padEnd(18)} ${r.primaryText.padEnd(18)} ${r.badges.join(' | ')}`,
  );
}

const iconSet = [...new Set(rows.map((r) => r.icon))];
const textSet = [...new Set(rows.map((r) => r.primaryText))];
const badgeSet = [...new Set(rows.map((r) => r.badges.join(' | ')))];
console.log(`\ndistinct ICON colours across ${rows.length} accents: ${iconSet.length} -> ${iconSet.join(', ')}`);
console.log(`distinct PRIMARY TEXT colours:                 ${textSet.length} -> ${textSet.join(', ')}`);
console.log(`distinct BADGE colours:                        ${badgeSet.length}`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  console.log(`\n[probe] measurements -> ${JSON_OUT}`);
}
console.log('[probe] html at', file);
