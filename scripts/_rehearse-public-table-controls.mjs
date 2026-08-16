/**
 * REHEARSAL — break the rebuilt PUBLIC table eight ways, and prove the suite
 * goes RED for each.
 *
 * Same harness and same discipline as scripts/_rehearse-list-chrome-controls.mjs:
 * real edits to real files, a fresh process per case, every target restored in a
 * `finally`, and every `find` required to match EXACTLY ONCE so a mutation
 * cannot silently no-op and be reported as "the guard did not fire".
 *
 * ── THE CASES THAT ARE FINDINGS ─────────────────────────────────────────────
 *
 *   3. Making the row navigate by `router.push` reddens the render tier as well,
 *      because the anchors disappear. That is worth recording as the ONE row-nav
 *      mistake a render test can see — the subtler one it cannot see is an
 *      anchor that is present but whose behaviour is overridden, which is why
 *      the source scan exists too.
 *
 *   6. Reintroducing the status sub-line AS AN EM-DASH reddens the STRUCTURAL
 *      assertion and NOT the string-matching one. The brief said not to bring the
 *      line back as '—' or any other placeholder, and a guard that bans the five
 *      strings the design shows would have let it straight through. This case is
 *      why "chip only" is asserted as a shape.
 *
 * Usage: node scripts/_rehearse-public-table-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TABLE   = 'src/app/admin/registrations/_components/PublicTable.jsx';
const PARTS   = 'src/app/admin/registrations/_components/tableParts.jsx';
const ACTIONS = 'src/lib/actions/registrations.js';

const ROWLINK  = 'test/fs/registrationsRowLink.test.mjs';
const RENDER   = 'test/render/registrationsPublicTable.test.mjs';
const STRIP    = 'test/render/registrationsStatStrip.test.mjs';
const LABELS   = 'test/fs/publicStatusLabelSources.test.mjs';
const TAILWIND = 'test/fs/tailwindArbitraryValueRules.test.mjs';

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

/** The tree is CRLF; the cases below are written with `\n`. See the sibling script. */
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
    name: '1. a removed field creeps back into the projection',
    why: 'payment and pricing are whole subdocuments, fetched for twenty rows a page, read by nothing',
    edits: [{
      file: ACTIONS,
      find: ".select('courseName classDate scheduleType attendanceMode coordinator attendeesCount status createdAt')",
      replace: ".select('courseName classDate scheduleType attendanceMode coordinator attendeesCount status createdAt payment pricing')",
    }],
    files: [ROWLINK],
    mustFail: [
      'PublicTable: every projected field is rendered',
      'payment, pricing and requestInvoice have left the public projection',
    ],
  },
  {
    name: '2. a cell reads a field the projection does not carry',
    why: 'the failure looks like missing data, not like a bug — this whole table was once blank that way',
    edits: [{
      file: TABLE,
      find: '{row.attendeesCount ?? \'—\'}',
      replace: '{row.attendeesListProvided ?? \'—\'}',
    }],
    files: [ROWLINK, RENDER],
    mustFail: [
      'PublicTable: every field it renders is projected',
      'PublicTable: every projected field is rendered',
      'the attendee cell is the NUMBER ONLY — no ครบ / ยังไม่ครบ / แจ้งภายหลัง chip',
      // Declared rather than a surprise: the cell-index control asserts that
      // column 3 is the attendees cell BY ITS CONTENT, so a mutation that empties
      // that cell is exactly what it is meant to notice. A control that stayed
      // green while the cell it anchors on had changed would be the useless kind.
      'CONTROL: the cell extractor lands on the สถานะ column',
    ],
  },
  {
    name: '3. the row navigates by router.push instead of being a link',
    why: 'middle-click, cmd-click, copy-link and keyboard focus are all behaviours of an anchor',
    edits: [{
      file: PARTS,
      find: '    <Link\n      href={href}\n      tabIndex={first ? undefined : -1}',
      replace: '    <div\n      onClick={() => { window.location.href = href; }}\n      data-was={href}',
    }, {
      file: PARTS,
      find: '    </Link>\n  );\n}',
      replace: '    </div>\n  );\n}',
    }],
    files: [ROWLINK, RENDER],
    mustFail: [
      'the row link is a next/link Link with an href',
      'only the first cell of a row is a tab stop',
      'every cell of a row is an anchor pointing at that row’s detail page',
      'a row has exactly ONE keyboard tab stop',
      // Declared: swapping the anchor for a <div> puts a second element inside
      // every cell, including the สถานะ one, so the "chip only" shape assertion
      // reddens too. It is measuring what it says it measures — the cell now
      // really does contain two elements.
      'the สถานะ cell contains exactly one element: the chip',
    ],
  },
  {
    name: '4. every cell becomes a tab stop',
    why: 'six anchors a row is 120 tab stops on a page of twenty',
    edits: [{
      file: PARTS,
      find: '      tabIndex={first ? undefined : -1}\n',
      replace: '',
    }],
    files: [ROWLINK, RENDER],
    mustFail: [
      'only the first cell of a row is a tab stop',
      'a row has exactly ONE keyboard tab stop',
    ],
  },
  {
    name: '5. the attendee completeness chip is added back',
    why: 'ruled out — the cell is the number only, and deriving the chip means widening the projection',
    edits: [{
      file: TABLE,
      find: "                    {row.attendeesCount ?? '—'}\n                  </p>",
      replace: "                    {row.attendeesCount ?? '—'}\n                  </p>\n"
        + '                  <span className="text-[11px]">ครบ</span>',
    }],
    files: [RENDER],
    mustFail: ['the attendee cell is the NUMBER ONLY — no ครบ / ยังไม่ครบ / แจ้งภายหลัง chip'],
  },
  {
    name: '6. the status sub-line returns AS AN EM-DASH',
    why: 'the brief forbids the placeholder form specifically — and a string ban cannot see it',
    edits: [{
      file: PARTS,
      find: '      {statusLabel(status)}\n    </span>\n  );\n}',
      replace: '      {statusLabel(status)}\n    </span>\n  );\n}',
      // Replaced below — this case needs the chip WRAPPED, so the edit is on the
      // return statement rather than on the label.
    }],
    files: [RENDER],
    mustFail: ['the สถานะ cell contains exactly one element: the chip'],
    /**
     * THE FINDING. The string-matching test names the five sub-lines the design
     * shows and cannot see a dash — which is exactly the placeholder the brief
     * rules out by name. Only the structural assertion catches it.
     */
    mustStillPass: ['the status cell is the CHIP ONLY — no second line, and no placeholder for one'],
  },
  {
    name: '7. a content column is given a fixed px width',
    why: 'the layout has to survive the admin sidebar collapsing',
    edits: [{
      file: PARTS,
      find: '    return `calc((100% - ${chrome}px) * ${ratio.toFixed(6)} + ${pads[i]}px)`;',
      replace: '    return `${Math.round(1440 * c.share / 100) + pads[i]}px`;',
    }],
    files: [RENDER],
    mustFail: [
      'every content column is a proportion of the table, and only the chevron is fixed',
      'the column ratios are the measured shares, normalised',
    ],
  },
  {
    name: '8. an optional line loses its guard',
    why: 'the empty element that was invisible to text matching in rounds 1 and 2',
    edits: [{
      file: PARTS,
      find: '      {email ? (\n        <p className="truncate text-[12px] leading-[14.25px] text-[var(--text-muted)]">{email}</p>\n      ) : null}',
      replace: '      <p className="truncate text-[12px] leading-[14.25px] text-[var(--text-muted)]">{email}</p>',
    }],
    files: [RENDER],
    mustFail: [
      'no row in the whole table emits an empty element',
      'a coordinator with a name and no email renders ONE line, not one and a blank',
    ],
    /**
     * THE THIRD FINDING, and the one that changed the test file.
     *
     * The first version of this case declared `the sparse row emits no empty
     * element` and it stayed GREEN — with the guard deleted. Not a weak
     * assertion: REDUNDANCY IN THE CODE, which is explanation (3) in the header
     * of test/run.mjs and the one that gets missed because it looks identical to
     * a weak test.
     *
     * CoordinatorCell answers "everything is missing" with a dash BEFORE it
     * reaches the per-line guards. SPARSE has no name, no email and no phone, so
     * it takes that branch and never exercises the guard the mutation removed.
     * Every fixture in the file was on one side of that fork or the other.
     *
     * The fix was a FIXTURE, not an assertion: a row with a name and no email
     * reaches the second branch. The sparse row still cannot see this defect and
     * is declared green here to say so, rather than being quietly dropped from
     * the list — the shape of the blind spot is the finding.
     */
    mustStillPass: ['the sparse row emits no empty element'],
  },
];

// Case 6's edit is written here rather than inline, because it wraps the chip's
// whole return value and the literal is easier to read on its own.
CASES[5].edits = [{
  file: PARTS,
  find: '  return (\n    <span className={cn(\n'
    + "      'inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',",
  replace: '  return (\n    <>\n    <p className="text-[11px] text-[var(--text-muted)]">—</p>\n'
    + '    <span className={cn(\n'
    + "      'inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-[9px] text-[12px] font-semibold',",
}, {
  file: PARTS,
  find: '      {statusLabel(status)}\n    </span>\n  );\n}',
  replace: '      {statusLabel(status)}\n    </span>\n    </>\n  );\n}',
}];

const ALL_TARGETS = [TABLE, PARTS, ACTIONS];
const ALL_TESTS   = [ROWLINK, RENDER, STRIP, LABELS, TAILWIND];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ PUBLIC-TABLE CONTROL REHEARSAL ═════════════════════════════════════════');
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
