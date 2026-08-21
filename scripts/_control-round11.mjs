/**
 * THE CONTROLS FOR ROUND 11's GUARDS.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-round11.mjs list
 *   node scripts/_control-round11.mjs verify
 *   node scripts/_control-round11.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round11.mjs revert
 *
 * Same harness as _control-round10.mjs, including the CRLF handling, the
 * unknown-key hard failure and `verify`.
 *
 * ══ THREE OF THESE ARE EXPECTED TO LEAVE THE RENDER TIER GREEN ══════════════
 *
 * `staysGreen` is a measurement here, not a footnote. Round 11's claim is that
 * the type scale has ONE SOURCE, and that claim has two halves which fail in
 * different directions:
 *
 *   · a break that changes the CONSTANT must move every card    → render reddens
 *   · a break that writes a size INTO a card must be caught     → source reddens,
 *     while the page looks and renders identically              → render green
 *
 * `card-own-value-size` is the second shape, and its green render tier is the
 * proof that the source guard is not redundant with the markup one. A control
 * that reddened both would mean the render tier was somehow reading the source;
 * one that reddened neither would mean nothing was watching.
 *
 * ══ AND ONE IS A DISCRIMINATION TEST ════════════════════════════════════════
 *
 * `heading-longer` exists because round 11 RE-POINTED three assertions that were
 * bound to the old card name. Re-pointing is where face three of defect 7 gets
 * introduced: the new string is longer and shares a tail with strings the same
 * tests forbid, so a bare `includes` would keep passing on markup that no longer
 * satisfies the claim. The control renames the card to a SUPERSET of the new
 * name — which a bare substring check accepts and an element-anchored one
 * rejects — and that is the only form that proves the re-point made the guard
 * stronger rather than merely different.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHELL   = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUBLIC  = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INHOUSE = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';

const BREAKS = {
  // ── item 3: the type scale has ONE source ────────────────────────────────

  'value-back-to-13': {
    file: SHELL,
    why: 'Put the field value back to the pre-round-11 13px/25px. THE WHOLE ROUND, UNDONE FROM ONE LINE — which is the point: if this reddens every card on both screens, the size really does live in one place.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › EVERY value cell on BOTH screens carries the one shared value class',
      'render/registrationTypeScale › the heading is SMALLER than the value it sits over — the round, as one claim',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
      'render/registrationTypeScale › the value size is a literal in exactly ONE place in the whole detail tree',
      'render/registrationTypeScale › the heading and label class strings are single literals too',
      'render/registrationTypeScale › CONTROL: those literals are ones the probe could actually find',
      'render/registrationTypeScale › the ATTENDEE TABLE cells follow; its chrome deliberately does not',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    find: "export const DETAIL_FIELD_VALUE = 'text-[16px] leading-[28px]';",
    replace: "export const DETAIL_FIELD_VALUE = 'text-[13px] leading-[25px]';",
  },

  'card-own-value-size': {
    file: PUBLIC,
    why: 'Spell the value size into ONE card instead of importing it. THE PAGE IS BYTE-IDENTICAL — same classes, same markup, same pixels — and the only thing that can see it is the source guard. This is the break the render tier is structurally unable to catch, and the reason the source half of the one-source claim exists.',
    reddens: [
      'render/registrationTypeScale › the value size is a literal in exactly ONE place in the whole detail tree',
      'render/registrationTypeScale › no CARD file carries a detail type size of its own',
    ],
    staysGreen: [
      'render/registrationTypeScale › EVERY value cell on BOTH screens carries the one shared value class — THE MEASUREMENT: the markup is unchanged, so a render assertion cannot distinguish a shared constant from a copy of it. That is what the source guard is for.',
      'fs/tailwindArbitraryValueRules › every arbitrary-value class the DETAIL screens RENDER compiles to a rule — the class is still a complete literal, so it still compiles.',
    ],
    find: "                    className={cn('block truncate text-9e-action hover:underline', DETAIL_FIELD_VALUE)}>",
    replace: '                    className="block truncate text-9e-action hover:underline text-[16px] leading-[28px]">',
  },

  'heading-not-smaller': {
    file: SHELL,
    why: 'Take the card heading UP instead of down — 17px, above the 16px value. The round said headings shrink so the values dominate; this is that decision inverted, with every class still a valid literal that compiles.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › EVERY section-card heading carries the one shared heading class',
      'render/registrationTypeScale › the heading is SMALLER than the value it sits over — the round, as one claim',
      'render/registrationTypeScale › the heading and label class strings are single literals too',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
    ],
    staysGreen: [
      'render/registrationTypeScale › the renamed card heading fits its header row without truncating — THE MEASUREMENT: 17px is still narrow enough for the 768px header row, so a FIT check cannot see a size INVERSION. That is what the smaller-than assertion is for, and this is the proof the two are not redundant.',
      'fs/tailwindArbitraryValueRules › the measured-geometry harvest — 17px/27px are complete literals and compile, which is precisely the class of change a compile check is blind to.',
    ],
    find: "export const DETAIL_CARD_HEADING = 'text-[14px] font-bold leading-[23px]';",
    replace: "export const DETAIL_CARD_HEADING = 'text-[17px] font-bold leading-[27px]';",
  },

  'label-stays-11': {
    file: SHELL,
    why: 'Leave the label at 11px while the value goes to 16 — (a) ignored. It is 0.69 of its value and reads as a caption rather than one half of a pair, and NOTHING about the markup is otherwise wrong.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › EVERY label cell carries the one shared label class, at both widths',
      'render/registrationTypeScale › the heading and label class strings are single literals too',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › the 13px label still sets on ONE line in the narrowest label track — 11px fits even better. A width check cannot tell "small enough" from "too small", which is the whole of item (a).',
    ],
    find: "export const DETAIL_FIELD_LABEL = 'text-[13px] leading-[21px] lg:leading-[28px]';",
    replace: "export const DETAIL_FIELD_LABEL = 'text-[11px] leading-[16px] lg:leading-[25px]';",
  },

  'label-too-wide': {
    file: SHELL,
    why: 'Take the label to 15px. It clears every shape check and every render check — it is a complete literal, it compiles, it reaches every dt — and the LONGEST label no longer fits the 22% track at the narrowest lg width, so it wraps under itself and the one-baseline reading the column exists for is gone. Only the font measurement can see this.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › EVERY label cell carries the one shared label class, at both widths',
      'render/registrationTypeScale › the 13px label still sets on ONE line in the narrowest label track',
      'render/registrationTypeScale › the heading is SMALLER than the value it sits over — 15px also overtakes the 14px card heading, which is a second thing wrong with it',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
    ],
    find: "export const DETAIL_FIELD_LABEL = 'text-[13px] leading-[21px] lg:leading-[28px]';",
    replace: "export const DETAIL_FIELD_LABEL = 'text-[15px] leading-[24px] lg:leading-[28px]';",
  },

  'leading-under-the-floor': {
    file: SHELL,
    why: 'Keep 16px and put the line box back to 25px. THE DEFECT ROUND 3 SHIPPED, in em: 25px is 1.56em against LINE Seed Sans TH’s own 1.584em, so the half-leading goes negative and Thai upper marks clip anywhere the text is inside overflow:hidden — which the attendee cells are. Nothing about the markup is wrong and the class compiles.',
    reddens: [
      'render/registrationTypeScale › the sizes under test are the ones this file names',
      'render/registrationTypeScale › EVERY value cell on BOTH screens carries the one shared value class',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
      'render/registrationTypeScale › every type pair this round ships clears LINE Seed Sans TH’s own line box',
      'render/registrationTypeScale › the heading and label class strings are single literals too',
      'fs/tailwindArbitraryValueRules › the measured geometry really is in the harvest, not merely a large count',
    ],
    staysGreen: [
      'render/registrationTypeScale › …and clears the ink extremes too — THE MEASUREMENT: 25px still clears the 23.8px ink extent, so the INK check cannot see this. The two are not redundant — the floor is about ONE line being sheared inside overflow:hidden, the ink check about TWO wrapped lines colliding — and 25px fails only the first.',
      'AND THIS CONTROL IS WHY §3 DERIVES ITS PAIRS FROM THE CONSTANTS. In its first form it reddened NOTHING in §3: both floor tests iterated the probe script’s hand-written table, and the table still said 28. Face three of defect 7, in the instrument rather than in the code. Fixed before this line was written.',
    ],
    find: "export const DETAIL_FIELD_VALUE = 'text-[16px] leading-[28px]';",
    replace: "export const DETAIL_FIELD_VALUE = 'text-[16px] leading-[25px]';",
  },

  'system-heading-follows': {
    file: SHELL,
    why: 'Make the ข้อมูลระบบ heading take the shared card heading. It is the stated exception — the quietest heading on the page, deliberately below the others — and following would take it from 12px to 14px, which is the opposite of what the round asked for on that card.',
    reddens: [
      'render/registrationTypeScale › EVERY section-card heading carries the one shared heading class',
      'render/registrationTypeScale › the derived pair list is real — four sources, four sizes, no empty parse',
      'render/registrationTypeScale › the probe’s printed table IS the scale the components ship',
    ],
    find: '          <h2 className="text-[12px] font-bold leading-[20px] text-[var(--text-secondary)]">{title}</h2>',
    replace: '          <h2 className={cn(\'text-[var(--text-secondary)]\', DETAIL_CARD_HEADING)}>{title}</h2>',
  },

  'mono-keeps-its-size': {
    file: PUBLIC,
    why: 'Put `text-[11px]` back on the mono helper. The reference number and the two ids then sit at 11px in a card whose every other value is 16 — a value that ignored the rescale by having a size of its own, which is exactly the drift the round removed.',
    reddens: [
      'render/registrationTypeScale › the mono ids and the Omise link FOLLOW — they carry no size of their own',
    ],
    staysGreen: [
      'render/registrationTypeScale › nothing inside a value cell sets a size the exception list does not name — THE MEASUREMENT: 11px is on the allow list (the copy control, the two hint spans, the in-house course code), so that assertion CANNOT see this and the mono test is not redundant with it.',
    ],
    find: "const mono = (value) => (value ? <span className=\"font-mono\">{value}</span> : '');",
    replace: "const mono = (value) => (value ? <span className=\"font-mono text-[11px]\">{value}</span> : '');",
  },

  'attendee-cells-drift': {
    file: PUBLIC,
    why: 'Put the attendee NAME cell back to 14px in a 17.25px line box — (c) reversed. The roster then sits two points under the cards holding the same person, and the cell is back inside a `truncate` whose line box the font overflows.',
    reddens: [
      'render/registrationTypeScale › the ATTENDEE TABLE cells follow; its chrome deliberately does not',
      'render/registrationTypeScale › the attendee name cell no longer clips its own Thai marks',
      'render/registrationTypeScale › no CARD file carries a detail type size of its own',
      'render/registrationTypeScale › the heading and label class strings are single literals too',
    ],
    find: "                <p className={cn('truncate font-bold text-[var(--text-primary)]', DETAIL_FIELD_VALUE)}>",
    replace: '                <p className="truncate text-[14px] font-bold leading-[17.25px] text-[var(--text-primary)]">',
  },

  'quoted-note-drifts': {
    file: SHELL,
    why: 'Give the customer note a size of its own again. It is the VALUE of its card and the only one that sits outside a field row, so it is the value most likely to be forgotten in a rescale — and a 13px customer note under 16px fields looks like a rendering fault rather than a decision.',
    reddens: [
      'render/registrationTypeScale › the internal-notes entries do NOT follow either',
    ],
    staysGreen: [
      'render/registrationTypeScale › EVERY value cell on BOTH screens carries the one shared value class — THE MEASUREMENT: QuotedNote is not inside a `<dd>`, so no dd-based assertion can reach it. That is why it has an assertion of its own rather than being assumed covered.',
    ],
    find: "    <blockquote className={cn('border-l-[3px] border-l-9e-brand/40 pl-[15px] text-[var(--text-primary)]', DETAIL_FIELD_VALUE)}>",
    replace: '    <blockquote className="border-l-[3px] border-l-9e-brand/40 pl-[15px] text-[13px] leading-[22px] text-[var(--text-primary)]">',
  },

  // ── item 1: the rename, and whether the re-pointed guards still bind ──────

  'rename-reverted': {
    file: PUBLIC,
    why: 'Put การเงินและเอกสาร back. Every assertion re-pointed in round 11 must redden — an assertion that was re-pointed to a name nothing renders would be quietly asserting about nothing at all.',
    reddens: [
      'render/registrationDetailShell › the public ข้อมูลสำหรับออกใบเสนอราคา card carries NO quotation number',
      'render/coordinatorCardRows › the coordinator card no longer shows เข้าอบรมด้วย',
      'render/coordinatorCardRows › a coordinator with NO details renders NO rows — which the old row prevented',
    ],
    staysGreen: [
      'render/registrationTypeScale › the renamed card heading fits its header row without truncating — THE MEASUREMENT: that test asserts about the STRING, not about what the card is called, so it cannot see a rename in either direction. EXACTLY THREE assertions in the whole suite were bound to the old name, all three are listed above, and all three redden — which is what "re-pointed, not deleted" has to mean.',
    ],
    find: '            title="ข้อมูลสำหรับออกใบเสนอราคา"',
    replace: '            title="การเงินและเอกสาร"',
  },

  'heading-longer': {
    file: PUBLIC,
    why: 'THE DISCRIMINATION TEST. Rename the card to a SUPERSET of the new name — ข้อมูลสำหรับออกใบเสนอราคาของลูกค้า. A bare `includes(...)` check accepts this, because the new name is a prefix of it; the element-anchored `>…<` check rejects it. If nothing reddens, the re-point was a rename of a string rather than a strengthening of the guard, and face three is live.',
    reddens: [
      'render/registrationDetailShell › the public ข้อมูลสำหรับออกใบเสนอราคา card carries NO quotation number',
      'render/coordinatorCardRows › the coordinator card no longer shows เข้าอบรมด้วย',
      'render/coordinatorCardRows › a coordinator with NO details renders NO rows — which the old row prevented',
    ],
    find: '            title="ข้อมูลสำหรับออกใบเสนอราคา"',
    replace: '            title="ข้อมูลสำหรับออกใบเสนอราคาของลูกค้า"',
  },

  'inhouse-rename-reverted': {
    file: INHOUSE,
    why: 'Put the in-house card back to ข้อมูลใบเสนอราคา while the public one keeps the new name. THE HALF-SWEPT RENAME — each screen reads correctly on its own and the two disagree about what one card is called, which is the state this round was asked to check for rather than create.',
    reddens: [
      'render/inhouseCancelledReadOnly › a pending request keeps its edit control — on EVERY editable card',
      'render/inhouseCancelledReadOnly › the cancellation lock removes every one of those, not merely some',
    ],
    find: '            title="ข้อมูลสำหรับออกใบเสนอราคา"\n            {...editProps(\'quotation\')}',
    replace: '            title="ข้อมูลใบเสนอราคา"\n            {...editProps(\'quotation\')}',
  },

  'taxid-vocabulary-splits': {
    file: INHOUSE,
    why: 'Put เลขผู้เสียภาษี back on the in-house row while the public screen says เลขประจำตัวผู้เสียภาษี. One field, two spellings, three inches apart in a reader’s workflow — the shape round 3 removed from the attendee table’s ชื่อ-นามสกุล header and the shape the vocabulary alignment exists to prevent.',
    reddens: [
      'render/registrationCopyAffordance › the in-house screen offers one on its person and its addresses',
    ],
    staysGreen: [
      'render/registrationTypeScale › the 13px label still sets on ONE line in the narrowest label track — THE MEASUREMENT: เลขผู้เสียภาษี is SHORTER (5.216em vs 8.845em), so a width check is blind in this direction. Nothing in the suite pins a row LABEL’s wording except through the copy control’s accessible name, which is why the assertion that reddens is in the copy file rather than in a vocabulary one.',
    ],
    find: '                <DLRow label="เลขประจำตัวผู้เสียภาษี" value={quotation.taxId}\n                  action={<CopyAction text={quotation.taxId} label="เลขประจำตัวผู้เสียภาษี" />} />',
    replace: '                <DLRow label="เลขผู้เสียภาษี" value={quotation.taxId}\n                  action={<CopyAction text={quotation.taxId} label="เลขผู้เสียภาษี" />} />',
  },

  // ── item 2: the two new copy controls ────────────────────────────────────────────────

  'copy-empty': {
    file: SHELL,
    why: 'Remove `CopyAction`’s own empty guard, so the control renders whenever it is reached. THE ROUND-5 DEFEAT, restored: an empty string still produces a button, and the reader is offered a copy of nothing.',
    reddens: [
      'render/registrationCopyAffordance › a row that renders WITHOUT a value offers no copy — the emptyHint case',
      'render/registrationCopyAffordance › CopyAction renders NOTHING for an empty or whitespace-only text',
    ],
    staysGreen: [
      'render/registrationCopyAffordance › NEITHER new control appears on a row whose value is empty — THE MEASUREMENT: on the two NEW rows `DLRow` drops the row before `CopyAction` is reached, so that test is really about DLRow. The guard on the CONTROL is only reachable through an `emptyHint` row, which is the in-house venue — and that is the assertion above. Stated so nobody reads the new test as covering the control’s own guard.',
      'render/registrationCopyAffordance › a dropped ROW takes its copy control with it — same reason.',
    ],
    find: "  const value = typeof text === 'string' ? text.trim() : '';\n  if (!value) return null;",
    replace: "  const value = typeof text === 'string' ? text.trim() : '';",
  },

  'copy-gated-by-lock': {
    file: PUBLIC,
    why: 'Hide the whole quotation read view on a cancelled record — the tempting reading of "a cancelled record is read-only". It takes all three copy controls with it, including the two added this round, and leaves a salesperson looking at a frozen record with nothing they can do to it.',
    reddens: [
      'render/registrationCopyAffordance › both new controls survive the cancellation lock',
      'render/registrationCopyAffordance › every copy control survives the cancellation lock, on BOTH screens',
      'render/registrationFieldRows › CONTROL: the same document, NOT cancelled, does render those affordances',
    ],
    find: '              <InvoiceReadView requestInvoice={requestInvoice} invoice={invoice} />',
    replace: '              <InvoiceReadView requestInvoice={requestInvoice && !readOnly} invoice={invoice} />',
  },

  'copy-name-respelled': {
    file: PUBLIC,
    why: 'Build the copied name a SECOND time inside `action=` instead of reading the const the row renders. Behaviour is identical today and the two spellings are free to diverge tomorrow — which is the defect the address row already documents. NOTHING MAY REDDEN: if something does, a guard is bound to a spelling rather than to the property.',
    reddens: [],
    staysGreen: [
      'render/registrationCopyAffordance › the quotation card offers a copy on its name, its tax id and its address — THE MEASUREMENT: the label and the text are unchanged, so every assertion about the CONTROL is silent. The one-const shape is a readability decision this suite deliberately does not pin, and this control is what says so out loud.',
      'render/registrationCopyAffordance › the two new controls are the SAME component, not a second implementation',
    ],
    find: '          action={<CopyAction text={invoiceName} label="ชื่อ-นามสกุลใบเสนอราคา" />} />',
    replace: "          action={<CopyAction text={`${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim()} label=\"ชื่อ-นามสกุลใบเสนอราคา\" />} />",
  },

  'copy-labels-collide': {
    file: PUBLIC,
    why: 'Give the new tax-id control the same label the address one has. A screen reader then announces two different controls identically, which is the failure the "names WHAT it copies" rule exists for and which no visual check can see.',
    reddens: [
      'render/registrationCopyAffordance › EVERY copy control names WHAT it copies — none is a bare "คัดลอก"',
    ],
    find: '        action={<CopyAction text={invoice.taxId} label="เลขประจำตัวผู้เสียภาษี" />} />',
    replace: '        action={<CopyAction text={invoice.taxId} label="ที่อยู่ใบเสนอราคา" />} />',
  },

  'course-code-follows': {
    file: INHOUSE,
    why: 'Make the in-house course CODE follow the value size. It is the annotation UNDER the name, and at 16px it stops being an annotation — and it silently stops matching the in-house LIST cell, which round 11 does not touch. The stated exception, removed.',
    reddens: [
      'render/registrationTypeScale › the in-house course CODE keeps its 11px — the exception is pinned, not tolerated',
    ],
    staysGreen: [
      'render/registrationTypeScale › the mono ids and the Omise link FOLLOW — THE MEASUREMENT, AND THE REASON THE ASSERTION ABOVE EXISTS AT ALL. That test catches a mono value GAINING a size; this break makes one LOSE its stated exception, and in its first form THE WHOLE SUITE STAYED GREEN. A documented exception nobody asserts is an exception nobody decided.',
    ],
    find: '          {name && <span className="block font-mono text-[11px] text-[var(--text-muted)]">{code}</span>}',
    replace: '          {name && <span className="block font-mono text-[var(--text-muted)]">{code}</span>}',
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round11.state');

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const write = (rel, text) => writeFileSync(path.join(ROOT, rel), text, 'utf8');

/** Splice one occurrence, preserving the file's own line endings. */
function spliceOnce(source, find, replace, label) {
  const crlf = source.includes('\r\n');
  const needle = crlf ? find.replace(/\n/g, '\r\n') : find;
  const value = crlf ? replace.replace(/\n/g, '\r\n') : replace;
  const at = source.indexOf(needle);
  if (at === -1) {
    throw new Error(`${label}: the FIND text is not in the file — the source has moved on:\n---\n${find}\n---`);
  }
  if (source.indexOf(needle, at + needle.length) !== -1) {
    throw new Error(`${label}: the FIND text appears more than once — it does not identify one site`);
  }
  return source.slice(0, at) + value + source.slice(at + needle.length);
}

/** Line-numbered before/after for the region that changed. Proof it landed. */
function showDiff(rel, before, after) {
  const b = before.split(/\r?\n/);
  const a = after.split(/\r?\n/);
  let head = 0;
  while (head < b.length && head < a.length && b[head] === a[head]) head += 1;
  let tail = 0;
  while (tail < b.length - head && tail < a.length - head
         && b[b.length - 1 - tail] === a[a.length - 1 - tail]) tail += 1;

  console.log(`\n--- a/${rel}`);
  console.log(`+++ b/${rel}`);
  console.log(`@@ -${head + 1},${b.length - head - tail} +${head + 1},${a.length - head - tail} @@`);
  for (let i = head; i < b.length - tail; i += 1) console.log(`-${b[i]}`);
  for (let i = head; i < a.length - tail; i += 1) console.log(`+${a[i]}`);
  console.log(`\nfile lines ${b.length} -> ${a.length}; `
    + `${b.length - head - tail} removed, ${a.length - head - tail} added.`);
  console.log('(A control that changed the whole file is a control that failed — check those numbers.)');
}

const [, , cmd, name] = process.argv;

if (!cmd || cmd === 'list') {
  console.log('Round 11 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}   [${brk.file.split('/').pop()}]`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red:   ${r}`);
    for (const g of brk.staysGreen ?? []) console.log(`      green: ${g}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'verify') {
  const stale = [];
  for (const [key, brk] of Object.entries(BREAKS)) {
    const source = read(brk.file);
    const crlf = source.includes('\r\n');
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const first = source.indexOf(needle);
      if (first === -1) stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND is gone from ${brk.file}`);
      else if (source.indexOf(needle, first + needle.length) !== -1) {
        stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND matches more than once in ${brk.file}`);
      }
    }
  }
  const total = Object.keys(BREAKS).length;
  if (stale.length === 0) {
    console.log(`all ${total} controls resolve to exactly one site each.`);
    process.exit(0);
  }
  console.error(`${stale.length} of ${total} controls no longer identify one site:\n`);
  for (const line of stale) console.error(`  ${line}`);
  console.error('\nEither the source moved (re-point the FIND) or the feature was removed '
    + '(delete the control and name it in the header).');
  process.exit(1);
}

if (cmd === 'revert') {
  if (!existsSync(STATE)) { console.log('nothing to revert'); process.exit(0); }
  const rel = readFileSync(STATE, 'utf8').trim();
  const backup = path.join(ROOT, rel + BACKUP_SUFFIX);
  if (!existsSync(backup)) throw new Error(`the backup for ${rel} is gone — restore it from git`);
  const original = readFileSync(backup, 'utf8');
  write(rel, original);
  unlinkSync(backup);
  unlinkSync(STATE);
  console.log(`reverted ${rel} (${original.length} bytes restored)`);
  process.exit(0);
}

if (cmd !== 'apply' || !name || !BREAKS[name]) {
  console.error(`unknown control "${name ?? ''}" — run \`list\` to see them`);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = BREAKS[name];

// Round 8 earned this: a control that declares a key this harness does not apply
// reports a WEAKER break than it claims, and then "stayed green" is a lie about
// a break that never fully landed.
const KNOWN_KEYS = new Set(['file', 'why', 'reddens', 'staysGreen', 'find', 'replace', 'also']);
for (const key of Object.keys(brk)) {
  if (!KNOWN_KEYS.has(key)) {
    console.error(`${name}: unknown key "${key}". A control that declares something this harness `
      + 'does not apply reports a weaker break than it claims.');
    process.exit(2);
  }
}

const before = read(brk.file);
let after = spliceOnce(before, brk.find, brk.replace, name);
if (brk.also) after = spliceOnce(after, brk.also.find, brk.also.replace, `${name} (second site)`);

writeFileSync(path.join(ROOT, brk.file + BACKUP_SUFFIX), before, 'utf8');
write(brk.file, after);
writeFileSync(STATE, brk.file, 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
showDiff(brk.file, before, after);
console.log('\nEXPECTED RED:');
for (const r of brk.reddens) console.log(`  ${r}`);
if (brk.staysGreen) {
  console.log('\nEXPECTED GREEN (this is a measurement, not a gap):');
  for (const g of brk.staysGreen) console.log(`  ${g}`);
}
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round11.mjs revert');
