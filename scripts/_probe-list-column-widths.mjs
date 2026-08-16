/**
 * READ-ONLY probe: evaluate the two tables' COMPILED column widths at a given
 * container width, and report how much room the สถานะ cell leaves its chip.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The brief's sanity check was "at 10.9% of a 1440 container that cell is ~157px
 * and the chip measures ~101px plus padding, so it fits — but VERIFY that
 * against the compiled widths rather than trusting my arithmetic".
 *
 * The percentages are NOT the compiled widths. `columnWidths` normalises each
 * share against `100% - chrome`, and the chrome changed when รูปแบบ became a
 * column (a sixth 18px gap: 145px -> 163px). So the cell is narrower than the
 * bare percentage implies, and the difference is worth knowing before shipping a
 * chip that is `whitespace-nowrap` and would overflow rather than wrap.
 *
 * This renders the real components, reads the real `<col>` styles out of the
 * markup, and evaluates the `calc()` — no arithmetic retyped from the brief.
 *
 * WHAT IT CANNOT DO: measure the chip's TEXT. Glyph advances need a font and a
 * layout engine, and this suite has neither. The label width is reported as a
 * BAND across a range of plausible average advances, and the honest answer to
 * "does it fit" is the narrowest of those, with the eyeball on the click-test
 * list.
 *
 * Usage: node scripts/_probe-list-column-widths.mjs [containerPx]
 */

import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'production';
register(new URL('./test/loader.mjs', `file://${ROOT.split(path.sep).join('/')}/`));

const { renderToStaticMarkup } = await import('react-dom/server');
const { createElement } = await import('react');
const { PublicTable } = await import('@/app/admin/registrations/_components/PublicTable');
const { InhouseTable } = await import('@/app/admin/registrations/_components/InhouseTable');
const { PUBLIC_STATUSES, INHOUSE_STATUSES } = await import('@/lib/registrations/statuses');

const CONTAINER = Number(process.argv[2] ?? 1440);

/** Evaluate `calc((100% - Npx) * R + Ppx)` or `Npx` at a container width. */
function evalWidth(css, container) {
  const calc = /^calc\(\(100% - ([\d.]+)px\) \* ([\d.]+) \+ ([\d.]+)px\)$/.exec(css);
  if (calc) {
    const [, chrome, ratio, pad] = calc.map(Number);
    return { box: (container - chrome) * ratio + pad, pad, chrome, ratio };
  }
  const px = /^([\d.]+)px$/.exec(css);
  if (px) return { box: Number(px[1]), pad: 0, chrome: 0, ratio: 0 };
  throw new Error(`unrecognised width: ${css}`);
}

function columnsOf(markup) {
  return [...markup.matchAll(/<col style="width:([^"]*)"/g)].map((m) => m[1]);
}

/**
 * The header labels, in column order.
 *
 * SLICED FROM AFTER THE OPENING TAG. `<thead …>` itself matches `<th[^>]*>`, so
 * slicing from the `<thead` index yields a PHANTOM FIRST COLUMN and shifts every
 * label one place against its width — which is exactly what the first run of
 * this probe printed, with `(chevron)` at the top and สถานะ reading 37px.
 *
 * The same trap is written up in test/render/registrationsPublicTable and in
 * test/render/adminListColumns, and it still caught this file. It is worth
 * noticing that the WIDTHS were right the whole time: only the labels moved, so
 * the output looked authoritative and was wrong in the one way that mattered.
 */
function headingsOf(markup) {
  const start = markup.indexOf('<thead');
  const open = markup.indexOf('>', start);
  const head = markup.slice(open + 1, markup.indexOf('</thead>', open));
  return [...head.matchAll(/<th[^>]*>(?:<span[^>]*>)?([^<]*)/g)].map((m) => m[1].trim());
}

const publicMarkup = renderToStaticMarkup(createElement(PublicTable, {
  items: [], lastEdited: {}, detailHref: (id) => `/admin/registrations/${id}`,
}));
const inhouseMarkup = renderToStaticMarkup(createElement(InhouseTable, {
  items: [], lastEdited: {}, courseNames: {},
}));

function report(name, markup) {
  const cols = columnsOf(markup);
  const heads = headingsOf(markup);
  console.log(`\n── ${name} — compiled at a ${CONTAINER}px container ${'─'.repeat(Math.max(0, 26 - name.length))}`);
  console.log('  column'.padEnd(24), 'box'.padStart(9), 'pad'.padStart(6), 'content'.padStart(9), 'ratio'.padStart(9));
  console.log('  ' + '-'.repeat(60));
  let sum = 0;
  const content = {};
  cols.forEach((css, i) => {
    const w = evalWidth(css, CONTAINER);
    sum += w.box;
    const label = heads[i] || '(chevron)';
    content[label] = w.box - w.pad;
    console.log(
      '  ' + label.padEnd(22),
      w.box.toFixed(1).padStart(9),
      String(w.pad).padStart(6),
      (w.box - w.pad).toFixed(1).padStart(9),
      (w.ratio ? w.ratio.toFixed(6) : '—').padStart(9),
    );
  });
  console.log('  ' + '-'.repeat(60));
  console.log(`  sum of boxes: ${sum.toFixed(1)}px  (container ${CONTAINER}px — ${Math.abs(sum - CONTAINER) < 0.5 ? 'fills exactly' : 'MISMATCH'})`);
  return content;
}

const pub = report('PUBLIC', publicMarkup);
const inh = report('IN-HOUSE', inhouseMarkup);

// ── The chip fit ────────────────────────────────────────────────────────────

/**
 * The widest LIVE label on each side, taken from the vocabulary rather than
 * typed here — a hand-written "widest label" is one relabel away from being
 * wrong, and this whole round has been about not writing status text by hand.
 */
const widest = (list) => list.map((s) => s.label).sort((a, b) => b.length - a.length)[0];

/**
 * Thai base glyphs: combining marks (above/below vowels and tone marks) take
 * ZERO advance, so counting code points overstates the width badly. This counts
 * only glyphs that actually advance.
 */
const COMBINING = /[ัิ-ฺ็-๎]/;
const advancing = (s) => [...s].filter((ch) => !COMBINING.test(ch)).length;

const CHIP_PADDING = 9 * 2;   // px-[9px]
const FONT_PX = 12;           // text-[12px]

console.log(`\n── สถานะ chip fit ${'─'.repeat(44)}`);
for (const [side, list, cell] of [
  ['public',  PUBLIC_STATUSES,  pub['สถานะ']],
  ['in-house', INHOUSE_STATUSES, inh['สถานะ']],
]) {
  const label = widest(list);
  const glyphs = advancing(label);
  console.log(`\n  ${side}: widest live label ${JSON.stringify(label)}`);
  console.log(`    ${[...label].length} code points, ${glyphs} advancing glyphs at ${FONT_PX}px`);
  console.log(`    cell content width: ${cell.toFixed(1)}px`);
  for (const em of [0.55, 0.65, 0.75]) {
    const text = glyphs * FONT_PX * em;
    const chip = text + CHIP_PADDING;
    const verdict = chip <= cell ? `FITS, ${(cell - chip).toFixed(1)}px spare` : `OVERFLOWS by ${(chip - cell).toFixed(1)}px`;
    console.log(`    at ${em}em avg advance: text ${text.toFixed(1)}px + ${CHIP_PADDING}px padding = ${chip.toFixed(1)}px  ->  ${verdict}`);
  }
}

console.log(`
  NOTE: the chip is whitespace-nowrap, so a miss OVERFLOWS rather than wraps —
  visible immediately. The advance band above is a bound, not a measurement:
  only a browser knows the real glyph widths.
`);
