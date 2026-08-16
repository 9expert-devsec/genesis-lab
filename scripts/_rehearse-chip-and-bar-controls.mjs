/**
 * REHEARSAL — reintroduce the two click-test defects, and prove the suite goes
 * RED for each.
 *
 * Same harness as the three sibling scripts: real edits to real files, a fresh
 * process per case, every target restored in a `finally`, and every `find`
 * required to match EXACTLY ONCE.
 *
 * ══ WHY EVERY CASE HERE CARRIES A `mustStillPass` LIST ══════════════════════
 *
 * Both defects SHIPPED PAST A GREEN SUITE of 4344 tests, and the point of this
 * script is not only that the new assertions fire — it is to show precisely how
 * much of the existing suite stays green while the screen is visibly wrong.
 *
 * That is the whole argument for the assertions being compiled-CSS ones. The
 * status chip is exactly one element whether it is 117px or 155px wide; the
 * accent bar is one span whether or not it escapes the corner. Markup assertions
 * cannot separate those, and the class list already read `inline-flex` while the
 * chip rendered as a block, so a source scan could not either.
 *
 * Usage: node scripts/_rehearse-chip-and-bar-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PARTS  = 'src/app/admin/registrations/_components/tableParts.jsx';
const CLIENT = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const INH    = 'src/app/admin/registrations/_components/InhouseTable.jsx';

const HARVEST = 'test/fs/tailwindArbitraryValueRules.test.mjs';
const PUB     = 'test/render/registrationsPublicTable.test.mjs';
const INHR    = 'test/render/registrationsInhouseTable.test.mjs';
const CHROME  = 'test/render/registrationsPageChrome.test.mjs';

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
    name: '1. the status chip loses its width constraint (THE DEFECT)',
    why: 'the flex-column parent stretches it across the whole column — inline-flex does not save it',
    edits: [{
      file: PARTS,
      find: "      'inline-flex h-[26px] w-fit items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',",
      replace: "      'inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',",
    }],
    files: [HARVEST, PUB, INHR],
    mustFail: ['the status chip’s compiled CSS constrains its width to its content'],
    /**
     * THE MEASUREMENT THIS SCRIPT EXISTS FOR. This is the defect exactly as it
     * shipped, and the entire render tier stays green: the chip is one element,
     * in the right cell, with the right label and the right colour, whether it
     * is content-width or full-width.
     */
    mustStillPass: [
      'the สถานะ cell contains exactly one element: the chip',
      'the status cell is the CHIP ONLY — no second line, and no placeholder for one',
      'an unrecognised status renders its raw value and the NEUTRAL chip',
      'no row in the whole table emits an empty element',
    ],
  },
  {
    name: '2. CellLink gains items-start (the fix that would make w-fit redundant)',
    why: 'the pair has to be re-read together — it also changes how the truncating paragraphs are sized',
    edits: [{
      file: PARTS,
      find: "      className={cn('flex h-[82px] flex-col justify-center', className)}",
      replace: "      className={cn('flex h-[82px] flex-col items-start justify-center', className)}",
    }],
    files: [HARVEST],
    mustFail: ['CellLink stretches its children by default — which is why the chip must constrain itself'],
  },
  {
    name: '3. the summary card loses its clip (THE DEFECT)',
    why: 'a straight 4px bar against a 16px corner arc, with nothing to cut it off',
    edits: [{
      file: CLIENT,
      find: "        'relative h-[82px] w-full overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] text-left transition-shadow hover:shadow-9e-sm',",
      replace: "        'relative h-[82px] w-full rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] text-left transition-shadow hover:shadow-9e-sm',",
    }],
    files: [HARVEST, CHROME],
    mustFail: ['the summary card clips its accent bar to its own radius'],
    /**
     * The second measurement. The bar is present, decorative, `aria-hidden`, one
     * element, one per card — every one of those assertions holds while the bar
     * is drawing outside the card.
     */
    mustStillPass: [
      'no empty <p>/<span>/<div> is emitted on either source',
      'CONTROL: the aria-hidden exemption is narrow — it blesses ONE element, not a class of them',
      'the public strip locks exactly one card, and it is the system-set status',
    ],
  },
  {
    name: '4. the accent bar takes its own radius back',
    why: 'on a 4px-wide box CSS scales a 16px radius to ~2px — it cannot follow the card',
    edits: [{
      file: CLIENT,
      find: "      <span aria-hidden=\"true\" className={cn('absolute bottom-[1px] left-[1px] top-[1px] w-0', accentCls)} />",
      replace: "      <span aria-hidden=\"true\" className={cn('absolute bottom-[1px] left-[1px] top-[1px] w-0 rounded-l-9e-lg', accentCls)} />",
    }],
    files: [HARVEST],
    mustFail: ['the accent bar sets no radius of its own'],
  },
  {
    name: '5. the in-house mode chip stops using w-fit',
    why: 'the status chip was fixed BY MATCHING it — if it changes, the comment is stale',
    edits: [{
      file: INH,
      find: "          'inline-flex h-[23px] w-fit shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
      replace: "          'inline-flex h-[23px] shrink-0 items-center whitespace-nowrap rounded-full px-[7px] text-[11px] font-semibold',",
    }],
    files: [HARVEST],
    mustFail: ['the in-house mode chip uses the SAME mechanism, so "match the others" stays true'],
  },
];

const ALL_TARGETS = [PARTS, CLIENT, INH];
const ALL_TESTS   = [HARVEST, PUB, INHR, CHROME];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ CHIP-AND-BAR CONTROL REHEARSAL ═════════════════════════════════════════');
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
      if (c.mustStillPass) {
        console.log(`     · ${r.passed} test(s) still passed while the screen was visibly wrong`);
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
