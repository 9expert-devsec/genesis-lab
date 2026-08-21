/**
 * THE CONTROLS FOR ROUND 13's GUARDS.
 *
 *   node scripts/_control-round13.mjs list
 *   node scripts/_control-round13.mjs verify
 *   node scripts/_control-round13.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round13.mjs revert
 *
 * Same harness as rounds 10-12: CRLF handling, `verify`, an unknown-key hard
 * failure, and an `also` that may name a second FILE.
 *
 * ══ THE BYLINE DEFECT HAD A DIAGNOSIS STEP, AND IT HAS A CONTROL ════════════
 *
 * The reported symptom — a saved note showing a bare em dash — was consistent
 * with TWO opposite causes: a write path that lost the author, or a read path
 * that could not see it. `scripts/audit-internal-note-bylines.mjs` settled it
 * read-only: the stored note carries all four keys.
 *
 * So the controls come in two families. `echo-*` restore the CLIENT-side echo
 * that was the real cause; `stamp-*` break the WRITE, which was never broken,
 * and exist so the write-path guards are known to fire rather than assumed to.
 * A suite that only guarded the half that failed would be blind to the half
 * that did not — and the two halves are one keystroke apart in the same action.
 *
 * ══ TWO ARE EXPECTED TO REDDEN NOTHING ══════════════════════════════════════
 *
 * `dash-in-a-comment` and `menu-item-reordered` both change text that no rule
 * covers, and their green is the measurement: the first says the guards read
 * CODE rather than prose, the second says the menu assertion is bound to the
 * SET of items rather than to their order.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHELL   = 'src/app/admin/registrations/_components/detailShell.jsx';
const PUBLIC  = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const INHOUSE = 'src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx';
const ACTIONS = 'src/lib/actions/registrations.js';
const NOTES   = 'src/lib/registrations/internalNotes.js';

const BREAKS = {
  // ── item 1: the byline, the half that actually failed ────────────────────

  'echo-restored': {
    file: PUBLIC,
    why: 'Put the client-side echo back on the PUBLIC screen — the literal that was on screen for the reported note. It looks entirely reasonable: the server owns the byline, so the client leaves it blank and waits for the reload. THE RELOAD NEVER COMES, because `internalNotes` is a `useState` whose initialiser runs once per mount and a revalidated `doc` prop does not re-run it.',
    reddens: [
      'fs/internalNoteAuthorStamp › NEITHER client constructs a note entry of its own',
      'fs/internalNoteAuthorStamp › both clients append the SERVER entry, through the SAME reader as the load',
    ],
    staysGreen: [
      'render/registrationPlainContact › every byline assertion — THE MEASUREMENT, AND IT IS THE WHOLE REASON THIS DEFECT SHIPPED. The echo only exists AFTER a click, and renderToStaticMarkup never clicks. No render assertion in this suite can reach the optimistic path; the guard has to be on the SHAPE of the code that produces it.',
      'pure/internalNoteByline › every test — the byline function is correct either way; what the echo breaks is what it is HANDED.',
    ],
    find: '        setInternalNotes((prev) => [...prev, ...readNotes([res.note ?? { body }])]);\n        setNoteDraft(\'\');\n      } else {\n        setError(res.error || \'บันทึกไม่สำเร็จ\');\n      }\n      setBusy(null);\n    });\n  };\n\n  /**\n   * MOVE THE REGISTRATION TO A DIFFERENT ROUND.',
    replace: '        setInternalNotes((prev) => [...prev, { body, authorId: \'\', authorName: \'\', createdAt: null }]);\n        setNoteDraft(\'\');\n      } else {\n        setError(res.error || \'บันทึกไม่สำเร็จ\');\n      }\n      setBusy(null);\n    });\n  };\n\n  /**\n   * MOVE THE REGISTRATION TO A DIFFERENT ROUND.',
  },

  'reply-dropped': {
    file: ACTIONS,
    why: 'Return `{ ok: true }` again. The clients then fall back to `readNotes([{ body }])`, which is honest — body, no byline, no dash — but the note loses its author on screen until a reload. THE DEGRADATION IS CORRECT AND THE FEATURE IS STILL GONE, which is why the guard is on the reply existing rather than on the screen surviving without it.',
    reddens: [
      'fs/internalNoteAuthorStamp › the action RETURNS the entry it stamped',
    ],
    staysGreen: [
      'render/registrationPlainContact › a note with NEITHER renders the body and NO byline element at all — THE MEASUREMENT: the fallback path is exactly the "unattributed note" case this asserts, and it renders correctly. A screen that degrades gracefully is not a screen that works, and only the fs guard can tell them apart.',
      'fs/internalNotesAppendOnly › every test — $push, the signature and the back door are all untouched.',
    ],
    find: '  const stored = doc.adminNotes?.[doc.adminNotes.length - 1];\n  return { ok: true, note: serialize(stored) };',
    replace: '  return { ok: true };',
  },

  'byline-dashes-again': {
    file: SHELL,
    why: 'Render the em dash again when there is nothing to show. ROUND 5\'S RULE, REVERSED: a dash asserts "we looked and there is nothing", which in the reported case was false — the author was in the database the whole time and a rendering bug was wearing the costume of missing data.',
    reddens: [
      'render/registrationPlainContact › a note with NEITHER renders the body and NO byline element at all',
      'render/registrationPlainContact › a partial byline renders what it has, with no dangling separator',
      'render/registrationPlainContact › CONTROL: the <p> count DOES move, so the assertion above is a real constraint',
    ],
    staysGreen: [
      'pure/internalNoteByline › a note with NEITHER returns the empty string — never a dash — THE MEASUREMENT: `noteByline` is untouched and still returns \'\'. The dash is the COMPONENT deciding what to do with that, so the pure tier cannot see this at all, and the two tiers are not redundant.',
    ],
    find: '              {noteByline(note, formatDate) ? (\n                <p className="pt-[6px] text-[11px] leading-[16px] text-[var(--text-muted)]">\n                  {noteByline(note, formatDate)}\n                </p>\n              ) : null}',
    replace: '              <p className="pt-[6px] text-[11px] leading-[16px] text-[var(--text-muted)]">\n                {noteByline(note, formatDate) || \'—\'}\n              </p>',
  },

  'byline-dangling-separator': {
    file: NOTES,
    why: 'Join the byline with a template literal instead of filtering. A note with a name and no time then reads `Yanisa P. · ` — a separator pointing at nothing, which is `detailHeading`\'s trailing-colon defect in the same shape, on a field that is blank far more often than a heading is.',
    reddens: [
      'pure/internalNoteByline › a name with no time renders the name, and no dangling separator',
      'pure/internalNoteByline › a time with no name renders the time, and no leading separator',
      'pure/internalNoteByline › a note with NEITHER returns the empty string — never a dash',
      'pure/internalNoteByline › a formatter that returns nothing does not leave a separator behind',
      'pure/internalNoteByline › an unattributed ARRAY note stays unattributed — no fallback name',
      'pure/internalNoteByline › a reply with no note at all degrades to the body, and says nothing false',
      'render/registrationPlainContact › a note with NEITHER renders the body and NO byline element at all',
      'render/registrationPlainContact › a partial byline renders what it has, with no dangling separator',
    ],
    find: '  return [who, when].filter(Boolean).join(\' · \');',
    replace: '  return `${who} · ${when}`;',
  },

  // ── the write path, which was NOT broken ─────────────────────────────────

  'stamp-from-the-client': {
    file: ACTIONS,
    why: 'Take the author from the BODY argument instead of the session — the shape where a caller chooses who a note is from. Every `use server` export is a POST endpoint, so this is not a hypothetical; it is the same class of hole round 1 closed on the status action. The write path was never broken, and this is how the guard over it is known to fire.',
    reddens: [
      'fs/internalNoteAuthorStamp › the stamped fields come off the SESSION, not off an argument',
    ],
    find: '          authorName: session.user?.name,',
    replace: '          authorName: body?.authorName ?? session.user?.name,',
  },

  'authorname-rejoined': {
    file: ACTIONS,
    why: 'Re-resolve the byline from `authorId` at write time — the "fix" round 6 predicted a future reader would reach for, with the symptom it predicted: a departed admin resolves to nothing and the byline goes blank. It is worth a control precisely because the reported defect LOOKED like this one.',
    reddens: [
      'fs/internalNoteAuthorStamp › the action never re-resolves authorName from authorId',
    ],
    find: '  const stored = doc.adminNotes?.[doc.adminNotes.length - 1];',
    replace: '  await Model.populate(doc, { path: \'adminNotes.authorId\' });\n  const stored = doc.adminNotes?.[doc.adminNotes.length - 1];',
  },

  // ── item 2: the quotation card's subject ─────────────────────────────────

  'company-gated-again': {
    file: INHOUSE,
    why: 'Put the `companyDiverges` gate back on the company row. THE DEFECT, EXACTLY: the quotation card names the party it is addressed to only on legacy documents where the two company fields disagree, and shows nothing at all on every document written since the form was split. It reads as a deliberate "only when it differs" and it is the normal case that loses.',
    reddens: [
      'render/registrationPlainContact › the quotation card shows the company when the two names are the SAME',
      'render/registrationPlainContact › a pre-split enquiry falls back to the contact company rather than dropping the row',
      'render/registrationPlainContact › the company sits ABOVE the tax id, the branch and the address',
      'render/registrationPlainContact › สาขา gained a copy control, and it is the same shared component',
      'render/registrationPlainContact › no new control names a label another already uses',
    ],
    staysGreen: [
      'render/registrationPlainContact › it shows the QUOTATION company, never the contact one — THE MEASUREMENT: that test runs on the DIVERGING fixture, which is the one document shape the gate lets through. A suite whose only in-house fixture diverged would have passed straight over this defect for as long as it existed, which is how it survived.',
    ],
    find: '                <DLRow label="ชื่อบริษัท (ใบเสนอราคา)" value={quotationCompanyDisplay}\n                  action={<CopyAction text={quotationCompanyDisplay} label="ชื่อบริษัทสำหรับใบเสนอราคา" />} />',
    replace: '                {companyDiverges && (\n                  <DLRow label="ชื่อบริษัท (ใบเสนอราคา)" value={quotationCompanyDisplay}\n                    action={<CopyAction text={quotationCompanyDisplay} label="ชื่อบริษัทสำหรับใบเสนอราคา" />} />\n                )}',
  },

  'company-reads-the-contact-field': {
    file: INHOUSE,
    why: 'Point the quotation card at `displayCompany` — the CONTACT card\'s answer, which prefers the contact company when the two diverge. On most documents the two are identical so nothing changes, and on exactly the documents where it matters the quotation names the wrong entity. A quotation addressed to the wrong company is not a display bug.',
    reddens: [
      'render/registrationPlainContact › it shows the QUOTATION company, never the contact one',
    ],
    staysGreen: [
      'render/registrationPlainContact › the quotation card shows the company when the two names are the SAME — THE MEASUREMENT: on a non-diverging document the two expressions return the same string, so every assertion that does not use the diverging fixture is blind. That is why the fixture exists.',
    ],
    find: '  const quotationCompanyDisplay = quotationCompany || contactCompany;',
    replace: '  const quotationCompanyDisplay = displayCompany;',
  },

  'branch-copy-dropped': {
    file: INHOUSE,
    why: 'Remove the copy control from สาขา. Nothing about the row looks wrong — the value is still there and still readable — and the one thing a salesperson does with a branch code is paste it into a quotation.',
    reddens: [
      'render/registrationPlainContact › สาขา gained a copy control, and it is the same shared component',
      'render/registrationPlainContact › every new control is ABSENT when its value is empty',
    ],
    find: '                <DLRow label="สาขา" value={branchLabel}\n                  action={<CopyAction text={branchLabel} label="สาขาสำหรับใบเสนอราคา" />} />',
    replace: '                <DLRow label="สาขา" value={branchLabel} />',
  },

  // ── item 3: the links ────────────────────────────────────────────────────

  'mailto-restored': {
    file: INHOUSE,
    why: 'Put the `mailto:` back on the in-house contact email. It renders, it looks like an affordance, and on an office machine with no mail client registered it does nothing at all — while the copy control that replaced it is gone. It also puts back one of round 12\'s five dark-mode failures: `text-9e-action` at 2.92:1 on `--surface`, with no dark counterpart.',
    reddens: [
      'render/registrationPlainContact › NO mailto: or tel: href is rendered by either detail screen',
      'render/registrationPlainContact › …and NO mailto:/tel: literal survives in either client’s CODE',
      'render/registrationPlainContact › each de-linked value gained a copy control',
      'render/registrationPlainContact › no new control names a label another already uses',
    ],
    staysGreen: [
      'render/registrationPlainContact › the values a link used to carry are still ON SCREEN, in plain text — THE MEASUREMENT: that assertion is satisfied by a linked value too. It exists to stop the absence tests passing on a screen that dropped the email entirely, and it correctly cannot tell a link from plain text.',
    ],
    find: '                <DLRow label="อีเมล" value={contact.contactEmail}\n                  action={<CopyAction text={contact.contactEmail} label="อีเมลผู้ติดต่อ" />} />',
    replace: '                <DLRow label="อีเมล" value={contact.contactEmail\n                  ? <a href={`mailto:${contact.contactEmail}`} className="text-9e-action hover:underline">{contact.contactEmail}</a>\n                  : \'\'} />',
  },

  'attendee-link-restored': {
    file: PUBLIC,
    why: 'Put the `mailto:` back on the attendee table\'s email cell only. The in-house screen stays clean, so a guard that swept just one file — or just one screen\'s render — would report the round as intact.',
    reddens: [
      'render/registrationPlainContact › NO mailto: or tel: href is rendered by either detail screen',
      'render/registrationPlainContact › …and NO mailto:/tel: literal survives in either client’s CODE',
      'render/registrationPlainContact › each de-linked value gained a copy control',
      'render/registrationAttendeeTab › email and phone are separate cells, each falling back to its own dash',
      'render/registrationAttendeeTab › the row menu still offers its copy on a cancelled record',
      'render/registrationAttendeeTab › a row with an email and no phone renders ONE contact line, not one and a blank',
    ],
    find: '                    <span className={cn(\'min-w-0 truncate text-[var(--text-primary)]\', DETAIL_FIELD_VALUE)}>\n                      {a.email}\n                    </span>\n                    <CopyAction text={a.email} label={`อีเมลผู้เข้าอบรมท่านที่ ${i + 1}`} />',
    replace: '                    <a href={`mailto:${a.email}`} className={cn(\'min-w-0 truncate text-9e-action\', DETAIL_FIELD_VALUE)}>\n                      {a.email}\n                    </a>',
  },

  'menu-item-restored': {
    file: PUBLIC,
    why: 'Put `คัดลอกอีเมล` back in the attendee row menu. It duplicates the control now on the cell itself, one click further away — the menu exists for actions the row CANNOT show. Nothing breaks; the screen simply offers the same copy twice.',
    reddens: [
      'render/registrationAttendeeTab › an editable row’s menu holds the edit and the ONE copy the row cannot show',
      'render/registrationAttendeeTab › the row menu still offers its copy on a cancelled record',
    ],
    find: '    rowText\n      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,',
    replace: '    attendee.email\n      ? { key: \'copy\', icon: Copy, label: \'คัดลอกอีเมล\', onClick: () => copyText(attendee.email) }\n      : null,\n    rowText\n      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,',
  },

  // ── the two that must redden nothing ─────────────────────────────────────

  'dash-in-a-comment': {
    file: SHELL,
    why: 'Write the banned literals — a mailto: href and an em-dash byline — into a COMMENT. NOTHING MAY REDDEN. If something does, a guard is reading TEXT rather than CODE, which is the defect this suite has now shipped six times in six costumes and the reason `readSource(...).code` exists.',
    reddens: [],
    staysGreen: [
      'render/registrationPlainContact › …and NO mailto:/tel: literal survives in either client’s CODE — THE MEASUREMENT: the source guards must be blind to prose. The round-13 docstrings already quote `mailto:` while explaining its removal, so a raw-text guard would fail on correct code today; this adds a second, deliberate instance.',
      'render/registrationPlainContact › CONTROL: the comment stripper is why the source half passes',
    ],
    find: '// ── Internal notes ──────────────────────────────────────────────────────────',
    replace: '// ── Internal notes ──────────────────────────────────────────────────────────\n// A CONTROL FIXTURE, not code: `href="mailto:x@y.z"` and `{authorName || \'—\'}`\n// and `tel:0812345678` are written here so the source guards are proved blind to\n// prose. See scripts/_control-round13.mjs `dash-in-a-comment`.',
  },

  'menu-item-reordered': {
    file: PUBLIC,
    why: 'Put the edit item AFTER the row copy instead of before it. The SET of menu items is unchanged and only the order moves. NOTHING SHOULD REDDEN — the menu assertions are `deepEqual` against an ordered array, so if they are genuinely order-bound this reddens and the guard is stricter than the claim it makes.',
    reddens: [],
    staysGreen: [
      'render/registrationAttendeeTab › an editable row’s menu holds the edit and the ONE copy the row cannot show — see the run. THIS ONE IS A GENUINE QUESTION rather than a rhetorical one: `deepEqual` on an array IS order-sensitive, so if it reddens the assertion is pinning a presentation order nobody decided. Whichever way it goes is recorded here rather than predicted.',
    ],
    find: '    onEditRow ? { key: \'edit\', icon: Pencil, label: \'แก้ไขรายชื่อ\', onClick: onEditRow } : null,\n    rowText',
    replace: '    rowText',
    also: {
      find: '      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,\n  ].filter(Boolean);',
      replace: '      ? { key: \'copy-row\', icon: Copy, label: \'คัดลอกผู้เข้าอบรม\', onClick: () => copyText(rowText) }\n      : null,\n    onEditRow ? { key: \'edit\', icon: Pencil, label: \'แก้ไขรายชื่อ\', onClick: onEditRow } : null,\n  ].filter(Boolean);',
    },
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round13.state');

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
  console.log('Round 13 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}   [${brk.file.split('/').pop()}]`);
    console.log(`      ${brk.why}`);
    if (brk.reddens.length === 0) console.log('      red:   (nothing — that is the measurement)');
    for (const r of brk.reddens) console.log(`      red:   ${r}`);
    for (const g of brk.staysGreen ?? []) console.log(`      green: ${g}`);
    console.log('');
  }
  process.exit(0);
}

if (cmd === 'verify') {
  const stale = [];
  for (const [key, brk] of Object.entries(BREAKS)) {
    for (const [part, spec] of [['find', brk], ['also', brk.also]].filter(([, s]) => s)) {
      const where = spec.file ?? brk.file;
      const source = read(where);
      const crlf = source.includes('\r\n');
      const needle = crlf ? spec.find.replace(/\n/g, '\r\n') : spec.find;
      const first = source.indexOf(needle);
      if (first === -1) stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND is gone from ${where}`);
      else if (source.indexOf(needle, first + needle.length) !== -1) {
        stale.push(`${key}${part === 'also' ? '.also' : ''}: FIND matches more than once in ${where}`);
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
  for (const rel of readFileSync(STATE, 'utf8').trim().split('\n').filter(Boolean)) {
    const backup = path.join(ROOT, rel + BACKUP_SUFFIX);
    if (!existsSync(backup)) throw new Error(`the backup for ${rel} is gone — restore it from git`);
    const original = readFileSync(backup, 'utf8');
    write(rel, original);
    unlinkSync(backup);
    console.log(`reverted ${rel} (${original.length} bytes restored)`);
  }
  unlinkSync(STATE);
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
if (brk.also) {
  for (const key of Object.keys(brk.also)) {
    if (!new Set(['find', 'replace', 'file']).has(key)) {
      console.error(`${name}.also: unknown key "${key}"`);
      process.exit(2);
    }
  }
}

const touched = [brk.file, ...(brk.also ? [brk.also.file ?? brk.file] : [])]
  .filter((f, i, all) => all.indexOf(f) === i);
const originals = new Map(touched.map((rel) => [rel, read(rel)]));

write(brk.file, spliceOnce(originals.get(brk.file), brk.find, brk.replace, name));
if (brk.also) {
  const rel = brk.also.file ?? brk.file;
  write(rel, spliceOnce(read(rel), brk.also.find, brk.also.replace, `${name} (second site)`));
}

for (const rel of touched) writeFileSync(path.join(ROOT, rel + BACKUP_SUFFIX), originals.get(rel), 'utf8');
writeFileSync(STATE, touched.join('\n'), 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
for (const rel of touched) showDiff(rel, originals.get(rel), read(rel));
console.log('\nEXPECTED RED:');
if (brk.reddens.length === 0) console.log('  (nothing — that is the measurement)');
for (const r of brk.reddens) console.log(`  ${r}`);
if (brk.staysGreen) {
  console.log('\nEXPECTED GREEN (this is a measurement, not a gap):');
  for (const g of brk.staysGreen) console.log(`  ${g}`);
}
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round13.mjs revert');
