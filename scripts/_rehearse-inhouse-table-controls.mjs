/**
 * REHEARSAL — break the rebuilt IN-HOUSE table eight ways, and prove the suite
 * goes RED for each.
 *
 * Same harness as the two sibling scripts: real edits to real files, a fresh
 * process per case, every target restored in a `finally`, and every `find`
 * required to match EXACTLY ONCE so a mutation cannot silently no-op.
 *
 * ── THE CASES THAT ARE FINDINGS ─────────────────────────────────────────────
 *
 *   2. Deleting the course cell's second-row guard reddens ONE fixture and no
 *      others. Only a row with an unresolvable code AND no preferred month can
 *      produce the empty element — every other row has something to put in the
 *      row. That fixture exists because the equivalent control on the public
 *      table fired nothing one commit ago, for the same reason (a branch covered
 *      by a sibling branch), and the lesson was carried over rather than
 *      re-learned.
 *
 *   7. Pointing the row at the PUBLIC detail route breaks every row lookup in
 *      the render file, so the whole file reddens rather than one assertion.
 *      That is declared with `allowExtra` and is the honest outcome: a row link
 *      to the wrong collection is not a cosmetic fault, it is a 404 on a record
 *      that exists with a working page one segment away.
 *
 * Usage: node scripts/_rehearse-inhouse-table-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TABLE = 'src/app/admin/registrations/_components/InhouseTable.jsx';
const PARTS = 'src/app/admin/registrations/_components/tableParts.jsx';

const RENDER  = 'test/render/registrationsInhouseTable.test.mjs';
const STRIP   = 'test/render/registrationsStatStrip.test.mjs';
const ROWLINK = 'test/fs/registrationsRowLink.test.mjs';
const LABELS  = 'test/fs/publicStatusLabelSources.test.mjs';
const VOCAB   = 'test/fs/registrationsListVocabulary.test.mjs';

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
    name: '1. เดือนที่สนใจ is dropped instead of rehomed',
    why: 'the field renders today and was not on the removal list — silence is not a removal',
    edits: [{
      file: TABLE,
      find: '                    month={fmtMonth(row.preferredMonth)}\n',
      replace: '',
    }],
    files: [RENDER, ROWLINK],
    mustFail: [
      'เดือนที่สนใจ has a home — it did not leave with its column',
      'a resolved course shows the NAME over the code, with the month beside it',
      'an unresolved code WITH a month keeps the row, showing the month alone',
      // The projection guard sees it from the other side: preferredMonth is
      // still selected and is now rendered by nothing.
      'InhouseTable: every projected field is rendered',
    ],
  },
  {
    name: '2. the course cell’s second-row guard is removed',
    why: 'a 32px row with nothing in it — the empty element that shipped twice',
    edits: [{
      file: TABLE,
      find: '      {hasSecondRow ? (',
      replace: '      {true ? (',
    }],
    files: [RENDER],
    mustFail: [
      'an unresolved code with NO month drops the second row entirely',
      'no row emits an empty element',
    ],
    /**
     * THE FINDING, carried over rather than re-learned. Only ONE fixture can
     * produce this empty element: a row whose code does not resolve AND which
     * has no preferred month. Every other row has a code or a month to put in
     * the second slot, so every other row's assertions stay green while the
     * table is broken.
     *
     * The equivalent control on the public table fired NOTHING one commit ago
     * for exactly this reason — a branch fully covered by a sibling branch — and
     * the fixture here was written up front because of it.
     */
    mustStillPass: [
      'a resolved course shows the NAME over the code, with the month beside it',
      'an unresolved code WITH a month keeps the row, showing the month alone',
      'the bare row renders dashes, not blanks, and still no empty element',
    ],
  },
  {
    name: '3. contactPhone is dropped from the coordinator cell',
    why: 'kept by ruling — an in-house enquiry is followed up by telephone',
    edits: [{
      file: TABLE,
      find: '                    phone={row.contactPhone}\n',
      replace: '',
    }],
    files: [RENDER, ROWLINK],
    mustFail: [
      'contactPhone stays — it is the third line of the coordinator cell',
      'InhouseTable: every projected field is rendered',
    ],
  },
  {
    name: '4. an unknown training format is replaced by a default',
    why: 'the rule this chip exists for: no branch may substitute a value the document does not hold',
    edits: [{
      file: TABLE,
      find: '          {known?.label ?? format}',
      replace: "          {known?.label ?? 'Onsite'}",
    }],
    files: [RENDER],
    mustFail: ['an unknown training format renders ITSELF, never a substituted default'],
  },
  {
    name: '5. the status chip gains a second line',
    why: 'ruled out — the cell is the chip only, including as a placeholder',
    edits: [{
      file: TABLE,
      find: '                  <StatusCell status={row.status} />',
      replace: '                  <StatusCell status={row.status} />\n'
        + '                  <p className="text-[11px] text-[var(--text-muted)]">—</p>',
    }],
    files: [RENDER],
    mustFail: ['the สถานะ cell contains exactly one element: the chip'],
  },
  {
    name: '6. the in-house gap is set to the public 18px',
    why: 'seven columns, not six — the gap feeds the chrome the ratios are calculated against',
    edits: [{
      file: TABLE,
      find: 'const COLUMN_GAP = 16;',
      replace: 'const COLUMN_GAP = 18;',
    }],
    files: [RENDER],
    mustFail: ['CONTROL: the in-house gap is 16px, not the public 18px'],
    /**
     * The RATIOS are unaffected — they are normalised against whatever the
     * chrome works out to — so the two width tests stay green. That is correct
     * and is why the gap needs a check of its own: the columns would keep their
     * proportions to each other and every one of them would be in the wrong
     * place.
     */
    mustStillPass: ['the column ratios are the measured in-house shares, normalised'],
  },
  {
    name: '7. the row links to the PUBLIC detail route',
    why: 'separate collections — an in-house _id sent to /admin/registrations/[id] is a 404 on a record that exists',
    edits: [{
      file: TABLE,
      find: '  const href = detailHref ?? ((id) => `/admin/registrations/inhouse/${id}`);',
      replace: '  const href = detailHref ?? ((id) => `/admin/registrations/${id}`);',
    }],
    files: [RENDER],
    mustFail: ['every cell of a row is an anchor to the IN-HOUSE detail route'],
    /**
     * EVERY row-level assertion in the file reddens, because `rowFor` finds a row
     * by the href its links carry and no row carries the expected one any more.
     * That is not noise — a row link pointing at the wrong collection means every
     * row on the screen navigates to a 404 — so the extra failures are allowed
     * rather than enumerated.
     */
    allowExtra: true,
  },
  {
    name: '8. the in-house body draws its own status chip again',
    why: 'two copies of one vocabulary is the drift three commits have been removing',
    edits: [{
      file: TABLE,
      find: "import {\n  CellLink,",
      replace: "import { statusBadge, statusLabel } from '@/lib/registrations/statuses';\nimport {\n  CellLink,",
    }, {
      file: TABLE,
      find: '                  <StatusCell status={row.status} />',
      replace: '                  <span className={cn(\'inline-flex h-[26px] items-center rounded-full px-[9px]\', statusBadge(row.status))}>\n'
        + '                    {statusLabel(row.status)}\n'
        + '                  </span>',
    }],
    files: [LABELS, VOCAB, RENDER],
    mustFail: ['neither table body holds a สถานะ cell of its own'],
  },
];

const ALL_TARGETS = [TABLE, PARTS];
const ALL_TESTS   = [RENDER, STRIP, ROWLINK, LABELS, VOCAB];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ IN-HOUSE-TABLE CONTROL REHEARSAL ═══════════════════════════════════════');
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
      if (c.allowExtra) {
        console.log(`     · ${r.failed.length} test(s) failed in total (extra failures allowed for this case)`);
      } else {
        const declared = new Set(c.mustFail);
        const surprises = r.failed.filter((n) => !declared.has(n));
        check('no undeclared failures', surprises.length === 0, surprises.length ? surprises.join(' | ') : '');
      }

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
