/**
 * REHEARSAL — break the new heading and the relocated reference number.
 *
 * ══ THE TWO THINGS BEING CONTROLLED ═════════════════════════════════════════
 *
 * 1. THE BARE COLON. The heading now depends on a field that can be missing, so
 *    `label : ${name}` renders `ข้อมูลการลงทะเบียน : ` at 40px on a record whose
 *    coordinator has no name. Case 1 puts that spelling back.
 *
 * 2. THE CONSEQUENCE CHAIN. Round 3 deleted the เลขอ้างอิง column from BOTH list
 *    tables because the detail heading carried the number. The heading no longer
 *    does, so the ข้อมูลระบบ row is the only place it survives outside a confirm
 *    dialog. Case 2 deletes that row — the state in which the reference number
 *    is in NO list, NO heading and NO card, which is what the brief called out
 *    as the chain to handle rather than discover later.
 *
 * Case 4 is the one that is not about a defect at all: it restores a padding the
 * USER removed by hand. Nothing pinned that decision before this round, which is
 * precisely how a hand edit gets undone by the next person who opens the design
 * file — so it is pinned, and this proves the pin holds.
 *
 * Usage: node scripts/_rehearse-detail-heading-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEADING = 'src/lib/registrations/detailHeading.js';
const SHELL   = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUB     = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INH     = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';

const PURE_T  = 'test/pure/registrationDetailHeading.test.mjs';
const SHELL_T = 'test/render/registrationDetailShell.test.mjs';

const ALL_TARGETS = [HEADING, SHELL, PUB, INH];
const ALL_TESTS   = [PURE_T, SHELL_T];

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
    name: '1. THE BARE COLON: the naive template goes back in',
    why: 'the exact spelling anyone writes first, on a record whose coordinator has no name',
    edits: [{
      file: HEADING,
      find: '  const trimmed = String(identifier ?? \'\').trim();\n  return trimmed ? `${DETAIL_HEADING_LABEL}${SEPARATOR}${trimmed}` : DETAIL_HEADING_LABEL;',
      replace: '  return `${DETAIL_HEADING_LABEL}${SEPARATOR}${identifier ?? \'\'}`;',
    }],
    files: ALL_TESTS,
    mustFail: [
      'an absent identifier renders the label ALONE — never a trailing colon',
      'the identifier is trimmed, so padding cannot fake a value',
      'a coordinator holding only whitespace is ABSENT, not present-and-blank',
      'a request with no company at all renders the label alone',
      'THE MISSING-FIELD FIXTURE: no bare colon on either screen',
    ],
  },
  {
    name: '2. THE CHAIN: the เลขอ้างอิง row is deleted from ข้อมูลระบบ',
    why: 'round 3 removed the column because the heading carried it; the heading no longer does',
    edits: [{
      file: PUB,
      find: '            <DLRow label="เลขอ้างอิง"      value={mono(refNo(doc._id))} />\n',
      replace: '',
    }],
    files: [SHELL_T],
    mustFail: ['refNo is in ข้อมูลระบบ and NOWHERE in the heading'],
  },
  {
    name: '3. the reference number goes back into the heading',
    why: 'the other half — asserting only "present in the card" would pass on a screen showing it twice',
    edits: [{
      file: PUB,
      find: '        title={detailHeading(publicHeadingIdentifier(doc))}',
      replace: '        title={`${detailHeading(publicHeadingIdentifier(doc))} ${refNo(doc._id)}`}',
    }],
    files: [SHELL_T],
    // The third is a CONSEQUENCE, not a surprise: appending anything to the
    // heading also breaks the record that is supposed to render the bare label,
    // because that record's heading is no longer the label alone. Declared
    // rather than filtered — an undeclared failure here would be indistinguishable
    // from a guard misfiring, and the harness is right to insist.
    mustFail: [
      'refNo is in ข้อมูลระบบ and NOWHERE in the heading',
      'both screens head with ข้อมูลการลงทะเบียน and their identifying field',
      'THE MISSING-FIELD FIXTURE: no bare colon on either screen',
    ],
  },
  {
    name: "4. the user's hand-removed BackLink padding is restored",
    why: 'a deliberate hand edit that nothing pinned before this round — the classic silent undo',
    edits: [{
      file: SHELL,
      find: '  return (\n    <div>\n      <div className="flex h-[40.5px] items-start">',
      replace: '  return (\n    <div className="pt-[30px]">\n      <div className="flex h-[40.5px] items-start">',
    }],
    files: [SHELL_T],
    mustFail: ['the BackLink carries NO top padding — the hand removal is deliberate'],
  },
  {
    name: '5. the in-house heading names the CONTACT instead of the company',
    why: 'both fields are on the record and either produces a heading that looks fine',
    edits: [{
      file: INH,
      find: '        title={detailHeading(inhouseHeadingIdentifier(doc))}',
      replace: '        title={detailHeading(contactName)}',
    }],
    files: [SHELL_T],
    // The third again follows: the no-company fixture keeps its CONTACT, so a
    // heading built from the contact name is no longer the bare label on the
    // very record that exists to prove the bare label renders.
    mustFail: [
      'THE IN-HOUSE CHOICE: the company heads the page, not the contact',
      'both screens head with ข้อมูลการลงทะเบียน and their identifying field',
      'THE MISSING-FIELD FIXTURE: no bare colon on either screen',
    ],
  },
  {
    name: '6. the divergent-company precedence is inverted',
    why: 'the heading and the card would name two different entities three inches apart',
    edits: [{
      file: HEADING,
      find: '  return diverges ? contactCompany : (quotationCompany || contactCompany);',
      replace: '  return diverges ? quotationCompany : (quotationCompany || contactCompany);',
    }],
    files: [PURE_T],
    mustFail: ['the divergent legacy pair follows displayCompany exactly'],
  },
];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ DETAIL-HEADING CONTROL REHEARSAL ═══════════════════════════════════════');
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
