/**
 * REHEARSAL — break the /schedule round's hover ring three ways, and prove the
 * suite goes RED for each.
 *
 * ══ WHY A SCRIPT AND NOT THREE MORE TESTS ═══════════════════════════════════
 *
 * The controls already inside the test files are string probes: they hand a
 * matcher a hand-written "broken" string and check it reacts. That proves the
 * MATCHER works. It cannot prove the matcher is pointed at the real component,
 * because the real component is never edited.
 *
 * This edits the real component. Each case mutates
 * src/app/(public)/schedule/_components/ScheduleClient.jsx on disk, shows the
 * line that changed, runs the guarding tests in a FRESH process (module caches
 * make in-process re-runs meaningless), and asserts the expected test names
 * actually fail. Then it puts the file back.
 *
 * ══ THIS RESTORES THE FILE, ALWAYS ══════════════════════════════════════════
 *
 * The original bytes are held in memory and rewritten in a `finally`, including
 * on a thrown error or a Ctrl-C. If it ever exits without restoring, the file is
 * one `git checkout` away — nothing here touches git, the network, or a
 * database. Run it on a clean tree so that fallback is real.
 *
 * ── THE FOUR CASES ──────────────────────────────────────────────────────────
 *   1. ring on the INERT branch   a sold-out round lights up under the pointer
 *   2. the `color:` hint dropped  `ring-[…]` is contested by a width utility and
 *                                 a colour utility, so a bare var() is a guess
 *   3. drifting variable name     the inline style key stops matching the name
 *                                 the class spells out
 *   4. the --tw-ring-color        setting Tailwind's internal inline colours the
 *      shortcut                   ring with one fewer class — and outranks the
 *                                 app-wide *:focus-visible rule, dropping the
 *                                 keyboard focus indicator to 1.90:1 on a
 *                                 classroom round against a white page
 *
 * Case 4 is the one a reviewer is most likely to propose as a simplification,
 * which is exactly why it is rehearsed: it is invisible to a mouse and invisible
 * on the dark theme.
 *
 * Cases 2 and 3 are asymmetric on purpose and the asymmetry is the finding, not
 * a gap: the RENDER tests catch a drift on the component's style side, while the
 * compiled guard catches one on the class/Tailwind side. Neither sees both
 * directions, which is why both exist, and each case asserts what must STAY
 * GREEN as well as what must redden rather than pretending one test covers it.
 *
 * Usage: node scripts/_rehearse-round-ring-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = path.join(ROOT, 'src/app/(public)/schedule/_components/ScheduleClient.jsx');

const RENDER_TESTS = [
  'test/render/scheduleFullRoundNotClickable.test.mjs',
  'test/render/scheduleRoundRowAffordance.test.mjs',
];
const COMPILED_GUARD = ['test/fs/tailwindArbitraryValueRules.test.mjs'];

// ─────────────────────────────────────────────────────────────────────────────
// Child mode: register the suite's loader (so `@/…` resolves) and run the test
// files named on argv, reporting the failed test names as JSON on stdout.
// Self-spawning keeps this one file rather than adding a runner beside it.
// ─────────────────────────────────────────────────────────────────────────────
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
  stream.on('close', () => {
    console.log(`__RESULT__${JSON.stringify({ passed, failed })}`);
  });
}

// `main()` is invoked at the BOTTOM of this file, not here: `check` and `CASES`
// are `const`, so calling it from this branch would hit the temporal dead zone.

function runTests(files) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error('the child produced no result line — it probably failed to start');
  }
  return JSON.parse(line.slice('__RESULT__'.length));
}

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * One mutation of the component.
 *
 * `find` must appear EXACTLY ONCE. A mutation that silently matched nothing
 * would run the suite against unmodified source, watch it stay green, and report
 * "the guard did not fire" — the most misleading possible outcome for a script
 * whose entire job is to make things fail. So a miss is a hard error.
 */
const CASES = [
  {
    name: 'ring on the INERT branch',
    why: 'a round nobody can book must not light up under the pointer',
    find: 'className={`cursor-not-allowed ${CELL_BOX}`}',
    replace: 'className={`cursor-not-allowed ${CELL_BOX} hover:ring-2`}',
    files: RENDER_TESTS,
    mustFail: ['the INERT round gets no hover class and neither hover variable'],
  },
  {
    name: 'the ring-colour class with its `color:` hint dropped',
    why: '`ring-[…]` is contested by a width utility and a colour utility, so an unhinted var() is a guess',
    find: ' hover:ring-2 hover:ring-[color:var(--round-ring)]";',
    replace: ' hover:ring-2 hover:ring-[var(--round-ring)]";',
    files: COMPILED_GUARD,
    mustFail: [
      'the /schedule round hover ring (colour): "hover:ring-[color:var(--round-ring)]" '
      + 'compiles to a --tw-ring-color rule',
    ],
    // The width class is untouched, so the ring still paints — in the preflight
    // default blue. That is the shape of the failure: not a missing ring, a
    // wrong-coloured one.
    mustStillPass: ['the /schedule round hover ring (width): "hover:ring-2" compiles to a box-shadow rule'],
  },
  {
    name: 'a drifting variable name (style key vs the class that reads it)',
    why: 'the name is written twice by necessity — the class must be a literal — so nothing holds the two in step',
    find: 'const ROUND_RING_VAR = "--round-ring";',
    replace: 'const ROUND_RING_VAR = "--round-rng";',
    files: [...RENDER_TESTS, ...COMPILED_GUARD],
    mustFail: [
      'the hover RING is the round’s own type colour, at full strength',
      'the desktop ScheduleCell markup is byte-identical to before this change',
    ],
    // The compiled guard reads Tailwind's output, not the component's style
    // object, so a drift on the STYLE side is invisible to it — it would still
    // see the class naming --round-ring and emitting a rule for it. That is the
    // split described in the header, asserted so a future edit that blurs it is
    // noticed rather than quietly relied on.
    mustStillPass: [
      'the /schedule round hover ring (colour): "hover:ring-[color:var(--round-ring)]" '
      + 'compiles to a --tw-ring-color rule',
    ],
  },
  {
    name: 'the `--tw-ring-color` shortcut (the focus-ring regression)',
    why: 'an inline Tailwind internal outranks *:focus-visible and repaints the keyboard focus indicator',
    find: '[ROUND_RING_VAR]: color,',
    replace: "'--tw-ring-color': color,",
    files: RENDER_TESTS,
    mustFail: [
      'the cell does NOT set --tw-ring-color inline — the focus ring stays brand blue',
      'the hover RING is the round’s own type colour, at full strength',
      'the desktop ScheduleCell markup is byte-identical to before this change',
    ],
  },
];

async function main() {
  const original = readFileSync(TARGET, 'utf8');

  console.log('');
  console.log('══ ROUND-RING CONTROL REHEARSAL ═══════════════════════════════════════════');
  console.log(`   target: ${path.relative(ROOT, TARGET)}`);
  console.log('   the file is restored in a finally, including on error');
  console.log('');

  try {
    // The baseline. If the suite is not green BEFORE any mutation, every "it
    // went red" below is unattributable.
    console.log('── baseline (unmutated) ────────────────────────────────────────────────────');
    const base = runTests([...RENDER_TESTS, ...COMPILED_GUARD]);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`── ${c.name} ${'─'.repeat(Math.max(0, 71 - c.name.length))}`);
      console.log(`   ${c.why}`);

      const hits = original.split(c.find).length - 1;
      if (hits !== 1) {
        throw new Error(
          `the mutation anchor matched ${hits} times, expected exactly 1:\n    ${c.find}\n`
          + 'The component moved. Fix the anchor rather than letting this run '
          + 'against unmodified source and report a false all-clear.',
        );
      }

      const mutated = original.replace(c.find, c.replace);
      writeFileSync(TARGET, mutated);

      // The diff, so "the break landed" is shown rather than asserted.
      console.log('   diff:');
      console.log(`     - ${c.find}`);
      console.log(`     + ${c.replace}`);
      check('the mutation changed the file', mutated !== original);

      const res = runTests(c.files);
      for (const name of c.mustFail) {
        check(`RED: ${name}`, res.failed.includes(name),
          res.failed.includes(name) ? '' : `still green (failed: ${res.failed.join(', ') || 'nothing'})`);
      }
      for (const name of c.mustStillPass ?? []) {
        check(`still green (by design): ${name}`, !res.failed.includes(name));
      }

      writeFileSync(TARGET, original);
      const restored = runTests(c.files);
      check('restored, and green again', restored.failed.length === 0,
        restored.failed.length ? `still failing: ${restored.failed.join(', ')}` : '');
      console.log('');
    }
  } finally {
    writeFileSync(TARGET, original);
  }

  console.log('══ ' + (failures === 0
    ? 'ALL CONTROLS FIRED — every break was caught'
    : `${failures} CHECK(S) DID NOT HOLD`) + ' ═══════════════════');
  console.log('');
  process.exitCode = failures === 0 ? 0 : 1;
}

// Parent mode only — the child branch above returns a result line and exits.
if (process.argv[2] !== '--child') await main();
