/**
 * ROUND 21 item B — was `max-w-sm` on the two card types deliberate?
 *
 * The claim under test: a standalone `course_card` / `instructor_card` clamps
 * itself so that a LONE card renders at the same width it would have as a cell
 * inside one of the multi-course grids (course_selector / bundle_courses /
 * course_list). If that holds, the clamp is a design decision — "a card is a
 * card is a card" — and making settings.containerWidth stretch it would be
 * the wrong fix rather than the missing one.
 *
 * Arithmetic gets close to this answer, and round 17 is the standing reminder
 * that arithmetic is not a measurement: it put the structure row's label at
 * "roughly 96px" where Chrome said 85. So this measures both boxes in a real
 * browser, through the real renderer and the real compiled stylesheet.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-card-width-intent.mjs
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

const course = (id) => ({
  course_id: id, course_name: `คอร์ส ${id}`, course_price: 12900,
  course_days: 2, program: { program_name: 'AI' },
});
const COURSES = [course('A'), course('B'), course('C')];

const sec = (id, type, content) => ({
  id, type, content, name: '', enabled: true, sortOrder: 0,
  settings: { containerWidth: 'large', spacingTop: 'none', spacingBottom: 'none' },
  style: {}, layout: {}, advanced: {},
});

const CASES = [
  { key: 'standalone-course_card', section: sec('s1', 'course_card', { courseId: 'A' }), data: COURSES[0] },
  { key: 'grid-course_selector', section: sec('s1', 'course_selector', { courseIds: ['A', 'B', 'C'] }), data: COURSES },
  { key: 'grid-bundle_courses', section: sec('s1', 'bundle_courses', { courseIds: ['A', 'B', 'C'] }), data: COURSES },
  { key: 'standalone-instructor_card', section: sec('s1', 'instructor_card', { instructorId: 'I1' }), data: { name: 'ผู้สอน', title: 'อาจารย์' } },
];

const blocks = CASES.map(({ key, section, data }) => {
  const markup = renderToStaticMarkup(createElement(SectionRenderer, {
    section, depth: 0, path: null, resolvedData: { s1: data },
  }));
  return `<div class="case" data-key="${key}">${markup}</div>`;
}).join('\n');

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);

// A desktop viewport, so the grids reach their widest (3-column) step.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${css}
body{margin:0;width:1440px}.case{width:1440px}
</style></head><body>
${blocks}
<pre id="out"></pre>
<script>
const rows = [];
for (const c of document.querySelectorAll('.case')) {
  const box = c.querySelector('section > div');
  // The card itself: the widest element that is a direct card surface. For the
  // grids that is the first grid child; for the standalone types it is the
  // component's own clamped wrapper.
  const grid = [...box.querySelectorAll('div')].find((d) => getComputedStyle(d).display === 'grid');
  const card = grid ? grid.firstElementChild : box.firstElementChild;
  rows.push({
    key: c.dataset.key,
    outerBox: Math.round(box.getBoundingClientRect().width),
    cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
    isGrid: Boolean(grid),
    gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null,
  });
}
document.getElementById('out').textContent = JSON.stringify(rows, null, 1);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'cardwidth-'));
const file = path.join(dir, 'p.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1440,900', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '[probe] no output');
