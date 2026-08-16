/**
 * REHEARSAL — break the two tab panels twelve ways, and prove the suite goes RED
 * where it is claimed to and STAYS GREEN where it is claimed to.
 *
 * Same harness as the sibling scripts: every edit is applied to the real file,
 * the guarding tests are run in a child process, and every file is restored in a
 * `finally` — including on error.
 *
 * ── THE CASES THAT ARE FINDINGS ─────────────────────────────────────────────
 *
 *   3. THE ROW MENU'S TRIGGER FOLLOWING ITS ITEM COUNT is what makes an empty
 *      "•••" unrepresentable rather than merely avoided. Rendering the trigger
 *      unconditionally reddens on exactly one fixture — a CANCELLED record whose
 *      attendee row has no email — which is the case every earlier version of
 *      this reasoning missed.
 *
 *   6. THE DESCRIPTION WRAPPER OUTSIDE THE DIFF puts the empty element back one
 *      level up, and it is the shape that survived a text-matching guard the
 *      first time. `AuditDiff` still returns null; the `<p>` around it does not.
 *
 *   9. SUPPRESSING THE SYNTHESISED ENTRY ON A TRUNCATED FEED is the assertion a
 *      reader is most likely to call over-cautious. Removing the suppression
 *      leaves every other history assertion GREEN — the entry renders perfectly
 *      — and only the truncation test sees it.
 *
 *  11. THE HISTORY SLOT BEING A REAL FEED rather than a `<p>` stub in the
 *      harvest: reverting it leaves every render assertion green and every
 *      compiled-CSS assertion green too, because the classes simply are not
 *      harvested. Only the geometry list notices.
 *
 * Usage: node scripts/_rehearse-tab-content-controls.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SHELL = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUBD  = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INFO  = 'src/lib/registrations/attendeeInfo.js';
const FEED  = 'src/components/audit/HistoryFeed.jsx';
const VOCAB = 'src/lib/audit/registrationHistory.js';
const PANEL = 'src/components/audit/RecordHistoryPanel.jsx';

const R_ATT     = 'test/render/registrationAttendeeTab.test.mjs';
const R_HIST    = 'test/render/registrationHistoryFeed.test.mjs';
const R_SHELL   = 'test/render/registrationDetailShell.test.mjs';
const R_PUB     = 'test/render/registrationCancelledReadOnly.test.mjs';
const P_INFO    = 'test/pure/attendeeInfo.test.mjs';
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

const ok = (b) => (b ? '+' : 'x');
let failures = 0;
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1;
  console.log(`     ${ok(condition)} ${label}${detail ? ` - ${detail}` : ''}`);
};

const CASES = [
  // ── the ผู้เข้าอบรม tab ──────────────────────────────────────────────────
  {
    name: '1. the roster count becomes "all four fields present"',
    why: 'a named attendee short a phone number would stop counting, and the roster would read 1/2 with both people listed',
    edits: [{
      file: INFO,
      find: 'export function isNamedAttendee(attendee) {\n  return Boolean(',
      replace: 'export function isNamedAttendee(attendee) {\n  return attendeeInfoState(attendee) === \'complete\' && Boolean(',
    }],
    files: [P_INFO, R_ATT],
    mustFail: [
      'a row counts toward the roster on a name OR an email, not on completeness',
      'CONTROL: the roster count and the completeness count are different numbers',
      'a COMPLETE roster can hold an INCOMPLETE attendee',
      'the summary row has THREE equal cells, and they read the roster',
      'the ความครบถ้วน cell and the dark strip agree, in different words',
    ],
  },
  {
    name: '2. the info chip stops distinguishing partial from empty',
    why: '"an admin started a row and stopped" and "an admin added a slot and typed nothing" are different jobs',
    edits: [{
      file: INFO,
      find: "  if (filled.length === 0) return 'empty';",
      replace: "  if (filled.length === 0) return 'partial';",
    }],
    files: [P_INFO, R_ATT],
    mustFail: [
      'a row with none of the four is empty',
      'whitespace is not a value',
      'a missing or malformed attendee object does not throw',
      'the `not-provided` state has NO per-attendee counterpart',
      'each of the three states renders its own chip, on its own row',
      'CONTROL: the fixtures really are in three different states',
      'the chip colours are their own vocabulary, not the status module’s',
    ],
  },
  {
    name: '3. the row "•••" renders whether or not it has items',
    why: 'a cancelled record whose attendee row has no email then opens a menu onto nothing',
    edits: [{
      file: PUBD,
      find: '  if (items.length === 0) return null;',
      replace: '  if (false) return null;',
    }],
    files: [R_ATT, R_PUB],
    mustFail: [
      'the trigger is a FUNCTION of the item list — no items means no trigger',
      'the row menu still offers the COPY on a cancelled record',
      'NO row menu is empty, and every item in every one has text',
      /**
       * DECLARED AFTER THE FIRST RUN, and it is a better catch than the three
       * above: an item-less menu renders `<div role="menu" hidden></div>`, which
       * is an EMPTY ELEMENT. So the guard that has nothing to do with menus sees
       * this too, from a completely different direction. Recorded rather than
       * quietly added, because it means the empty-element sweep is doing more
       * work on this tab than its name suggests.
       */
      'no attendee row emits an empty element, in any state',
    ],
    /**
     * The status bar's own empty-content guard stays green: it reads the menus
     * that DO have items, and an extra empty one elsewhere on the page is
     * invisible to it. That is why the attendee tab needed its own sweep rather
     * than inheriting round 4's.
     */
    mustStillPass: ['every control in the action group has TEXT, not just an icon'],
  },
  {
    name: '4. the + เพิ่มผู้เข้าอบรม button stops reading the edit gate',
    why: 'round 1’s ruling is that a cancelled record offers NO edit affordance anywhere',
    edits: [{
      file: PUBD,
      find: '                {attendeeEdit.onEdit ? (',
      replace: '                {true ? (',
    }],
    files: [R_ATT, F_ACTIONS],
    mustFail: [
      'a cancelled record offers NO edit anywhere in the attendee tab',
      'the + เพิ่มผู้เข้าอบรม button reads the card’s edit gate',
    ],
  },
  {
    name: '5. a sixth attendee column is added with no body cell',
    why: 'the colgroup and the header are derived from ATTENDEE_COLUMNS; the five <td>s are hand-written',
    edits: [{
      file: PUBD,
      find: "  { key: 'menu',    label: '',               px: 32 },\n];",
      replace: "  { key: 'menu',    label: '',               px: 32 },\n  { key: 'extra',   label: 'เพิ่ม',          px: 20 },\n];",
    }],
    files: [R_SHELL, R_ATT],
    mustFail: [
      'the attendee table’s body rows have exactly as many cells as its header',
      'only the two FIXED columns are px; the three content columns are proportions',
    ],
    /**
     * ── FOUR CORRECTED DECLARATIONS, AND THEY ARE THE MEASUREMENT ──────────
     *
     * The assertions a reader would assume cover this DO NOT, for two distinct
     * reasons worth keeping apart:
     *
     *   · the colgroup count compares TWO NUMBERS BOTH DERIVED FROM
     *     ATTENDEE_COLUMNS, so they move together and agree with each other
     *     while both disagree with the body. Its own comment says as much — this
     *     is the measurement behind that comment, and it is the same shape round
     *     4 found in the list tables' empty-state colSpan;
     *   · the other three read a ROW's CONTENT and never compare the two halves
     *     of the table at all.
     *
     * That leaves exactly one assertion spanning the halves, which is why it is
     * the one that must not be relaxed.
     */
    mustStillPass: [
      'the colgroup has one <col> per header cell',
      'CONTROL: the chip extractor lands on the สถานะข้อมูล column',
      'an attendee with a name and no contact details renders ONE dash, not empty cells',
      'the coordinator marker is a suffix inside the name cell, not a line of its own',
    ],
  },
  // ── the ประวัติ tab ─────────────────────────────────────────────────────
  {
    name: '6. the description wrapper moves OUTSIDE the diff decision',
    why: 'this is the `update — → —` row again, one element up, where round 4’s fix does not reach',
    edits: [{
      file: FEED,
      find: 'function AuditDiffLine({ row }) {\n  if (!hasDiff(row)) return null;\n  return (',
      replace: 'function AuditDiffLine({ row }) {\n  return (',
    }],
    files: [R_HIST],
    mustFail: [
      '(e) an act-only row renders NO description element — shape, not string',
      'no feed emits an empty element, in any state',
      '(c) the in-house notes row is titled, and its BODY is still not recorded',
    ],
  },
  {
    name: '7. an act-only row becomes expandable again',
    why: 'its detail block is `ก่อน: —` over `หลัง: —` — the same defect one disclosure deeper',
    edits: [{
      file: FEED,
      find: '  const expandable = isAudit && (hasDiff(row) || row.meta != null);',
      replace: '  const expandable = isAudit;',
    }],
    files: [R_HIST],
    mustFail: ['a row with a payload is expandable; a row with none is not a button'],
  },
  {
    name: '8. the synthesised entry stops being marked as document-derived',
    why: 'it must never be mistaken for an audit row — that is the whole condition on building it',
    edits: [{
      file: FEED,
      find: "    <li data-origin={isAudit ? 'audit' : 'document'}",
      replace: '    <li data-origin="audit"',
    }],
    files: [R_HIST],
    mustFail: [
      '(d) a creation entry is synthesised from the document, and is marked as such',
      'in-house synthesises its own creation entry, from its own source',
    ],
    /**
     * ── FIVE CORRECTED DECLARATIONS, AND THIS IS THE MOST USEFUL RESULT IN
     *    THE FILE ────────────────────────────────────────────────────────────
     *
     * FIVE assertions mention the synthesised entry and CANNOT TELL IT FROM AN
     * AUDIT ROW. Every one of them reads its CONTENT — its label, its source
     * line, whether it is expandable, whether it exists at all — and the content
     * is identical with the marking removed. They stay green while the entry is
     * indistinguishable from a record of something an admin did, which is
     * precisely the failure the brief called out as the condition on building it.
     *
     * Only the two that read `data-origin` see it. That is why the distinction
     * is structural in the markup rather than left to the wording of the third
     * line: the wording is real and a reader sees it, but no assertion here can
     * check Thai prose for whether it "reads like" an audit row.
     */
    mustStillPass: [
      '(d) the synthesised entry is SUPPRESSED when the feed is truncated',
      '(d) no origin means no entry, not an entry with no date',
      '(d) an unrecognised source is shown, not hidden',
      'a row with a payload is expandable; a row with none is not a button',
      'a legacy in-house record holding source "web" says so rather than guessing',
    ],
  },
  {
    name: '9. the synthesised entry survives onto a TRUNCATED feed',
    why: 'the oldest row on screen is not the oldest row, so "created" at the bottom asserts a completeness the list does not have',
    edits: [{
      file: VOCAB,
      find: '  if (!origin?.createdAt || !complete) return null;',
      replace: '  if (!origin?.createdAt) return null;',
    }],
    files: [R_HIST],
    mustFail: ['(d) the synthesised entry is SUPPRESSED when the feed is truncated'],
    /**
     * EVERY OTHER HISTORY ASSERTION STAYS GREEN, and that is the measurement: the
     * entry renders perfectly, in the right place, with the right marking. Only
     * an assertion that knows about truncation can see that it should not be
     * there at all.
     */
    mustStillPass: [
      '(d) a creation entry is synthesised from the document, and is marked as such',
      'no feed emits an empty element, in any state',
      'each entry is an 82px row with the measured icon box and timestamp block',
    ],
  },
  {
    name: '10. a title is invented for an action nothing writes',
    why: 'a label for an event no code produces is the frame’s ส่งใบเสนอราคา entry, built',
    edits: [{
      file: VOCAB,
      find: "export const PUBLIC_ACTION_TITLES = Object.freeze({\n  status: 'อัปเดตสถานะรายการ',",
      replace: "export const PUBLIC_ACTION_TITLES = Object.freeze({\n  quote:  'ส่งใบเสนอราคา',\n  status: 'อัปเดตสถานะรายการ',",
    }],
    files: [R_HIST],
    mustFail: [
      '(b) no vocabulary names a send-quotation action, on either collection',
      '(b) the vocabulary carries EXACTLY the actions that are written',
    ],
  },
  {
    name: '11. the harvest’s history slot goes back to a <p> stub',
    why: 'a stub renders the tab panel perfectly and harvests NOT ONE of the feed’s classes',
    /**
     * ── THE FIND TEXT WAS WRONG ON THE FIRST RUN, AND THE CASE PROVED NOTHING
     *
     * It mutated the harvest sweep's own slot and left the GEOMETRY test's call
     * site — `history: await historySlot()`, inline — untouched, so the
     * assertion under test never saw a stub and reported "still green" for a
     * mutation that had not reached it.
     *
     * A rehearsal case that edits the wrong line looks exactly like a guard that
     * cannot fail. The harness's own "the find text occurs exactly once" check
     * cannot see this: both spellings exist and each occurs once.
     */
    edits: [{
      file: HARVEST,
      find: '    h(RegistrationDetailClient, { doc: DETAIL_PUBLIC_DOC, history: await historySlot() }));',
      replace: "    h(RegistrationDetailClient, { doc: DETAIL_PUBLIC_DOC, history: h('p', null, 'x') }));",
    }],
    files: [HARVEST],
    mustFail: ['the measured geometry really is in the harvest, not merely a large count'],
    /**
     * THE POINT OF THE WHOLE INSTRUMENT, from the other direction. The
     * compiled-CSS sweep stays GREEN — it only reports classes it HARVESTED, and
     * a class nobody rendered is a class nobody reports. A guard that can be
     * silenced by rendering less is exactly the shape the geometry list exists to
     * close.
     */
    mustStillPass: ['every arbitrary-value class the DETAIL screens RENDER compiles to a rule'],
  },
  {
    name: '12. the panel stops defaulting to the accordion',
    why: 'six other screens mount this component and were not part of this round',
    edits: [{
      file: PANEL,
      find: "  variant = 'accordion', titles, origin, description,",
      replace: "  variant = 'feed', titles, origin, description,",
    }],
    files: [R_HIST],
    mustFail: ['every other mount of the panel is untouched by the feed'],
  },
];

const ALL_TARGETS = [SHELL, PUBD, INFO, FEED, VOCAB, PANEL, HARVEST];
const ALL_TESTS   = [R_ATT, R_HIST, R_SHELL, R_PUB, P_INFO, F_ACTIONS, HARVEST];

async function main() {
  const original = new Map(
    ALL_TARGETS.map((rel) => [rel, readFileSync(path.join(ROOT, rel), 'utf8')]),
  );

  console.log('');
  console.log('== TAB-CONTENT CONTROL REHEARSAL =========================================');
  for (const rel of ALL_TARGETS) console.log(`   target: ${rel}`);
  console.log('   every file is restored in a finally, including on error');
  console.log('');

  try {
    console.log('-- baseline (unmutated) --------------------------------------------------');
    const base = runTests(ALL_TESTS);
    check('the guarding tests are green to start with', base.failed.length === 0,
      base.failed.length ? `already failing: ${base.failed.join(', ')}` : `${base.passed} passed`);
    console.log('');

    for (const c of CASES) {
      console.log(`-- ${c.name} ${'-'.repeat(Math.max(0, 70 - c.name.length))}`);
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
    console.log('-- restored --------------------------------------------------------------');
    for (const rel of ALL_TARGETS) {
      const same = readFileSync(path.join(ROOT, rel), 'utf8') === original.get(rel);
      console.log(`   ${ok(same)} ${rel}`);
      if (!same) failures += 1;
    }
  }

  console.log('');
  console.log(failures === 0
    ? '== ALL CONTROLS BEHAVED AS DECLARED ======================================'
    : `== ${failures} CONTROL(S) DID NOT BEHAVE AS DECLARED ======================`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv[2] !== '--child') await main();
