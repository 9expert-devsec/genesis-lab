/**
 * REHEARSAL — break the column rework six ways, and prove the suite goes RED.
 *
 * Same harness as the four sibling scripts.
 *
 * ── THE CASE THAT IS A FINDING ──────────────────────────────────────────────
 *   4. Removing the course cell's second-row guard reddens the empty-element
 *      assertion NOW and would NOT have reddened it before this commit. The row
 *      used to hold the schedule chip as well, and the chip has no empty branch,
 *      so the guard was vacuous — a condition that was always true. Moving the
 *      chip into its own column is what made it real. The guard's own comment
 *      says so, and this case is the measurement behind that claim.
 *
 * Usage: node scripts/_rehearse-column-rework-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PUBT = 'src/app/admin/registrations/_components/PublicTable.jsx';
const INHT = 'src/app/admin/registrations/_components/InhouseTable.jsx';
const PAGE = 'src/app/admin/registrations/page.jsx';

const PUBR    = 'test/render/registrationsPublicTable.test.mjs';
const INHR    = 'test/render/registrationsInhouseTable.test.mjs';
const STRIP   = 'test/render/registrationsStatStrip.test.mjs';
const SHELL   = 'test/render/adminFullHeightRoutes.test.mjs';
const HARVEST = 'test/fs/tailwindArbitraryValueRules.test.mjs';

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
    name: '1. the schedule chip is folded back into the course cell',
    why: 'sharing that 32px line is what truncated the course name on the first row',
    edits: [{
      file: PUBT,
      find: '                  <CourseCell name={row.courseName} classDate={row.classDate} />',
      replace: '                  <CourseCell name={row.courseName} classDate={row.classDate} />\n'
        + '                  <ScheduleBadge type={row.scheduleType} mode={row.attendanceMode} />',
    }],
    files: [PUBR],
    // Only ONE assertion here, and the first draft wrongly declared a second.
    // Folding the chip back does NOT create an empty element — the chip has
    // content — so the empty-element guard is correctly silent. It is the
    // CELL-PLACEMENT assertion that sees this, and nothing else does.
    mustFail: ['the schedule chip is in its OWN cell, not in the course cell'],
  },
  {
    name: '2. a public share is edited without its siblings',
    why: 'the proportions live in six places — the component, two comments, three tests',
    edits: [{
      file: PUBT,
      find: "  { key: 'attendees',   label: 'ผู้เข้าอบรม',        share:  5.5 },",
      replace: "  { key: 'attendees',   label: 'ผู้เข้าอบรม',        share: 11.7 },",
    }],
    files: [PUBR],
    mustFail: ['the column ratios are the measured shares, normalised'],
  },
  {
    name: '3. the สถานะ column is narrowed past its widest label',
    why: 'the chip is whitespace-nowrap, so it overflows rather than wraps',
    edits: [{
      file: INHT,
      find: "  { key: 'status',      label: 'สถานะ',            share: 10.0 },",
      replace: "  { key: 'status',      label: 'สถานะ',            share:  5.0 },",
    }],
    files: [INHR],
    mustFail: [
      'the สถานะ column clears the widest live label at a stated 0.65em advance',
      'the column ratios are the measured in-house shares, normalised',
    ],
  },
  {
    name: '4. the course cell’s second-row guard is removed',
    why: 'REAL only since the chip moved out — it was a vacuous condition before',
    edits: [{
      file: PUBT,
      find: '      {classDate ? (',
      replace: '      {true ? (',
    }],
    files: [PUBR],
    mustFail: [
      'the sparse row emits no empty element',
      'no row in the whole table emits an empty element',
      // NAME_ONLY inherits SPARSE's empty classDate, so it grows the empty row
      // too. Declared rather than a surprise: that fixture exists to reach a
      // DIFFERENT branch, and it catching this one as well is a bonus, not noise.
      'a coordinator with a name and no email renders ONE line, not one and a blank',
    ],
  },
  {
    name: '5. the moved chip loses its width constraint',
    why: 'in its own column it is a DIRECT child of CellLink — the status chip’s defect, inherited',
    edits: [{
      file: PUBT,
      find: "        'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
      replace: "        'inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
    }],
    files: [HARVEST],
    mustFail: ['every chip in both tables has a compiled width constraint'],
    /**
     * This is why the guard is a SWEEP. A named list of "chips that need w-fit"
     * would have been written before this chip moved and would not have covered
     * it — and in fact the sweep caught the real thing during the work: the two
     * branches of ScheduleBadge differ in indentation, one was updated and the
     * other was not.
     */
  },
  {
    name: '6. the page stops cancelling the shell’s top padding',
    why: 'the 24px band above the eyebrow, back — p-6 stacking with pt-[34px]',
    edits: [{
      file: PAGE,
      find: '    <div className="mx-auto -mt-6 max-w-7xl">',
      replace: '    <div className="mx-auto max-w-7xl">',
    }],
    files: [SHELL],
    mustFail: ['the registrations page cancels the shell’s top padding, and the two numbers agree'],
  },
];

const ALL_TARGETS = [PUBT, INHT, PAGE];
const ALL_TESTS   = [PUBR, INHR, STRIP, SHELL, HARVEST];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ COLUMN-REWORK CONTROL REHEARSAL ════════════════════════════════════════');
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
            `  ${JSON.stringify(e.find.slice(0, 110))}`,
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
