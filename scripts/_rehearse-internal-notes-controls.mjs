/**
 * REHEARSAL — attack the append-only guarantee from every side it has.
 *
 * ══ CASE 6 IS THE ONE THE BRIEF ASKED FOR ═══════════════════════════════════
 *
 * "Append-only enforced on the SERVER — a control removing the client's guard
 * must still fail to mutate an existing note."
 *
 * Case 6 REMOVES THE CLIENT'S GUARD: it gives the notes card a per-note edit
 * control, exactly as a well-meaning future commit would. Two things must
 * happen, and both are asserted:
 *
 *   · the RENDER assertion reddens — the UI now contradicts the design;
 *   · EVERY SERVER ASSERTION STAYS GREEN — `$push` is still the only write,
 *     the signature still cannot name a note, and `updateRegistration` still
 *     cannot reach the field.
 *
 * The second half is the point. It is what "enforced on the server, not merely
 * by the absence of UI" means when it is measured rather than asserted: the
 * button appears, and there is still no code path behind it that could mutate
 * anything. That is why case 6 declares `mustStillPass` rather than only
 * `mustFail`.
 *
 * Usage: node scripts/_rehearse-internal-notes-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ACTIONS = 'src/lib/actions/registrations.js';
const NOTESLIB = 'src/lib/registrations/internalNotes.js';
const SHELL   = 'src/app/admin/registrations/_components/detailShell.jsx';
const MODEL   = 'src/models/internalNoteSchema.js';

const APPEND_T = 'test/fs/internalNotesAppendOnly.test.mjs';
const SEP_T    = 'test/fs/internalNotesSeparation.test.mjs';
const PURE_T   = 'test/pure/internalNotes.test.mjs';
const READ_T   = 'test/render/inhouseCancelledReadOnly.test.mjs';

const ALL_TARGETS = [ACTIONS, NOTESLIB, SHELL, MODEL];
const ALL_TESTS   = [APPEND_T, SEP_T, PURE_T, READ_T];

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
    name: '1. THE BACK DOOR: adminNotes returns to the allowlist',
    why: '$push in one action is worth nothing if another action can $set the whole array',
    edits: [{
      file: ACTIONS,
      find: "      'thaiAddress','internationalAddress','message',",
      replace: "      'thaiAddress','internationalAddress','message','adminNotes',",
    }],
    files: [APPEND_T],
    mustFail: [
      'THE BACK DOOR IS SHUT: updateRegistration cannot write adminNotes',
      'addInternalNote is the ONLY writer of adminNotes in the whole action layer',
    ],
  },
  {
    name: '2. $push becomes $set',
    why: 'the one-word change that turns an append into an overwrite',
    edits: [{
      file: ACTIONS,
      find: '      $push: {\n        adminNotes: buildNoteEntry({',
      replace: '      $set: {\n        adminNotes: buildNoteEntry({',
    }],
    files: [APPEND_T],
    mustFail: ['addInternalNote uses $push and NEVER $set'],
  },
  {
    name: '3. the signature gains a way to NAME an existing note',
    why: 'the second structural guard — a caller with no index cannot aim at a note',
    edits: [{
      file: ACTIONS,
      find: 'export async function addInternalNote(id, body, source = \'public\') {',
      replace: 'export async function addInternalNote(id, body, source = \'public\', index = null) {',
    }],
    files: [APPEND_T],
    mustFail: ['the SIGNATURE cannot name an existing note'],
  },
  {
    name: '4. THE NOTE BODY REACHES THE AUDIT ROW',
    why: 'the field most likely to quote a customer verbatim, in an append-only forever collection',
    edits: [{
      file: ACTIONS,
      find: "    action:      'notes',",
      replace: "    action:      'notes',\n    after:       { body: note },",
    }],
    files: [APPEND_T],
    mustFail: ['the audit row records the ACT, never the note text'],
  },
  {
    name: '5. the note subdocument gains an _id',
    why: 'the first half of the edit/delete API that is deliberately not being built',
    edits: [{
      file: MODEL,
      find: '  { _id: false },',
      replace: '  { _id: true },',
    }],
    files: [APPEND_T],
    mustFail: ['the note subdocument has NO _id — a note cannot be addressed'],
  },
  {
    name: "6. THE CLIENT'S GUARD IS REMOVED — the server must still hold",
    why: 'the brief\'s own control: an edit button appears, and NOTHING behind it can mutate a note',
    edits: [{
      file: SHELL,
      find: '              <p className="pt-[6px] text-[11px] leading-[16px] text-[var(--text-muted)]">',
      replace: '              <button type="button" className="text-[11px]">แก้ไข</button>\n              <p className="pt-[6px] text-[11px] leading-[16px] text-[var(--text-muted)]">',
    }],
    files: [READ_T, APPEND_T],
    /**
     * FIVE, not one. The injected button is an UNGATED `>แก้ไข<`, so besides the
     * per-note assertion it also breaks every count-based read-only assertion on
     * the screen — including on a CANCELLED request, where it renders anyway.
     *
     * Declared rather than filtered, and worth reading as a result in its own
     * right: it demonstrates that the แก้ไข counts are sensitive to a control
     * appearing anywhere on the page, which is exactly what a count is for. An
     * edit affordance smuggled onto a locked record cannot be added quietly.
     */
    mustFail: [
      'there is no per-note edit or delete control, on either state',
      'a cancelled in-house request renders NO แก้ไข control',
      'a pending request keeps its edit control — on EVERY editable card',
      'the cancellation lock removes every one of those, not merely some',
      'a `closed-lost` request is read-only — it behaves as the cancelled it becomes',
    ],
    /**
     * THE HALF THAT MATTERS. The UI now offers editing; the server is unchanged
     * and every structural guarantee still holds. If any of these went red, the
     * enforcement would have been the absence of the button all along.
     */
    mustStillPass: [
      'addInternalNote uses $push and NEVER $set',
      'the SIGNATURE cannot name an existing note',
      'THE BACK DOOR IS SHUT: updateRegistration cannot write adminNotes',
      'addInternalNote is the ONLY writer of adminNotes in the whole action layer',
      'the note subdocument has NO _id — a note cannot be addressed',
    ],
  },
  {
    name: '7. THE NAMING TRAP: an internal note reaches a customer email model',
    why: 'nothing would throw — it would just send',
    edits: [{
      file: 'src/lib/email/models/publicRegistrationModel.js',
      find: 'export function buildPublicRegistrationModel(',
      replace: 'export const leak = (doc) => doc.adminNotes;\n\nexport function buildPublicRegistrationModel(',
    }],
    files: [SEP_T],
    mustFail: ['NO customer-facing surface mentions adminNotes'],
  },
  {
    name: '8. one STATEMENT handles both notes',
    why: 'the fallback chain that gives one variable two meanings',
    edits: [{
      file: SHELL,
      find: 'export function InternalNotesBody({',
      replace: 'export const merged = (doc) => doc.adminNotes ?? doc.notes;\n\nexport function InternalNotesBody({',
    }],
    files: [SEP_T],
    mustFail: ['no single STATEMENT reads or writes both a customer note and adminNotes'],
  },
  {
    name: '9. the legacy String branch is removed early (the CONTRACT step)',
    why: 'expand/migrate/contract — narrowing before --apply strands every unmigrated document',
    edits: [{
      file: NOTESLIB,
      find: "  const body = normalizeNoteBody(stored);\n  if (!body) return [];\n  return [{ body, authorId: '', authorName: LEGACY_AUTHOR_NAME, createdAt: legacyCreatedAt }];",
      replace: '  return [];',
    }],
    files: [PURE_T],
    mustFail: [
      'THE LEGACY BRANCH: a plain String reads as ONE entry',
      'a legacy note with no timestamp gets null, NOT "now"',
      'CONTROL: the two branches are genuinely distinguishable',
      'a String is NOT mistaken for an array of characters',
      'THE STRING BRANCH IS STILL PRESENT — the narrowing is a later commit',
    ],
  },
];

async function main() {
  const targets = [...new Set([...ALL_TARGETS, 'src/lib/email/models/publicRegistrationModel.js'])];
  const original = new Map(targets.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]));

  console.log('');
  console.log('══ INTERNAL NOTES CONTROL REHEARSAL ═══════════════════════════════════════');
  for (const rel of targets) console.log(`   target: ${rel}`);
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
      for (const name of c.mustStillPass ?? []) {
        check(`STILL GREEN (server holds): ${name}`, !r.failed.includes(name),
          r.failed.includes(name) ? 'went RED — the enforcement was the UI after all' : '');
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
    for (const rel of targets) {
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
