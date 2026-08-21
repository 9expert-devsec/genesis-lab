/**
 * ROUND 18 item C — the one cell markup-diffing cannot decide.
 *
 * `settings.containerWidth` puts a max-width class on the wrapper's inner box,
 * so the MARKUP always differs across its four values and a diff reports READ
 * for all 27 types. But several components clamp their own width underneath it
 * (container: max-w-3xl · course_card / instructor_card: max-w-sm), and where
 * the inner clamp is the narrower of the two the author's choice changes no
 * pixels at all.
 *
 * That is a layout question, and JSDOM has no layout engine. So this measures
 * the rendered box in real Chrome, the same instrument round 17 used for the
 * structure panel: real SectionRenderer output, real compiled Tailwind, real
 * flex/grid resolution.
 *
 * Run: node --import ./scripts/_probe-panel-register.mjs scripts/_probe-container-width.mjs
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

const COURSE = {
  course_id: 'MSE-AI', course_name: 'คอร์ส AI', course_price: 12900,
  course_days: 2, program: { program_name: 'AI' },
};
const CONTENT = {
  heading: { text: 'หัวเรื่องที่ยาวพอจะกินความกว้างทั้งแถว', level: 'h2', align: 'left' },
  container: { children: [{
    id: 'c1', type: 'heading', content: { text: 'ลูก', level: 'h3', align: 'left' },
    settings: {}, style: {}, layout: {}, advanced: {}, enabled: true, sortOrder: 0, name: '',
  }] },
  course_card: { courseId: 'MSE-AI' },
  instructor_card: { instructorId: 'I1' },
  notice: { text: 'ข้อความแจ้งเตือน', variant: 'info' },
};
const RESOLVED = { course_card: COURSE, instructor_card: { name: 'ผู้สอน', title: 'อาจารย์' } };
const TYPES = ['heading', 'notice', 'container', 'course_card', 'instructor_card'];

const blocks = [];
for (const type of TYPES) {
  for (const w of CONTAINER_WIDTHS) {
    const markup = renderToStaticMarkup(createElement(SectionRenderer, {
      section: {
        id: 's1', type, name: '', enabled: true, sortOrder: 0,
        content: CONTENT[type], settings: { containerWidth: w, spacingTop: 'none', spacingBottom: 'none' },
        style: {}, layout: {}, advanced: {},
      },
      resolvedData: RESOLVED[type] ? { s1: RESOLVED[type] } : null,
      path: null,
    }));
    blocks.push(`<div class="probe" data-type="${type}" data-w="${w}">${markup}</div>`);
  }
}

const css = (await postcss([tailwindcss({
  presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
})]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;

const globals = readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8');
const rootVars = globals.slice(globals.indexOf(':root {'), globals.indexOf('\n}', globals.indexOf(':root {')) + 2);

// 1440px page — a desktop viewport, where every containerWidth value is
// reachable (at a narrow viewport they all collapse to the screen width and the
// question would answer itself).
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${rootVars}
${css}
body{margin:0;width:1440px}
.probe{width:1440px}
</style></head><body>
${blocks.join('\n')}
<pre id="out"></pre>
<script>
const rows = [];
for (const p of document.querySelectorAll('.probe')) {
  const box = p.querySelector('section > div');
  // The widest painted element the component itself produced.
  const kids = [...box.querySelectorAll('*')];
  const widest = kids.reduce((m, el) => Math.max(m, el.getBoundingClientRect().width), 0);
  rows.push({
    type: p.dataset.type, w: p.dataset.w,
    box: Math.round(box.getBoundingClientRect().width),
    content: Math.round(widest),
  });
}
document.getElementById('out').textContent = JSON.stringify(rows);
</script></body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), 'cwprobe-'));
const file = path.join(dir, 'cw.html');
writeFileSync(file, html);

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const dom = execFileSync(CHROME, [
  '--headless', '--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1',
  '--window-size=1440,900', '--virtual-time-budget=4000', '--dump-dom',
  'file:///' + file.split(path.sep).join('/'),
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m) { console.log('[probe] page did not run'); process.exit(1); }
const rows = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

console.log('type              width     box    content');
for (const r of rows) {
  console.log(`${r.type.padEnd(17)} ${r.w.padEnd(8)} ${String(r.box).padStart(5)}  ${String(r.content).padStart(6)}`);
}
console.log('\n── distinct CONTENT widths per type (1 = the control changes no pixels) ──');
for (const t of TYPES) {
  const set = [...new Set(rows.filter((r) => r.type === t).map((r) => r.content))];
  console.log(`${t.padEnd(17)} ${set.length} distinct: ${set.join(', ')}`);
}
console.log('\n[probe] html at', file);
