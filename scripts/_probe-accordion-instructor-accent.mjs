/**
 * ROUND 24 — accordion + instructor_card take the section accent.
 *
 * ── THREE QUESTIONS, ONE INSTRUMENT ────────────────────────────────────────
 * 1. Does the injected class actually REACH the markup? Round 23 found a
 *    control that changed nothing because `cn` is tailwind-merge and a later
 *    colour silently dropped the injection. Both of this round's targets sit
 *    where a colour class already was, so the markup is dumped and diffed
 *    rather than assumed.
 * 2. What COLOUR does each element paint, at the default accent and at
 *    non-default ones? The utility resolves to a hex compiled into the
 *    stylesheet; the variable resolves through --pb-accent-* -> ACCENT_VARS ->
 *    a :root custom property in globals.css. JSDOM resolves none of that.
 * 3. Did anything MOVE? Colour-only means every box keeps its position and
 *    size. A byte diff cannot tell restyle from breakage, so the bounding
 *    boxes of the changed elements AND their neighbours are measured too.
 *
 * ── WHY THE ACCORDION IS MOUNTED, NOT SERVER-RENDERED ──────────────────────
 * Its open state is `useState(null)`, so a server render shows every item
 * CLOSED — the one branch this round does not change. Static markup carries no
 * handlers either, so clicking it in the measuring page does nothing.
 *
 * So the two jobs are split. React actually MOUNTS in JSDOM and the first item
 * is really clicked, which produces the open branch from the component rather
 * than from an assumption about it; that markup is then handed to Chrome, which
 * owns the cascade and the layout engine JSDOM does not have.
 *
 * (`tabs`, the precedent, does not need this — its active index is `useState(0)`,
 * so its accented branch is present in a static render.)
 *
 * `--json <file>` writes the measurements so a run against the pre-change
 * components and a run against these can be compared byte-wise.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-accordion-instructor-accent.mjs
 */
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createElement, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const ROOT = process.cwd();

// React needs a DOM before react-dom/client is imported. `navigator` is a
// getter-only global in node 22, so it is defined rather than assigned.
const jsdom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { pretendToBeVisual: true });
global.window = jsdom.window;
global.document = jsdom.window.document;
global.HTMLElement = jsdom.window.HTMLElement;
Object.defineProperty(global, 'navigator', { value: jsdom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;

const { createRoot } = await import('react-dom/client');
const { AccordionSection } = await import('@/components/pageBuilder/sections/accordion');
const { InstructorCardSection } = await import('@/components/pageBuilder/sections/instructor_card');
const { IconCardSection } = await import('@/components/pageBuilder/sections/icon_card');
const { themeStyle, accentVars } = await import('@/lib/pageBuilder/presets');

const jsonAt = process.argv.indexOf('--json');
const JSON_OUT = jsonAt > -1 ? process.argv[jsonAt + 1] : null;

const ITEMS = [
  { title: 'หัวข้อแรก', body: 'เนื้อหาของหัวข้อแรก' },
  { title: 'หัวข้อที่สอง', body: 'เนื้อหาของหัวข้อที่สอง' },
];
const INSTRUCTOR = {
  name: 'ผู้สอน ทดสอบ', title: 'อาจารย์ประจำ', bio: 'ประวัติโดยย่อของผู้สอน',
  specialties: ['Data', 'AI'],
};

// The default (no author choice, so the page theme's accent stands) plus two
// non-default ones. `green` and `orange` are far enough apart in hue that a
// stuck value cannot look like a working one.
const CASES = [null, 'green', 'orange'];

/** Mount the accordion for real, click item 0 open, return the live markup. */
async function accordionOpenMarkup() {
  const host = jsdom.window.document.getElementById('root');
  const root = createRoot(host);
  await act(async () => { root.render(createElement(AccordionSection, { content: { items: ITEMS } })); });
  const panelsClosed = host.querySelectorAll('.whitespace-pre-line').length;
  await act(async () => { host.querySelector('button').click(); });
  const panelsOpen = host.querySelectorAll('.whitespace-pre-line').length;
  const html = host.innerHTML;
  await act(async () => { root.unmount(); });

  /**
   * The guard asks whether a PANEL APPEARED, not whether the button's class
   * changed. A first draft asked the latter and threw on the pre-change
   * component — where the two branches are styled identically, which is the
   * whole finding — so it would have blocked the before/after comparison it
   * exists to protect. Panel count moves in both versions.
   */
  if (!(panelsClosed === 0 && panelsOpen === 1)) {
    throw new Error(`[probe] the click did not open an item (${panelsClosed} -> ${panelsOpen} panels) — nothing was measured`);
  }
  return html;
}

const ACC_HTML = await accordionOpenMarkup();

const blocks = CASES.map((accent) => {
  const vars = accent ? accentVars(accent) : {};
  const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  return `<div class="probe" data-accent="${accent ?? '(default)'}" style="${style}">
    <div class="acc">${ACC_HTML}</div>
    <div class="ins">${renderToStaticMarkup(createElement(InstructorCardSection, { data: INSTRUCTOR }))}</div>
    <div class="ico">${renderToStaticMarkup(createElement(IconCardSection, { content: { title: 'ตัวอย่าง', description: 'คำอธิบาย', icon: 'Star' }, style: {} }))}</div>
  </div>`;
});

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);
const themeVars = Object.entries(themeStyle('default')).map(([k, v]) => `${k}:${v}`).join(';');

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
// The accordion arrives ALREADY OPEN — it was mounted and clicked in JSDOM
// before this page was written, because static markup carries no handlers.
// Boxes are taken RELATIVE to the case's own block. The three cases are stacked
// down one page, so absolute y differs for a reason that has nothing to do with
// the change — comparing absolutes would report every box as moving.
let ORIGIN = { x: 0, y: 0 };
const box = (el) => {
  const r = el.getBoundingClientRect();
  return [Math.round(r.x - ORIGIN.x), Math.round(r.y - ORIGIN.y), Math.round(r.width), Math.round(r.height)];
};
const rows = [];
for (const p of document.querySelectorAll('.probe')) {
  const pr = p.getBoundingClientRect();
  ORIGIN = { x: pr.x, y: pr.y };
  const buttons = [...p.querySelectorAll('.acc button')];
  const openBtn = buttons[0], closedBtn = buttons[1];
  const openChevron = openBtn.querySelector('svg');
  const closedChevron = closedBtn.querySelector('svg');
  const bodyEl = p.querySelector('.acc .whitespace-pre-line');
  const chips = [...p.querySelectorAll('.ins span.rounded-full')];
  const nameEl = p.querySelector('.ins h3');
  const roleEl = p.querySelector('.ins p');

  rows.push({
    accent: p.dataset.accent,
    colour: {
      openTitle: getComputedStyle(openBtn).color,
      openChevron: getComputedStyle(openChevron).color,
      closedTitle: getComputedStyle(closedBtn).color,
      closedChevron: getComputedStyle(closedChevron).color,
      accordionBody: getComputedStyle(bodyEl).color,
      chipText: getComputedStyle(chips[0]).color,
      chipBg: getComputedStyle(chips[0]).backgroundColor,
      instructorName: getComputedStyle(nameEl).color,
      instructorRole: getComputedStyle(roleEl).color,
      // CONTROL: icon_card's chip is the precedent instructor_card follows.
      // Its background is what this round found does not compile.
      iconCardChipBg: getComputedStyle(p.querySelector('.ico div > div')).backgroundColor,
      iconCardChipFg: getComputedStyle(p.querySelector('.ico div > div')).color,
    },
    boxes: {
      openBtn: box(openBtn), closedBtn: box(closedBtn),
      openChevron: box(openChevron), body: box(bodyEl),
      chip0: box(chips[0]), chip1: box(chips[1]),
      name: box(nameEl), role: box(roleEl),
      card: box(p.querySelector('.ins > div')),
      iconChip: box(p.querySelector('.ico div > div')),
    },
    classes: {
      openBtn: openBtn.getAttribute('class'),
      closedBtn: closedBtn.getAttribute('class'),
      openChevron: openChevron.getAttribute('class'),
      closedChevron: closedChevron.getAttribute('class'),
      chip: chips[0].getAttribute('class'),
      iconCardChip: p.querySelector('.ico div > div').getAttribute('class'),
    },
  });
}
document.getElementById('out').textContent = JSON.stringify(rows, null, 1);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'accinsprobe-'));
const file = path.join(dir, 'ai.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1200,1400', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.log('[probe] page did not run'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

const KEYS = Object.keys(rows[0].colour);
console.log('── computed colours ───────────────────────────────────────────');
console.log('element'.padEnd(18) + CASES.map((c) => String(c ?? '(default)').padEnd(24)).join(''));
for (const k of KEYS) {
  console.log(k.padEnd(18) + rows.map((r) => r.colour[k].padEnd(24)).join(''));
}

console.log('\n── distinct values across the three accents (1 = does NOT follow) ──');
for (const k of KEYS) {
  const set = [...new Set(rows.map((r) => r.colour[k]))];
  console.log(`${k.padEnd(18)} ${set.length}`);
}

console.log('\n── bounding boxes [x, y, w, h], identical across accents? ─────');
for (const k of Object.keys(rows[0].boxes)) {
  const set = [...new Set(rows.map((r) => JSON.stringify(r.boxes[k])))];
  console.log(`${k.padEnd(14)} ${set.length === 1 ? 'stable' : 'VARIES'}  ${set.join(' | ')}`);
}

console.log('\n── the class actually in the markup (the tailwind-merge check) ──');
for (const [k, v] of Object.entries(rows[0].classes)) console.log(`${k.padEnd(14)} ${v}`);

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  console.log(`\n[probe] measurements -> ${JSON_OUT}`);
}
console.log('[probe] html at', file);
