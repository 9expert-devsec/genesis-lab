/**
 * REHEARSAL — break the registrations page chrome seven ways, and prove the
 * suite goes RED for each.
 *
 * ══ WHY A SCRIPT AND NOT SEVEN MORE TESTS ═══════════════════════════════════
 *
 * The controls inside the test files are string probes: they hand a matcher a
 * hand-written "broken" string and check it reacts. That proves the MATCHER
 * works. It cannot prove the matcher is pointed at the real component, because
 * the real component is never edited.
 *
 * This edits the real components. Each case mutates one or more files on disk,
 * runs the guarding tests in a FRESH process (module caches make in-process
 * re-runs meaningless), and asserts the expected test names actually fail — and,
 * where it matters, that the tests which should NOT have noticed stayed green.
 * Then it puts every file back.
 *
 * ══ THIS RESTORES EVERY FILE, ALWAYS ════════════════════════════════════════
 *
 * The original bytes of every target are held in memory and rewritten in a
 * `finally`, including on a thrown error or a Ctrl-C. Nothing here touches git,
 * the network or a database. Run it on a clean tree so `git checkout` is a real
 * fallback.
 *
 * ── THE TWO CASES THAT ARE FINDINGS RATHER THAN CONFIRMATIONS ───────────────
 *
 * Cases 3 and 4 each assert something STAYS GREEN, and that half is the point:
 *
 *   3. hard-coding the lock as `s.value === 'paid'` reddens NOTHING in the
 *      render tier. The lock count is identical, because for today's transition
 *      table the shortcut and the derivation give the same answer. Only the
 *      source-level vocabulary guard can see it. This is why that guard exists;
 *      without this case it would look like belt-and-braces.
 *
 *   4. interpolating an arbitrary-value class reddens NOTHING in the render
 *      tier either — the markup is byte-identical, because the template literal
 *      evaluates to exactly the class the literal form produces. What is missing
 *      is the CSS RULE. This is the standing finding from commit 1, restated on
 *      this round's geometry, and it is the reason the harvest guard compiles
 *      source rather than reading markup.
 *
 * Usage: node scripts/_rehearse-list-chrome-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CLIENT = 'src/app/admin/registrations/_components/RegistrationsClient.jsx';
const PANEL  = 'src/app/admin/registrations/_components/ListPanel.jsx';
const PAGE   = 'src/app/admin/registrations/page.jsx';

const WIRING     = 'test/fs/registrationsFilterWiring.test.mjs';
const VOCABULARY = 'test/fs/registrationsListVocabulary.test.mjs';
const CHROME     = 'test/render/registrationsPageChrome.test.mjs';
const TAILWIND   = 'test/fs/tailwindArbitraryValueRules.test.mjs';
const URLFILTER  = 'test/fs/urlFilterNoState.test.mjs';
const STRIP      = 'test/render/registrationsStatStrip.test.mjs';

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

/**
 * ── THE WORKING TREE IS CRLF, AND THE CASES BELOW ARE WRITTEN WITH `\n` ─────
 *
 * A multi-line `find` written with bare `\n` matches NOTHING in a CRLF file.
 * That is defect 4 from the header of test/sourceScan.mjs arriving in a
 * rehearsal script instead of a guard, and it is worse here: a mutation that
 * matched nothing would run the suite against unmodified source and report "the
 * guard did not fire".
 *
 * It did not get the chance — the exactly-once check caught it on case 2, which
 * is what that check is for. Rather than writing `\r\n` into eight case literals
 * and hoping the next author remembers, the newlines are translated to whatever
 * the FILE actually uses, once, here.
 */
function withEol(text, file) {
  return file.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');
}

const ok = (b) => (b ? '✓' : '✖');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * One mutation, as a list of edits across one or more files.
 *
 * Every `find` must appear EXACTLY ONCE in its file. A mutation that silently
 * matched nothing would run the suite against unmodified source, watch it stay
 * green, and report "the guard did not fire" — the most misleading possible
 * outcome for a script whose whole job is to make things fail. A miss is a hard
 * error, and so is a `find` that matches twice.
 */
const CASES = [
  {
    name: '1. the toggle badge drops the range filter',
    why: 'the mockup shows raw totals — a badge reading 9 beside a card reading 1 under "7 วัน"',
    edits: [{
      file: PAGE,
      find: 'getRegistrationTotal({ range, source: otherSource }),',
      replace: 'getRegistrationTotal({ source: otherSource }),',
    }],
    files: [WIRING],
    mustFail: ['the toggle badge follows the SAME range filter as everything else'],
  },
  {
    name: '2. the toggle badge becomes a serial await',
    why: 'the brief said it joins the Promise.all; a serial round-trip for one integer is what that forbids',
    edits: [{
      file: PAGE,
      find: '  const [data, counts, otherTotal, courseNames] = await Promise.all([',
      replace: '  const [data, counts, courseNames] = await Promise.all([',
    }, {
      file: PAGE,
      find: '    getRegistrationTotal({ range, source: otherSource }),\n',
      replace: '',
    }, {
      file: PAGE,
      find: '  // ONE audit query for the whole page',
      replace: '  const otherTotal = await getRegistrationTotal({ range, source: otherSource });\n\n  // ONE audit query for the whole page',
    }],
    files: [WIRING],
    mustFail: ['the other source’s total is fetched IN the Promise.all, not awaited after it'],
  },
  {
    name: '3. the lock is hard-coded to `paid` instead of derived',
    why: 'the shortest way to write the lock, and the render tier cannot tell the difference',
    edits: [{
      file: CLIENT,
      find: '.filter((s) => isSystemSet(s.value, source))',
      replace: ".filter((s) => s.value === 'paid')",
    }],
    files: [VOCABULARY, CHROME],
    mustFail: [
      'RegistrationsClient.jsx: no status VALUE appears as a string literal',
      'the summary card decides the lock by asking the transition table',
    ],
    /**
     * THE FINDING. The lock still lands on exactly the same card, so every
     * render assertion — how many locks, which card, the sub-line wording —
     * is satisfied by the hard-coded form. A screen test cannot distinguish a
     * derivation from a coincidence that agrees with it.
     */
    mustStillPass: [
      'the public strip locks exactly one card, and it is the system-set status',
      'the in-house strip locks nothing',
      'the overview sub-line says the cards filter, and names the locked status from the module',
    ],
  },
  {
    name: '4. an arbitrary-value class is interpolated rather than literal',
    why: 'correct markup, no CSS — the defect that shipped the /schedule hover past 3325 green tests',
    edits: [{
      file: PANEL,
      find: 'className="w-[477px] shrink-0 pr-[18px] pt-[13.5px]"',
      replace: 'className={`w-[${477}px] shrink-0 pr-[18px] pt-[13.5px]`}',
    }],
    files: [TAILWIND, CHROME, WIRING],
    mustFail: [
      'every arbitrary-value class the registrations screens RENDER compiles to a rule',
      // The source-level width assertion sees it too, from the other direction.
      'the panel header builds no filter button',
    ],
    /**
     * THE OTHER FINDING, and the older one. The rendered class attribute is
     * IDENTICAL — `w-[477px]` either way — so the whole render tier is blind.
     * The search box would be 477px wide in the markup and auto-width on the
     * screen, with nothing to grep for.
     */
    mustStillPass: [
      'no empty <p>/<span>/<div> is emitted on either source',
      'the toggle shows a count on the selected tab AND on the other one',
    ],
  },
  {
    name: '5. the status chip row comes back beside the cards',
    why: 'two controls for one filter — the shape the cards replaced, rebuilt from the same parts',
    edits: [{
      file: CLIENT,
      find: '  buildStatCards,\n',
      replace: '  buildStatCards,\n  buildStatusChips,\n',
    }, {
      file: CLIENT,
      find: '      </section>\n',
      replace: '      </section>\n'
        + '      <div className="flex flex-wrap gap-1.5">\n'
        + '        {buildStatusChips(sourceStatuses).map((opt) => (\n'
        + '          <button key={opt.value} type="button" className="rounded-full px-3 py-1 text-xs"\n'
        + "            onClick={() => navigate({ status: opt.value, page: '1' })}>{opt.label}</button>\n"
        + '        ))}\n'
        + '      </div>\n',
    }],
    files: [WIRING, CHROME],
    mustFail: [
      'no status chip row survives — the cards are the only status filter',
      'each status label appears in exactly ONE element — the card, not a card and a chip',
      'ทั้งหมด appears once as a card and once as a range chip — and nowhere else',
    ],
  },
  {
    name: '6. the empty footer renders anyway',
    why: 'a 54px bar with a border and nothing in it, under a table already saying ไม่พบรายการ',
    edits: [{
      file: PANEL,
      find: '      {(shown || pageCount > 1) ? (',
      replace: '      {true ? (',
    }],
    files: [CHROME],
    mustFail: ['no empty <p>/<span>/<div> is emitted on either source'],
  },
  {
    name: '7. the search box becomes controlled',
    why: 'not stale — FROZEN. With no state behind it the box stops accepting keystrokes entirely',
    edits: [{
      file: PANEL,
      find: '              defaultValue={q}',
      replace: '              value={q}',
    }],
    files: [URLFILTER, CHROME, STRIP],
    mustFail: ['ListPanel: the search input is uncontrolled and re-keyed on the term'],
    /**
     * A THIRD FINDING, and it was a wrong prediction before it was a finding.
     *
     * This case was written expecting the render tier to catch it too — there is
     * a test asserting the search box carries the URL's term, and making the box
     * controlled sounds like exactly the thing it guards. It stayed green, and
     * the reason is structural rather than a weak assertion:
     *
     *   REACT RENDERS `defaultValue` AND `value` IDENTICALLY IN STATIC MARKUP.
     *   Both emit `value="cpn"`. There is no server-rendered difference at all.
     *
     * So the whole render tier is blind to controlled-vs-uncontrolled, which is
     * the same shape as cases 3 and 4: the markup is right and the behaviour is
     * broken. And the behaviour here is not staleness — with no state behind it
     * the box stops accepting keystrokes entirely, which is the worse failure.
     *
     * Only the source scan can see it, which is why the ListPanel entry was
     * added to urlFilterNoState in this commit rather than left to the render
     * test that appears to cover it.
     */
    mustStillPass: [
      'the search input is uncontrolled and seeded from the q prop',
      'no empty <p>/<span>/<div> is emitted on either source',
    ],
  },
  {
    name: '8. the accent bar drops its aria-hidden',
    why: 'the one declared-decorative empty element — proving the exemption is narrow, not a hole',
    edits: [{
      file: CLIENT,
      find: '      <span aria-hidden="true" className={cn(\'absolute bottom-[1px]',
      replace: '      <span className={cn(\'absolute bottom-[1px]',
    }],
    files: [CHROME],
    mustFail: [
      'no empty <p>/<span>/<div> is emitted on either source',
      'CONTROL: the aria-hidden exemption is narrow — it blesses ONE element, not a class of them',
    ],
  },
];

const ALL_TARGETS = [CLIENT, PANEL, PAGE];
const ALL_TESTS   = [WIRING, VOCABULARY, CHROME, TAILWIND, URLFILTER, STRIP];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ LIST-CHROME CONTROL REHEARSAL ══════════════════════════════════════════');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    // The baseline. If the suite is not green BEFORE any mutation, every "it
    // went red" below is unattributable.
    console.log('── baseline (unmutated) ────────────────────────────────────────────────────');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`── ${c.name} ${'─'.repeat(Math.max(0, 71 - c.name.length))}`);
      console.log(`   ${c.why}`);

      // Apply, insisting each find is unique — after translating the case's
      // newlines to the file's own line endings. See withEol.
      const applied = c.edits.map((e) => {
        const before = original.get(e.file);
        return { file: e.file, find: withEol(e.find, before), replace: withEol(e.replace, before) };
      });
      for (const e of applied) {
        const hits = original.get(e.file).split(e.find).length - 1;
        if (hits !== 1) {
          throw new Error(
            `case "${c.name}": the find text occurs ${hits} times in ${e.file}, expected exactly 1.\n` +
            `  ${JSON.stringify(e.find.slice(0, 90))}`,
          );
        }
      }
      const mutated = new Map(original);
      for (const e of applied) {
        mutated.set(e.file, mutated.get(e.file).replace(e.find, e.replace));
      }
      for (const [rel, text] of mutated) writeFileSync(path.join(ROOT, rel), text);

      const r = runTests(c.files);

      for (const name of c.mustFail) {
        check(`RED: ${name}`, r.failed.includes(name),
          r.failed.includes(name) ? '' : `still green (failures: ${r.failed.join(' | ') || 'none'})`);
      }
      for (const name of c.mustStillPass ?? []) {
        check(`green: ${name}`, !r.failed.includes(name), r.failed.includes(name) ? 'went red unexpectedly' : '');
      }
      // Nothing OTHER than the declared set may fail, or the case is proving
      // less than it claims and more than it says.
      const declared = new Set(c.mustFail);
      const surprises = r.failed.filter((n) => !declared.has(n));
      check('no undeclared failures', surprises.length === 0,
        surprises.length ? surprises.join(' | ') : '');

      // Restore before the next case.
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
