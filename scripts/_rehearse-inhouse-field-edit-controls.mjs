/**
 * REHEARSAL — break the in-house field-edit guards, and prove they go RED.
 *
 * Same harness as the five sibling scripts: real edits to real files, a fresh
 * process per case, every target restored in a `finally`, every `find` required
 * to match EXACTLY ONCE.
 *
 * ══ WHAT IS BEING CONTROLLED, AND WHY IT NEEDED CONTROLLING ═════════════════
 *
 * The defect these guards were written for was SILENT IN EVERY TIER. Round 2
 * built a 26-name in-house allowlist on the server; no client was ever pointed
 * at it; 25 of those fields were displayed by the read view and editable by
 * nothing. The whole suite stayed green, because every assertion about this
 * screen asked whether the rendered CONTROLS were correct — and the controls
 * that were missing render nothing to assert about.
 *
 * So the question each case below answers is not "does the test pass" but
 * "would this test have caught THAT". Case 3 is the one that matters most: it
 * reproduces the original defect exactly, by taking a card's edit affordance
 * away again.
 *
 * ── ONE CASE IS DECLARED INVISIBLE, ON PURPOSE ─────────────────────────────
 * Case 5 mutates the read view rather than the write path and is expected to
 * redden NOTHING. It is here because "the allowlist comparison covers the read
 * view too" is a claim someone will assume, and it is false — the comparison is
 * about what the form SUBMITS. Stating the boundary is worth more than pretending
 * the guard is wider than it is, and a case that fires nothing is reported
 * rather than deleted (see the note in test/run.mjs on reading a control that
 * fires nothing).
 *
 * Usage: node scripts/_rehearse-inhouse-field-edit-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CLIENT  = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';
const ACTIONS = 'src/lib/actions/registrations.js';

const ALLOW = 'test/fs/inhouseFieldEditable.test.mjs';
const READO = 'test/render/inhouseCancelledReadOnly.test.mjs';

const ALL_TARGETS = [CLIENT, ACTIONS];
const ALL_TESTS   = [ALLOW, READO];

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
    name: '1. a form field the allowlist does not name',
    why: 'THE silent-drop defect: the save returns ok, the card closes, nothing changes',
    edits: [{
      file: CLIENT,
      find: "export const editableContact = (doc) => ({\n  contactFirstName:  doc.contactFirstName  ?? '',",
      // `companyName` is the realistic mistake, not an invented one: it is what
      // the card DISPLAYS, it is a real field on the model, and it is excluded
      // from the allowlist on purpose. A developer binding the บริษัท control to
      // the value on screen writes exactly this.
      replace: "export const editableContact = (doc) => ({\n  companyName:       doc.companyName       ?? '',\n  contactFirstName:  doc.contactFirstName  ?? '',",
    }],
    files: [ALLOW],
    mustFail: [
      'every field the in-house form submits is named by the allowlist',
      'the guard is per-card, so a reader can see WHICH card broke',
    ],
  },
  {
    name: '2. a field leaves the allowlist while the form still submits it',
    why: 'the same break from the other side — a server-side tidy-up with no client change',
    edits: [{
      file: ACTIONS,
      find: "'thaiAddress','internationalAddress','message','adminNotes',",
      replace: "'thaiAddress','internationalAddress','message',",
    }],
    files: [ALLOW],
    mustFail: [
      'every field the in-house form submits is named by the allowlist',
      'the guard is per-card, so a reader can see WHICH card broke',
    ],
  },
  {
    name: '3. THE ORIGINAL DEFECT: a card loses its edit affordance again',
    why: 'this is the exact state round 6 found — a card that displays fields and cannot edit them',
    edits: [{
      file: CLIENT,
      find: "            title=\"ข้อมูลใบเสนอราคา\"\n            {...editProps('quotation')}\n            onSave={() => save(quotation, 'save-quotation')}",
      replace: '            title="ข้อมูลใบเสนอราคา"',
    }],
    files: [READO],
    mustFail: [
      'a pending request keeps its edit control — on EVERY editable card',
      'the cancellation lock removes every one of those six, not merely some',
    ],
  },
  {
    name: '4. the save goes through the PUBLIC allowlist',
    why: 'a one-word slip that does not throw, does not warn, and drops almost every field',
    edits: [{
      file: CLIENT,
      find: "await updateRegistration(doc._id, payload, 'inhouse');",
      replace: 'await updateRegistration(doc._id, payload);',
    }],
    files: [ALLOW],
    mustFail: ['the in-house client calls updateRegistration with the inhouse source'],
  },
  {
    name: '5. DECLARED INVISIBLE: the READ view loses a row',
    why: 'states the guard\'s boundary — the comparison is about what the form SUBMITS, not what it shows',
    edits: [{
      file: CLIENT,
      find: '                <DLRow label="LINE ID" value={contact.contactLine} />',
      replace: '',
    }],
    files: ALL_TESTS,
    mustFail: [],
  },
];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('══ IN-HOUSE FIELD-EDIT CONTROL REHEARSAL ══════════════════════════════════');
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

      // THE DIFF IS CONFIRMED, not assumed. A `find` that matched once and a
      // `replace` that changed nothing (identical text) would run the tests
      // against an unmutated tree and report every control as behaving.
      for (const e of applied) {
        const landed = readFileSync(path.join(ROOT, e.file), 'utf8') !== original.get(e.file);
        check(`the mutation landed in ${e.file}`, landed, landed ? '' : 'file is byte-identical');
      }

      const r = runTests(c.files);

      if (c.mustFail.length === 0) {
        check('DECLARED INVISIBLE: no test reddens, and that is reported not hidden',
          r.failed.length === 0, r.failed.length ? `unexpectedly red: ${r.failed.join(' | ')}` : '');
      }
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
