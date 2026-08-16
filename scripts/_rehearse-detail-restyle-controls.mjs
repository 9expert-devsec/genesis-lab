/**
 * REHEARSAL — break the detail restyle thirteen ways, and prove the suite goes
 * RED where it is claimed to and STAYS GREEN where it is claimed to.
 *
 * Same harness as the sibling scripts: every edit is applied to the real file,
 * the guarding tests are run in a child process, and every file is restored in a
 * `finally` — including on error.
 *
 * ── THE CASES THAT ARE FINDINGS ─────────────────────────────────────────────
 *
 *   1. THE DOT'S CLASS ORDER. `cn` is twMerge and twMerge keeps the LAST of two
 *      conflicting classes, so `bg-current` must come AFTER the status badge's
 *      `bg-amber-100`. The first draft had it backwards and the dot rendered in
 *      the badge's PALE background at 11px — very nearly invisible. This case is
 *      that defect, reproduced.
 *
 *   2. THE WRAPPED-BUT-EMPTY VALUE. `value={<span className="font-mono">{x}</span>}`
 *      defeats DLRow's absent-means-absent rule completely: a React element is
 *      always truthy, so a document with no `classId` rendered the label and an
 *      empty span. Found by the empty-element guard during the work, not by
 *      review.
 *
 *   4. ACTION_SHORT LOSING A TARGET reddens the fs pinning and leaves the RENDER
 *      tier green — deliberately. The call site falls back with `??`, so the
 *      degradation is a label too long for its 100px box rather than a button
 *      with no text. That is the measurement behind the fs assertion's comment,
 *      and it is why the claim is an fs one.
 *
 *  13. A FIFTH ATTENDEE COLUMN reddens the header-vs-body guard and leaves three
 *      adjacent assertions GREEN, exactly as it does on the two list tables.
 *      That green three is the whole reason the guard is not redundant with
 *      them.
 *
 * Usage: node scripts/_rehearse-detail-restyle-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUBD  = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INHD  = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';
const PARTS = 'src/components/audit/auditRowParts.jsx';

const R_SHELL   = 'test/render/registrationDetailShell.test.mjs';
const R_PUB     = 'test/render/registrationCancelledReadOnly.test.mjs';
const R_INH     = 'test/render/inhouseCancelledReadOnly.test.mjs';
const R_AUDIT   = 'test/render/auditRowNoDiff.test.mjs';
const F_ACTIONS = 'test/fs/registrationActionsDerived.test.mjs';
const HARVEST   = 'test/fs/tailwindArbitraryValueRules.test.mjs';

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
    name: '1. the status dot is written bg-current FIRST, so twMerge drops it',
    why: 'cn is twMerge and the LAST conflicting class wins — the pale badge background then paints the dot',
    edits: [{
      file: SHELL,
      find: "          className={cn(dotClassName, 'h-[11px] w-[11px] shrink-0 rounded-full bg-current')}",
      replace: "          className={cn('h-[11px] w-[11px] shrink-0 rounded-full bg-current', dotClassName)}",
    }],
    files: [R_SHELL],
    mustFail: [
      'the status dot takes the vocabulary’s colour and no new map exists',
      'CONTROL: the dot’s colour really does come from the module',
      'an unrecognised status renders its raw value, the neutral colour and NO action',
    ],
  },
  {
    name: '2. a monospace value is wrapped at the call site again',
    why: 'a React element is always truthy, so DLRow’s absent-means-absent rule never fires',
    edits: [{
      file: PUBD,
      find: '            <DLRow label="Class ID"        value={mono(doc.classId)} />',
      replace: '            <DLRow label="Class ID"        value={<span className="font-mono text-[11px]">{doc.classId}</span>} />',
    }],
    files: [R_SHELL],
    mustFail: ['no screen emits an empty element, on a full OR a sparse document'],
  },
  {
    name: '3. the slot split hard-codes the cancel status',
    why: 'a hand-written status value in a client is the shape rounds 1 and 2 spent four commits removing',
    edits: [{
      file: PUBD,
      find: '  const isTerminalTarget = (target) => allowedTransitions(target).length === 0;',
      replace: "  const isTerminalTarget = (target) => target === 'cancelled';",
    }],
    files: [F_ACTIONS],
    mustFail: [
      'public: the primary/overflow split is derived from the transition table',
      'public: no status VALUE decides which slot an action goes in',
    ],
    /**
     * The RENDER tier is deliberately not listed. On today's table the two
     * expressions agree for every reachable status, so the screen is identical
     * and no render assertion can see the difference — which is exactly why the
     * claim is an fs one. A future terminal status is what would separate them,
     * and by then the literal would already have shipped.
     */
    mustStillPass: [],
  },
  {
    name: '4. ACTION_SHORT loses a target',
    why: 'the three presentation maps must name the same targets, and nothing on screen announces the drift',
    edits: [{
      file: PUBD,
      find: "const ACTION_SHORT   = { confirmed: 'บันทึกส่งแล้ว', cancelled: 'ยกเลิก' };",
      replace: "const ACTION_SHORT   = { cancelled: 'ยกเลิก' };",
    }],
    files: [F_ACTIONS, R_PUB],
    /**
     * ── THE DECLARATION WAS WRONG THE FIRST TIME, AND THE CORRECTION IS THE
     *    FINDING ───────────────────────────────────────────────────────────
     *
     * This was declared as an fs-only break, on the reasoning that the `??` at
     * the call site falls back to ACTION_LABEL so nothing goes empty. The first
     * half of that is true — nothing goes empty, and both empty-content guards
     * stay green below.
     *
     * The second half was wrong. THE RENDER TIER CATCHES IT TOO, because
     * `offeredTargets` recognises the primary slot by the button's exact short
     * wording. Fall back to the canonical label and the probe stops recognising
     * the action at all, so the screen reads as offering one transition where
     * the table permits two.
     *
     * That is better coverage than claimed and it is worth recording, because
     * the fs comment now has to say the accurate thing: on SCREEN the
     * degradation is a label too long for its box — visible, but not obviously a
     * bug — while in the SUITE it reddens in two tiers.
     */
    mustFail: [
      'ACTION_LABEL, ACTION_VARIANT and ACTION_SHORT name the same targets',
      'a pending document offers both of its transitions',
      'for EVERY status, the rendered actions match the transition table',
      'CONTROL: the element probes can tell the status NAME from the action',
    ],
    mustStillPass: [
      'no button renders with empty content, on any status',
      'every control in the action group has TEXT, not just an icon',
    ],
  },
  {
    name: '5. the edit gate stops asking readOnly',
    why: 'one missed gate puts a แก้ไข button on a cancelled record, invisible until someone opens one',
    edits: [{
      file: PUBD,
      find: '    onEdit:    readOnly ? undefined : () => setEditSection(section),',
      replace: '    onEdit:    () => setEditSection(section),',
    }],
    files: [F_ACTIONS, R_PUB],
    mustFail: [
      'there is exactly ONE producer of an edit affordance, and it is gated',
      'a cancelled document renders NO แก้ไข control',
    ],
  },
  {
    name: '6. delete is gated on the read-only flag',
    why: 'delete is a different permission and is the only way out of a wrongly-cancelled row',
    edits: [{
      file: PUBD,
      find: '            <OverflowItem\n              icon={Trash2}\n              onClick={handleDelete}',
      replace: '            {readOnly ? null : <OverflowItem\n              icon={Trash2}\n              onClick={handleDelete}',
    }, {
      file: PUBD,
      find: '              ลบใบสมัครนี้\n            </OverflowItem>',
      replace: '              ลบใบสมัครนี้\n            </OverflowItem>}',
    }],
    files: [F_ACTIONS, R_PUB],
    mustFail: [
      'public: delete is in the overflow menu and is NOT gated on readOnly',
      'a cancelled document still renders the delete control',
      'the overflow menu is NEVER empty, on any status',
    ],
  },
  {
    name: '7. the history tab renders even when the page handed in no panel',
    why: 'a tab opening onto blank space confirms the record HAS history, which is the thing withheld',
    edits: [{
      file: PUBD,
      find: "    .filter((t) => t.key !== 'history' || history)\n",
      replace: '',
    }],
    files: [R_SHELL],
    mustFail: ['no history slot means NO history tab, not an empty one'],
  },
  {
    name: '8. every tab panel renders visible',
    why: 'the panels are all in the DOM; `hidden` is the only thing making exactly one of them the view',
    edits: [{
      file: SHELL,
      find: '    <div id={id} role="tabpanel" aria-labelledby={labelledBy} hidden={hidden} className="pt-[16px]">',
      replace: '    <div id={id} role="tabpanel" aria-labelledby={labelledBy} className="pt-[16px]">',
    }],
    files: [R_SHELL],
    mustFail: ['every screen renders one panel per tab, with exactly one visible'],
    /**
     * ── ALSO A CORRECTED DECLARATION, AND ALSO WORTH RECORDING ─────────────
     *
     * "the visible panel is the one the selected tab controls" was declared RED
     * and stays GREEN. It takes the FIRST panel without `hidden`, and the first
     * panel IS the selected one, so it goes on agreeing with the selected tab
     * while every other panel is also visible.
     *
     * The two assertions are therefore not backstops for each other: one says
     * HOW MANY are visible and the other says WHICH. Both are needed, and
     * neither would have caught this alone had the other been dropped as
     * redundant.
     */
    mustStillPass: ['the visible panel is the one the selected tab controls'],
  },
  {
    name: '9. the ยอดสุทธิ sub-line is rendered blank instead of dropped',
    why: 'an empty 16.5px line is invisible to text matching — the defect that shipped twice on the list',
    edits: [{
      file: SHELL,
      find: '            {cell.sub ? (\n              <p className="truncate text-[11px] leading-[16.5px] text-9e-ice/70">{cell.sub}</p>\n            ) : null}',
      replace: '            <p className="truncate text-[11px] leading-[16.5px] text-9e-ice/70">{cell.sub}</p>',
    }],
    files: [R_SHELL],
    mustFail: [
      'the ยอดสุทธิ sub-line is DROPPED without pricing, not rendered blank',
      'no screen emits an empty element, on a full OR a sparse document',
    ],
  },
  {
    name: '10. the audit diff renders unconditionally again',
    why: 'this is the `update — → —` row, restored',
    edits: [{
      file: PARTS,
      find: '  if (!hasDiff(row)) return null;',
      replace: '  if (false) return null;',
    }],
    files: [R_AUDIT],
    mustFail: [
      'a row with no recorded diff renders NO elements at all',
      'the act-only line holds the action chip and NOTHING ELSE',
    ],
  },
  {
    name: '11. a strip cell sizes itself instead of its content',
    why: 'equal cells make a course name and "3 ท่าน" the same width — the strip becomes a row of tiles',
    edits: [{
      file: SHELL,
      find: '          <div key={cell.key} className="min-w-0 px-[17px] pt-[14px]">',
      replace: '          <div key={cell.key} className="min-w-0 flex-1 px-[17px] pt-[14px]">',
    }],
    files: [R_SHELL],
    mustFail: ['the strip cells are CONTENT-WIDTH, divided by rules rather than by gaps'],
  },
  {
    name: '12. a measured class is assembled from a template literal',
    why: 'Tailwind matches raw TEXT — the markup is perfect and the stylesheet has no rule at all',
    edits: [{
      file: SHELL,
      find: '    <div className="mt-[16px] flex h-[93px] items-stretch overflow-hidden rounded-9e-lg bg-9e-navy px-[4px] py-[4px]">',
      replace: '    <div className={`mt-[16px] flex h-[${93}px] items-stretch overflow-hidden rounded-9e-lg bg-9e-navy px-[4px] py-[4px]`}>',
    }],
    files: [HARVEST],
    mustFail: ['every arbitrary-value class the DETAIL screens RENDER compiles to a rule'],
    /**
     * THE POINT OF THE WHOLE INSTRUMENT, and the third declaration this
     * rehearsal corrected.
     *
     * "the measured geometry really is in the harvest" was declared RED and
     * stays GREEN — CORRECTLY, and the reason is exactly what separates the two
     * assertions. It reads the RENDERED MARKUP, which still says
     * `class="… h-[93px] …"`, byte-identical to the correct version. It is a
     * claim about what the browser is asked to paint.
     *
     * The harvest is a claim about whether the stylesheet can paint it. Only the
     * second can see this defect, which is the /schedule round-hover failure:
     * perfect markup, no CSS, a green suite.
     *
     * Every render assertion in this round stays green here for the same reason.
     */
    mustStillPass: ['the measured geometry really is in the harvest, not merely a large count'],
  },
  {
    name: '13. a FIFTH attendee column is added with no body cell',
    why: 'ATTENDEE_COLUMNS drives the header; the body’s four <td>s are hand-written and do not follow',
    edits: [{
      file: PUBD,
      find: "  { key: 'phone', label: 'เบอร์โทร' },\n];",
      replace: "  { key: 'phone', label: 'เบอร์โทร' },\n  { key: 'extra', label: 'เพิ่ม' },\n];",
    }],
    files: [R_SHELL],
    mustFail: ['the attendee table’s body rows have exactly as many cells as its header'],
    /**
     * THE SAME MEASUREMENT AS THE TWO LIST TABLES: the assertions that sit
     * closest to this one all miss it, which is why porting the guard was not
     * redundant. These three read the ROW's content, not the two halves.
     */
    mustStillPass: [
      'an attendee with a name and nothing else renders dashes, not empty cells',
      'the coordinator marker is a suffix inside the name cell, not a line of its own',
      'no screen emits an empty element, on a full OR a sparse document',
    ],
  },
  {
    name: '14. the in-house strip hedges the stored headcount',
    why: 'participantsCount is a stored number flagged as an estimate nowhere — "ประมาณ" asserts an imprecision the record does not record',
    edits: [{
      file: INHD,
      find: '      sub:   doc.participantsCount == null ? \'\' : `${doc.participantsCount} ท่าน`,',
      replace: '      sub:   doc.participantsCount == null ? \'\' : `ประมาณ ${doc.participantsCount} คน`,',
    }],
    files: [R_SHELL],
    mustFail: ['the in-house strip says "15 ท่าน" and never "ประมาณ"'],
  },
];

const ALL_TARGETS = [SHELL, PUBD, INHD, PARTS];
const ALL_TESTS   = [R_SHELL, R_PUB, R_INH, R_AUDIT, F_ACTIONS, HARVEST];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('== DETAIL-RESTYLE CONTROL REHEARSAL =======================================');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    console.log('-- baseline (unmutated) ---------------------------------------------------');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`-- ${c.name} ${'-'.repeat(Math.max(0, 71 - c.name.length))}`);
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
    console.log('-- restored ---------------------------------------------------------------');
    for (const rel of ALL_TARGETS) {
      const same = readFileSync(path.join(ROOT, rel), 'utf8') === original.get(rel);
      console.log(`   ${ok(same)} ${rel}`);
      if (!same) failures += 1;
    }
  }

  console.log('');
  console.log(failures === 0
    ? '== ALL CONTROLS BEHAVED AS DECLARED ======================================='
    : `== ${failures} CONTROL(S) DID NOT BEHAVE AS DECLARED =======================`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] !== '--child') await main();
