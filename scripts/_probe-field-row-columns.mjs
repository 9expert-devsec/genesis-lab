/**
 * DOES THE FIELD-ROW COLUMN SPLIT ACTUALLY COMPILE?
 *
 * Round 7 moves every detail-screen field to a label-left / value-right row, and
 * the split is an arbitrary-value class. `bg-9e-action/12` is the standing
 * warning here: it is a COMPLETE LITERAL, contains no interpolation, passes every
 * shape check in the suite, and compiled to NOTHING because 12 is not a step of
 * the opacity scale. A percentage or a grid template is exactly the same class of
 * risk — nothing rejects an unsupported value, it simply emits no rule.
 *
 * So this asks the two questions a shape check cannot:
 *   1. does Tailwind emit a rule for the class at all;
 *   2. can the suite's own `escapeClass` FIND that rule in the emitted CSS —
 *      a selector full of `%`, `(`, `)` and `,` is escaped by Tailwind, and a
 *      harvest whose escaping disagrees reports a live class as dead.
 *
 *   node scripts/_probe-field-row-columns.mjs
 */
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = process.cwd();
const require_ = createRequire(import.meta.url);

const CANDIDATES = [
  // The two shapes the split could take.
  'lg:grid-cols-[22%_minmax(0,1fr)]',
  'lg:grid-cols-[22%_1fr]',
  'lg:w-[22%]',
  'lg:w-[77%]',
  // The 1% gutter that puts the value column's left edge at 23%.
  'lg:gap-x-[1%]',
  // The row's own rhythm and rule.
  'py-[11px]',
  'divide-y',
  'divide-[var(--surface-border)]',
  'lg:items-baseline',
];

/** Byte-identical to test/fs/tailwindArbitraryValueRules' own escapeClass. */
const escapeClass = (c) => c.replace(/[.:%[\]()/,#+*>~='"!$^&{}|?\\]/g, (ch) => `\\${ch}`);

const css = (await postcss([
  tailwindcss({
    presets: [require_(path.join(ROOT, 'tailwind.config.js'))],
    content: [{ raw: CANDIDATES.join(' '), extension: 'html' }],
  }),
]).process('@tailwind utilities;', { from: undefined })).css;

let dead = 0;
for (const c of CANDIDATES) {
  const at = css.indexOf(`.${escapeClass(c)}`);
  if (at === -1) { dead += 1; console.log(`DEAD      ${c}`); continue; }
  const end = css.indexOf('}', at);
  console.log(`COMPILES  ${c}`);
  console.log(`          ${css.slice(at, end + 1).replace(/\s+/g, ' ').trim().slice(0, 150)}`);
}
console.log(`\n${CANDIDATES.length - dead}/${CANDIDATES.length} compile and are findable.`);
