/**
 * REHEARSAL — put the dark strip back, and prove the guards notice.
 *
 * ══ WHY A DELETION NEEDS CONTROLS AT ALL ════════════════════════════════════
 *
 * The standing failure mode of a removal is not that the code breaks. It is
 * that the ASSERTIONS ABOUT THE REMOVED THING are left in place and quietly stop
 * meaning anything — a probe bounded by a class that no longer renders, a
 * `!includes(...)` that is trivially true of every possible page, a region
 * `slice(start, -1)` that silently widens to the whole document. All three of
 * those are real shapes from this repo's history, and the last one is the one
 * this round actually hit: `statusBarRegion` was bounded above by the strip's
 * own `h-[93px]`, so deleting the strip would have turned it into a probe over
 * the entire page with nothing failing.
 *
 * So these cases are not "does the delete work". They are: DOES THE REPLACEMENT
 * SET OF ASSERTIONS STILL HAVE TEETH, and would it catch the strip coming back.
 *
 * Usage: node scripts/_rehearse-strip-removal-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUB   = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';

const SHELL_T = 'test/render/registrationDetailShell.test.mjs';
const TAB_T   = 'test/render/registrationAttendeeTab.test.mjs';
const RO_T    = 'test/render/registrationCancelledReadOnly.test.mjs';

const ALL_TARGETS = [SHELL, PUB];
const ALL_TESTS   = [SHELL_T, TAB_T, RO_T];

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

/** The component as it was, verbatim, so the "it came back" case is realistic. */
const STRIP_COMPONENT = `
export function SummaryStrip({ cells }) {
  return (
    <div className="mt-[16px] flex h-[93px] items-stretch overflow-hidden rounded-9e-lg bg-9e-navy px-[4px] py-[4px]">
      <div className="flex min-w-0 flex-1 divide-x divide-9e-ice/15">
        {cells.map((cell) => (
          <div key={cell.key} className="min-w-0 px-[17px] pt-[14px]">
            <p className="whitespace-nowrap text-[11px] leading-[15px] text-9e-ice/60">{cell.label}</p>
            <p className="truncate text-[20px] font-bold leading-[23.5px] text-9e-ice">{cell.value}</p>
            {cell.sub ? (
              <p className="truncate text-[11px] leading-[16.5px] text-9e-ice/70">{cell.sub}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab list ─────`;

const CASES = [
  {
    name: '1. THE STRIP COMES BACK on the public screen',
    why: 'the removal is the deliverable; this is what says it stayed removed',
    edits: [
      { file: SHELL, find: '\n// ── Tab list ─────', replace: STRIP_COMPONENT },
      {
        file: PUB,
        find: '  EqualSummaryRow, TabList, TabPanel, SectionCard, SystemCard,',
        replace: '  SummaryStrip, EqualSummaryRow, TabList, TabPanel, SectionCard, SystemCard,',
      },
      {
        file: PUB,
        find: '      <DetailError message={error} />',
        replace: "      <SummaryStrip cells={[{ key: 'round', label: 'รอบอบรม', value: course.classDate || '—' }]} />\n\n      <DetailError message={error} />",
      },
    ],
    files: [SHELL_T],
    mustFail: [
      'nothing on either screen still renders the strip',
      'the tab list moved up under the status bar, keeping the 16px',
    ],
  },
  {
    name: '2. the 16px rhythm is lost when the tabs move up',
    why: 'the instruction was "the tab list moves up KEEPING the 16px rhythm"',
    edits: [{
      file: SHELL,
      find: '      className="mt-[16px] flex h-[49px] items-center gap-[4px] rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[5px]"',
      replace: '      className="mt-[30px] flex h-[49px] items-center gap-[4px] rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-[5px]"',
    }],
    files: [SHELL_T],
    mustFail: ['the tab list moved up under the status bar, keeping the 16px'],
  },
  {
    name: '3. the roster derivation loses its opted-out branch',
    why: 're-pointed from the strip to the tab cell — this proves the re-point still bites',
    edits: [{
      file: PUB,
      find: "      value: roster.state === 'not-provided'\n        ? 'ยังไม่แจ้ง'\n        : `${roster.state === 'complete' ? 'ครบ' : 'ยังไม่ครบ'} ${roster.named}/${roster.count}`,",
      replace: '      value: `${roster.state === \'complete\' ? \'ครบ\' : \'ยังไม่ครบ\'} ${roster.named}/${roster.count}`,',
    }],
    files: [SHELL_T, TAB_T],
    mustFail: [
      'all three roster branches still render — on the surface that survived',
      'the ความครบถ้วน cell and the card sentence agree, in different words',
    ],
  },
  {
    name: '4. the status-bar probe is left unbounded',
    why: 'THE ACTUAL TRAP THIS ROUND HIT — an upper bound that no longer renders widens the probe to the whole page',
    edits: [{
      file: RO_T,
      find: "  const end = markup.indexOf('role=\"tablist\"', start);\n  assert.notEqual(end, -1, 'the status bar is not followed by the tab list — the probe would over-read');",
      replace: "  const end = markup.indexOf('h-[93px]', start);",
    }],
    files: [RO_T],
    /**
     * ONE TEST REDDENS, AND IT IS THE RIGHT ONE.
     *
     * The declared list was guessed at first and named two tests that do not
     * exist under those titles; the run reported them still green and named the
     * one that actually fired. Recorded rather than quietly corrected, because
     * "still green" from a mis-named expectation looks identical to "the guard
     * has no teeth", and the difference is the whole reason a control reports
     * the failures it saw instead of only the ones it was asked about.
     *
     * What fires is the deepEqual on the status bar's offered transitions: with
     * the upper bound unfindable, `indexOf` returns -1, `slice(start, -1)` widens
     * the region to nearly the whole page, and the attendee table's per-row "•••"
     * items are swallowed into the status bar's item list. That is exactly the
     * over-read the bound exists to prevent.
     */
    mustFail: ['a pending document offers both of its transitions'],
  },
];

async function main() {
  const original = new Map(
    [...ALL_TARGETS, RO_T].map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ DARK-STRIP REMOVAL CONTROL REHEARSAL ═══════════════════════════════════');
  for (const rel of original.keys()) console.log(`   target: ${rel}`);
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

      for (const e of applied) {
        const landed = readFileSync(path.join(ROOT, e.file), 'utf8') !== original.get(e.file);
        check(`the mutation landed in ${e.file}`, landed, landed ? '' : 'file is byte-identical');
      }

      const r = runTests(c.files);

      for (const name of c.mustFail) {
        check(`RED: ${name}`, r.failed.includes(name),
          r.failed.includes(name) ? '' : `still green (failures: ${r.failed.join(' | ') || 'none'})`);
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
    for (const rel of original.keys()) {
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
