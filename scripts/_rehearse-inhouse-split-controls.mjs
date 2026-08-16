/**
 * REHEARSAL — break the รูปแบบ / จำนวน split five ways, and prove the suite goes
 * RED for each.
 *
 * Same harness as the six sibling scripts.
 *
 * ── THE CASE THAT IS A FINDING ──────────────────────────────────────────────
 *   5. Adding an eighth column to this table narrows สถานะ WITHOUT ANYONE
 *      EDITING ITS SHARE — every added column adds a gap, the chrome grows, and
 *      every content column shrinks. The floor guard is what notices. That is
 *      not hypothetical: the split in this very commit took สถานะ from 144.2px
 *      to 142.4px with its 10.0% untouched.
 *
 * Usage: node scripts/_rehearse-inhouse-split-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INHT = 'src/app/admin/registrations/_components/InhouseTable.jsx';

const INHR  = 'test/render/registrationsInhouseTable.test.mjs';
const STRIP = 'test/render/registrationsStatStrip.test.mjs';
const HARV  = 'test/fs/tailwindArbitraryValueRules.test.mjs';

if (process.argv[2] === '--child') {
  process.env.NODE_ENV = 'production';
  const { register } = await import('node:module');
  register(new URL('./test/loader.mjs', `file://${ROOT.split(path.sep).join('/')}/`));
  const { run } = await import('node:test');

  const files = process.argv.slice(3).map((f) => path.join(ROOT, f));
  const failed = [];
  let passed = 0;
  const stream = run({ files, isolation: 'none', concurrency: true });
  stream.on('test:pass', () => { passed += 1; });
  stream.on('test:fail', (e) => { failed.push(e.name); });
  stream.on('data', () => {});
  stream.on('close', () => console.log(`__RESULT__${JSON.stringify({ passed, failed })}`));
}

function runTests(files) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', ...files], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('the child produced no result line — it probably failed to start');
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

/** The tree is CRLF; the cases below are written with `\n`. */
function withEol(text, file) {
  return file.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');
}

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

const CASES = [
  {
    name: '1. the chip and the count are stacked back into one cell',
    why: 'the split is the whole commit — and the OLD test could not tell stacked from split',
    edits: [{
      file: INHT,
      find: '                  <FormatChip value={row.trainingFormat} />\n'
        + '                </CellLink>\n              </td>\n\n'
        + '              {/*\n'
        + '                จำนวน — THE NUMBER ONLY, rendered exactly as the public table\'s\n'
        + '                ผู้เข้าอบรม cell renders its own. See CountCell.\n'
        + '              */}\n'
        + '              <td className="p-0 align-top">\n'
        + '                <CellLink href={to} style={pad(5)}>\n'
        + '                  <CountCell count={row.participantsCount} />',
      replace: '                  <FormatChip value={row.trainingFormat} />\n'
        + '                  <CountCell count={row.participantsCount} />\n'
        + '                </CellLink>\n              </td>\n\n'
        + '              <td className="p-0 align-top">\n'
        + '                <CellLink href={to} style={pad(5)}>\n'
        + '                  <CountCell count={undefined} />',
    }],
    files: [INHR],
    /**
     * The vacated cell renders a DASH rather than an empty `<span />`, which the
     * first draft used. That artefact reddened four unrelated empty-element
     * assertions and made the case look broader than it is — the claim here is
     * about STACKING, not about emptiness. A real element keeps the blast radius
     * honest.
     */
    mustFail: [
      'รูปแบบ and จำนวน are separate cells, each with exactly one element',
      'CONTROL: the cell extractor lands on the สถานะ column',
    ],
    /**
     * The phrasing guard is declared GREEN, and correctly so: stacking changes
     * WHERE the number is, not how it reads or how it is styled. It was in the
     * mustFail list on the first draft, which was me assuming a structural
     * mutation would trip a content assertion. It does not, and it should not —
     * the two guards are about different things and this case proves they are
     * genuinely separable rather than one testing the other by accident.
     */
    mustStillPass: ['จำนวน renders a bare number, with the same treatment as public ผู้เข้าอบรม'],
  },
  {
    name: '2. the headcount is phrased ประมาณ N คน',
    why: 'a claim about the data the field does not make — and public renders a bare number',
    edits: [{
      file: INHT,
      find: "      {count ?? '—'}",
      replace: "      {count == null ? '—' : `ประมาณ ${count} คน`}",
    }],
    files: [INHR],
    mustFail: [
      'จำนวน renders a bare number, with the same treatment as public ผู้เข้าอบรม',
      // Declared: both of these anchor on the cell's text being exactly the
      // number, so re-phrasing it is precisely what they are built to notice.
      'รูปแบบ and จำนวน are separate cells, each with exactly one element',
      'CONTROL: the cell extractor lands on the สถานะ column',
    ],
  },
  {
    name: '3. the headcount is styled differently from the public one',
    why: 'the two tables must not render a headcount two ways, not merely phrase it one way',
    edits: [{
      file: INHT,
      find: '    <p className="text-[14px] font-bold leading-[17px] tabular-nums text-[var(--text-primary)]">',
      replace: '    <p className="text-[13px] font-bold leading-[18px] tabular-nums text-[var(--text-primary)]">',
    }],
    files: [INHR],
    mustFail: ['จำนวน renders a bare number, with the same treatment as public ผู้เข้าอบรม'],
  },
  {
    name: '4. the format chip loses its width constraint',
    why: 'a DIRECT child of CellLink (flex flex-col) is blockified and stretched across the column',
    edits: [{
      file: INHT,
      find: "      'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
      replace: "      'inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
    }],
    files: [HARV],
    mustFail: [
      'every chip in both tables has a compiled width constraint',
      // Declared: the "match the others" guard reads this exact class literal,
      // which is the point of it — the status chip was fixed BY matching this
      // chip, so the claim goes stale the moment this one changes.
      'the in-house format chip uses the SAME mechanism, so "match the others" stays true',
    ],
  },
  {
    name: '5. an EIGHTH column is added without touching any share',
    why: 'every added column adds a gap; the chrome grows and สถานะ narrows with nobody editing it',
    edits: [{
      file: INHT,
      find: "  { key: 'status',      label: 'สถานะ',            share: 10.0 },\n];",
      replace: "  { key: 'status',      label: 'สถานะ',            share: 10.0 },\n"
        + "  { key: 'extra',       label: 'เพิ่ม',             share:  0.1 },\n];",
    }],
    files: [INHR, STRIP],
    /**
     * ── TWO FINDINGS, AND I HAD THE FIRST ONE BACKWARDS ─────────────────────
     *
     * I declared that the สถานะ FLOOR guard would catch this, on the reasoning
     * that an added column narrows every other column without anyone editing a
     * share. The narrowing is real — this commit's own split took สถานะ from
     * 144.2px to 142.4px with its 10.0% untouched — but ONE more column costs
     * only ~2px more, and the floor has ~7px of headroom. So the floor guard
     * stays GREEN and is declared as such.
     *
     * That is worth knowing rather than papering over: the floor protects
     * against someone NARROWING สถานะ deliberately, and it will absorb roughly
     * three more added columns before it notices one. It is not a general
     * "the layout got tighter" alarm.
     *
     * THE SECOND FINDING IS THE ONE THAT CHANGED THE TESTS. This case originally
     * reddened only three assertions, and every body-level guard stayed green —
     * because `COLUMNS` drives the header and the `<colgroup>` but NOT the body,
     * whose `<td>`s are hand-written one per column. A column could be added to
     * the header with no cell under it, and the anchor count, the cell indices
     * and even the empty-state `colSpan` (derived from the same array as the
     * header) all survived it. A new assertion now pins body cells == header
     * cells, and it reddens here.
     */
    mustFail: [
      'the header has exactly eight columns: seven labelled plus the chevron',
      'the column ratios are the measured in-house shares, normalised',
      'every content column is a proportion, and only the chevron is fixed',
      'every body row has exactly as many cells as the header',
    ],
    mustStillPass: [
      'the สถานะ column clears the widest live label at a stated 0.65em advance',
      'the empty-state colSpan matches the header width',
    ],
  },
];

const ALL_TARGETS = [INHT];
const ALL_TESTS   = [INHR, STRIP, HARV];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ IN-HOUSE SPLIT CONTROL REHEARSAL ═══════════════════════════════════════');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    console.log('── baseline (unmutated) ────────────────────────────────────────────────────');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`── ${c.name} ${'─'.repeat(Math.max(0, 71 - c.name.length))}`);
      console.log(`   ${c.why}`);

      const applied = c.edits.map((e) => {
        const before = original.get(e.file);
        return { file: e.file, find: withEol(e.find, before), replace: withEol(e.replace, before) };
      });
      for (const e of applied) {
        const hits = original.get(e.file).split(e.find).length - 1;
        if (hits !== 1) {
          throw new Error(
            `case "${c.name}": the find text occurs ${hits} times in ${e.file}, expected exactly 1.\n` +
            `  ${JSON.stringify(e.find.slice(0, 130))}`,
          );
        }
      }
      const mutated = new Map(original);
      for (const e of applied) mutated.set(e.file, mutated.get(e.file).replace(e.find, e.replace));
      for (const [rel, text] of mutated) writeFileSync(path.join(ROOT, rel), text);

      const r = runTests(c.files);

      for (const name of c.mustFail) {
        check(`RED: ${name}`, r.failed.includes(name),
          r.failed.includes(name) ? '' : `still green (failures: ${r.failed.join(' | ') || 'none'})`);
      }
      for (const name of c.mustStillPass ?? []) {
        check(`green: ${name}`, !r.failed.includes(name), r.failed.includes(name) ? 'went red unexpectedly' : '');
      }
      const declared = new Set(c.mustFail);
      const surprises = r.failed.filter((n) => !declared.has(n));
      check('no undeclared failures', surprises.length === 0, surprises.length ? surprises.join(' | ') : '');

      for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
      console.log('');
    }
  } finally {
    for (const [rel, text] of original) writeFileSync(path.join(ROOT, rel), text);
    console.log('── restored ────────────────────────────────────────────────────────────────');
    for (const rel of ALL_TARGETS) {
      const same = readFileSync(path.join(ROOT, rel), 'utf8') === original.get(rel);
      console.log(`   ${ok(same)} ${rel}`);
      if (!same) failures += 1;
    }
  }

  console.log('');
  console.log(failures === 0
    ? '══ ALL CONTROLS BEHAVED AS DECLARED ═══════════════════════════════════════'
    : `══ ${failures} CONTROL(S) DID NOT BEHAVE AS DECLARED ════════════════════════`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] !== '--child') await main();
