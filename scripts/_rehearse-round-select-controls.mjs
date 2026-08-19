/**
 * REHEARSAL — break the admin round select, and prove the guards notice.
 *
 * ══ CASE 5 IS THE ONE THAT ALREADY HAPPENED ═════════════════════════════════
 *
 * It restores the free-text date field to the round form. That is not a
 * hypothetical: the previous commit removed the three round fields from
 * `updateRegistration`'s allowlist and LEFT THE OLD EDITOR IN PLACE, so for one
 * commit the card offered three controls whose payload the server no longer
 * accepted. The whole suite was green, because every assertion asked whether the
 * controls RENDER and they rendered perfectly.
 *
 * fs/publicFieldEditable is the guard written after the fact for exactly that,
 * and case 5 is what says it works.
 *
 * ══ CASES 1 AND 2 ARE THE RULING ════════════════════════════════════════════
 *
 * A stored round that is no longer offered must RENDER, MARKED, and NOT BE
 * SELECTABLE. Measured against live data, 26 of 39 registrations (66.7%) are on
 * that path — see scripts/audit-registration-round-reachability.mjs — so these
 * two are guarding the common case, not an edge.
 *
 * Usage: node scripts/_rehearse-round-select-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CLIENT = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';

const SELECT_T = 'test/render/registrationRoundSelect.test.mjs';
const PUBFLD_T = 'test/fs/publicFieldEditable.test.mjs';
const GATE_T   = 'test/fs/registrationActionsDerived.test.mjs';
const LOCK_T   = 'test/render/registrationCancelledReadOnly.test.mjs';
const TAB_T    = 'test/render/registrationAttendeeTab.test.mjs';

const ALL_TARGETS = [CLIENT];
const ALL_TESTS   = [SELECT_T, PUBFLD_T, GATE_T, LOCK_T, TAB_T];

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
    name: '1. THE STORED GONE ROUND IS NOT RENDERED AT ALL',
    why: '66.7% of live registrations are on this path — the select would open with nothing chosen',
    edits: [{
      file: CLIENT,
      find: '          {storedOption ? (\n            <option value={storedOption.value} disabled>\n              {storedOption.label} — ไม่เปิดรับแล้ว\n            </option>\n          ) : null}',
      replace: '          {null}',
    }],
    files: [SELECT_T],
    mustFail: ['a stored round no longer offered RENDERS, marked, and is NOT selectable'],
  },
  {
    name: '2. THE GONE ROUND IS MADE SELECTABLE',
    why: 'the ruling — there is no honest way to offer something the source will not return',
    edits: [{
      file: CLIENT,
      find: '            <option value={storedOption.value} disabled>',
      replace: '            <option value={storedOption.value}>',
    }],
    files: [SELECT_T],
    mustFail: ['a stored round no longer offered RENDERS, marked, and is NOT selectable'],
  },
  {
    name: '3. the gone round loses its marking',
    why: 'rendered but indistinguishable from a live option is the same as not marked',
    edits: [{
      file: CLIENT,
      find: '              {storedOption.label} — ไม่เปิดรับแล้ว',
      replace: '              {storedOption.label}',
    }],
    files: [SELECT_T],
    mustFail: ['a stored round no longer offered RENDERS, marked, and is NOT selectable'],
  },
  {
    name: '4. the hybrid mode picker is PRE-SELECTED',
    why: 'the server refuses an unanswered hybrid; a preselected option answers for the admin',
    edits: [{
      file: CLIENT,
      find: '            <option value="">— เลือกรูปแบบ —</option>\n            <option value="classroom">Classroom</option>',
      replace: '            <option value="classroom">Classroom</option>',
    }],
    files: [SELECT_T],
    mustFail: ['a HYBRID round shows the picker, UNSET, and says the choice is required'],
  },
  {
    name: '5. THE ONE THAT ALREADY HAPPENED: a date field returns to the form',
    why: 'a control that can hold a LABEL can submit one that disagrees with the id',
    edits: [{
      file: CLIENT,
      find: '      <div>\n        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">\n          รอบอบรม<span className="ml-0.5 text-9e-accent">*</span>\n        </label>',
      replace: '      <EditField label="วันที่อบรม" value="" onChange={() => {}} />\n      <div>\n        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">\n          รอบอบรม<span className="ml-0.5 text-9e-accent">*</span>\n        </label>',
    }],
    files: [SELECT_T],
    mustFail: ['THE FORM HAS NO DATE OR TYPE CONTROL AT ALL'],
  },
  {
    name: '6. the client sends a date label with the round payload',
    why: 'the payload shape is the client half of the guarantee',
    edits: [{
      file: CLIENT,
      find: '        classId: roundDraft.classId,',
      replace: '        classId: roundDraft.classId,\n        classDate: course.classDate,',
    }],
    files: [PUBFLD_T],
    mustFail: ['the round IS still editable — through its own action'],
  },
  {
    name: '7. THE GATE ANDs ITS REASONS instead of ORing them',
    why: 'looks identical at a glance and leaves a CANCELLED record editable whenever rounds exist',
    edits: [{
      file: CLIENT,
      find: '    onEdit:    (readOnly || !available) ? undefined : () => setEditSection(section),',
      replace: '    onEdit:    (available && !readOnly) ? undefined : () => setEditSection(section),',
    }],
    files: [GATE_T, LOCK_T, TAB_T],
    /**
     * FIVE, and the fifth is in the ATTENDEE TAB — which is the reach of this
     * mutation and the reason the tab's file is run here at all.
     *
     * A first pass declared "the + เพิ่มผู้เข้าอบรม button is gone on a
     * cancelled record" and it came back STILL GREEN. Not a weak guard: that
     * test lives in registrationAttendeeTab, which this case was not running, so
     * nothing had looked. Recorded because "still green" from a file that was
     * never executed is indistinguishable in the output from a guard with no
     * teeth, and the fix is to run the file rather than to drop the claim.
     *
     * The + button reads the same `editProps` object the card header does, so
     * inverting the gate hands a cancelled record an edit path through a control
     * that merely looks like a different kind. That is exactly what the
     * single-producer rule exists to make visible.
     */
    mustFail: [
      'there is exactly ONE producer of an edit affordance, and it is gated',
      'a cancelled document renders NO แก้ไข control',
      'a paid document renders the edit controls',
      'a course with NO rounds loses only the ROUND card’s แก้ไข, not the others',
      // ── The attendee tab, BOTH WAYS ROUND ────────────────────────────────
      // An inverted gate does not merely leak edits onto a cancelled record; it
      // also REMOVES them from an editable one, because the condition is
      // reversed rather than widened. Both directions redden, which is the most
      // informative outcome available — a mutation that only broke one side
      // could be a gate that had gone permissive OR one that had gone silent,
      // and these five distinguish them.
      'a cancelled record offers NO edit anywhere in the attendee tab',
      'an editable row’s menu holds the edit and, when there is one, the email copy',
      'the row menu still offers the COPY on a cancelled record',
      'CONTROL: an editable record DOES render both controls',
      'the + เพิ่มผู้เข้าอบรม button is the measured 92.6x32.6',
    ],
  },
  {
    name: '8. the round card takes the gate at the CALL SITE again',
    why: 'the first draft of this UI; the single-producer guard is what rejected it',
    edits: [{
      file: CLIENT,
      find: "  const roundEdit = editProps('course', rounds.length > 0);",
      replace: "  const roundEdit = rounds.length > 0 ? editProps('course') : { editLabel: 'แก้ไข' };",
    }],
    files: [GATE_T],
    mustFail: ['every editable card goes through that gate'],
  },
];

async function main() {
  const original = new Map(ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]));

  console.log('');
  console.log('══ ROUND SELECT CONTROL REHEARSAL ═════════════════════════════════════════');
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
