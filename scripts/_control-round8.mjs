/**
 * THE CONTROLS FOR ROUND 8's GUARDS.
 *
 * A guard nobody has watched go red is a guard nobody has tested. This applies a
 * NAMED BREAK to the real source, prints the diff that landed so the edit can be
 * seen rather than trusted, and puts it back.
 *
 *   node scripts/_control-round8.mjs list
 *   node scripts/_control-round8.mjs apply <name>
 *   node test/run.mjs
 *   node scripts/_control-round8.mjs revert
 *
 * ── WHY A SCRIPT AND NOT A HAND EDIT ───────────────────────────────────────
 * A hand edit is not reproducible by the next reader, so "I checked it goes red"
 * is a claim rather than a procedure. And a hand edit is not reliably UNDONE — a
 * control left in the tree is a defect committed on purpose, which is the worst
 * possible outcome of testing a test. `revert` restores from a byte-for-byte
 * backup and `apply` refuses while one is outstanding.
 *
 * ── THE TREE IS CRLF ───────────────────────────────────────────────────────
 * Every FIND below is written with LF and spliced against whatever the file
 * actually stores, with the file's own ending preserved. A control that silently
 * rewrote 3,000 line endings would produce a diff touching the whole file and
 * make the real edit unreadable — which is exactly what this note prevents. The
 * diff printer reports the total line count before and after for the same
 * reason: if those two numbers are not equal to within the lines named, the
 * splice went wrong.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ACTIONS = 'src/lib/actions/registrations.js';
const CONTRACT = 'src/lib/audit/auditContract.js';
const CLIENT = 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx';
const SCHEMA = 'src/lib/schemas/register-public.js';

/**
 * Each break names the file, an exact FIND, its REPLACE, and — the part that
 * matters — WHICH assertions it is expected to redden. A break with no expected
 * set is not a control, it is a mutation.
 */
const BREAKS = {
  ungate: {
    file: ACTIONS,
    why: 'Remove the paid gate entirely — the exact state that shipped before round 8.',
    reddens: [
      'fs/attendeesCountPaidGate › updateRegistration raises the paid gate for attendeesCount and no other field',
      'fs/attendeesCountPaidGate › the gate is in the FILTER, and it does not replace the cancellation lock',
      'fs/publicStatusWriteGate › the paid gate reaches attendeesCount ONLY',
    ],
    find: '      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;\n      paidGuard = true;',
    replace: '      if (!isNaN(n) && n >= 1 && n <= 50) update.attendeesCount = n;',
  },

  'wide-gate': {
    file: ACTIONS,
    why: 'Gate EVERY field on paid — round 1 undone as a side effect. The direction a careless widening goes.',
    reddens: [
      'fs/publicStatusWriteGate › the paid gate reaches attendeesCount ONLY — every other field stays editable',
      'fs/attendeesCountPaidGate › the gate is in the FILTER, and it does not replace the cancellation lock',
    ],
    find: "  const blocked = paidGuard ? ['cancelled', 'paid'] : ['cancelled'];",
    replace: "  const blocked = ['cancelled', 'paid'];",
  },

  'dup-status': {
    file: ACTIONS,
    why: 'Write the paid rule as a SECOND `status:` key. An object literal keeps the last duplicate, so this silently DELETES the cancellation lock while reading like an addition.',
    reddens: [
      'fs/attendeesCountPaidGate › the gate is in the FILTER, and it does not replace the cancellation lock',
      'fs/publicStatusWriteGate › updateRegistration refuses a write to a cancelled record, in the FILTER',
      'fs/inhouseWriteGate › updateRegistration gates BOTH sources',
    ],
    find: '  const filter = { _id: id, status: { $nin: blocked } };',
    replace: "  const filter = { _id: id, status: { $ne: 'cancelled' }, status: { $ne: 'paid' } };",
  },

  'allow-decrease': {
    file: ACTIONS,
    why: 'Permit lowering the count on a paid record — the system quietly forgetting money it owes.',
    reddens: [
      'fs/attendeesCountPaidGate › a DECREASE is refused, and the refusal says why rather than failing silently',
    ],
    find: `  if (n < current) {
    return {
      ok: false,
      error: 'ลดจำนวนผู้เข้าอบรมหลังชำระเงินไม่ได้ เนื่องจากต้องมีการคืนเงิน '
           + 'กรุณายกเลิกรายการนี้แล้วลงทะเบียนใหม่',
    };
  }`,
    replace: '',
  },

  'no-roster-floor': {
    file: ACTIONS,
    why: 'Drop the roster floor, so the count can duck under round 8 item 3 through a door that lock does not watch.',
    reddens: [
      'fs/attendeesCountPaidGate › the floor is the ROSTER, so the count cannot duck under the seat lock',
    ],
    find: '  if (n < roster) {\n    return { ok: false, error: `มีรายชื่อผู้เข้าอบรมแล้ว ${roster} ท่าน จำนวนที่สมัครต้องไม่น้อยกว่านี้` };\n  }',
    replace: '',
  },

  recalc: {
    file: ACTIONS,
    why: 'Recalculate the money — the one thing this action was explicitly told not to learn to do.',
    reddens: [
      'fs/attendeesCountPaidGate › the action touches neither pricing nor payment',
    ],
    find: '    { $set: { attendeesCount: n } },',
    replace: "    { $set: { attendeesCount: n, 'pricing.seats': n, 'pricing.subtotal': n * 1000 } },",
  },

  race: {
    file: ACTIONS,
    why: 'Drop the optimistic-concurrency clause. Two admins raising the count at once both succeed, and the second audit row names a `before` that was never current.',
    reddens: [
      'fs/attendeesCountPaidGate › the write is conditional on BOTH the status and the count it read',
    ],
    find: "    { _id: id, status: 'paid', attendeesCount: current },",
    replace: "    { _id: id, status: 'paid' },",
  },

  'drop-diff': {
    file: ACTIONS,
    why: 'File the row without the two numbers — the act recorded, the only question anyone will ask unanswerable.',
    reddens: [
      'fs/attendeesCountPaidGate › the row carries the before and after counts, under its own action name',
    ],
    find: '    before:      { attendeesCount: current },\n    after:       { attendeesCount: n },',
    replace: '',
  },

  'unlist-key': {
    file: CONTRACT,
    why: 'Take the seat count off the audit allowlist. THE SILENT ONE: the writer REDUCES rather than rejects, so the action still files its row with before/after quietly emptied — correct-looking code, correct-looking history, no numbers.',
    reddens: [
      'fs/attendeesCountPaidGate › `attendeesCount` is on the audit allowlist, or the diff would be dropped',
      'pure/auditContract › the PII entities are capped below a full diff',
    ],
    find: "  'status', 'classId', 'classDate', 'scheduleType', 'attendanceMode',\n  'attendeesCount',",
    replace: "  'status', 'classId', 'classDate', 'scheduleType', 'attendanceMode',",
  },

  // ── the client half ──────────────────────────────────────────────────────

  'send-count': {
    file: CLIENT,
    why: 'Post attendeesCount on a paid record too. The server refuses on the KEY being present, so a plain name correction loses the whole save — each half correct alone.',
    reddens: [
      'fs/attendeesCountPaidGate › the attendee save OMITS attendeesCount on a paid record',
    ],
    find: `  const attendeePayload = countLockedByPayment
    ? { attendeesListProvided, attendees }
    : { attendeesListProvided, attendeesCount, attendees };`,
    replace: '  const attendeePayload = { attendeesListProvided, attendeesCount, attendees };',
  },

  'always-control': {
    file: CLIENT,
    why: 'Offer the paid-only control on every status. Every click on an unpaid record is then refused by the server.',
    reddens: [
      'render/seatCountPaidControl › a paid record offers the control; an unpaid one does not',
      'render/seatCountPaidControl › a CANCELLED record offers neither door, even though it is also paid',
    ],
    find: '              {countLockedByPayment && attendeeEdit.onEdit ? (',
    replace: '              {true ? (',
  },

  'charged-from-count': {
    file: CLIENT,
    why: 'Read the consent copy’s seat figure from attendeesCount instead of pricing.seats — it would tell the admin the money was for the number that is about to change.',
    reddens: [
      'render/seatCountPaidControl › the copy names the REAL charged seat count, read from pricing',
      'fs/attendeesCountPaidGate › the consent copy is a literal in the client, not assembled at runtime',
    ],
    find: '  const chargedSeats = doc.pricing?.seats ?? attendeesCount;',
    replace: '  const chargedSeats = attendeesCount;',
  },

  'prefill-draft': {
    file: CLIENT,
    why: 'Pre-fill the new-count field with the current count, making confirm default to a no-op the server refuses.',
    reddens: [
      'render/seatCountPaidControl › the draft starts EMPTY and the confirm button starts disabled',
    ],
    find: "  const [seatDraft,     setSeatDraft]     = useState('');",
    replace: '  const [seatDraft,     setSeatDraft]     = useState(String(doc.attendeesCount ?? 1));',
  },

  'live-count-input': {
    file: CLIENT,
    why: 'Render the count input on a paid record too — the save then carries the key and is refused wholesale.',
    reddens: [
      'fs/attendeesCountPaidGate › the count INPUT is absent on a paid record, not disabled',
    ],
    find: `                    <p className="flex h-9 items-center text-sm text-[var(--text-primary)]">
                      {attendeesCount} ท่าน
                    </p>`,
    replace: `                    <input type="number" min={1} max={50} value={attendeesCount}
                      onChange={(e) => setAttendeesCount(parseInt(e.target.value, 10) || 1)} />`,
  },

  // ── item 3: the seat lock ────────────────────────────────────────────────

  'client-unlock': {
    file: CLIENT,
    why: 'THE ONE THAT MATTERS: remove BOTH client guards, so nothing on screen stops an over-capacity roster. The SERVER assertions must stay green — that is what proves the button was never the enforcement.',
    reddens: [
      'render/registrationAttendeeTab › at capacity the + button is DISABLED and states why',
      'render/registrationAttendeeTab › an ALREADY-OVER roster disables it too',
      'fs/rosterSeatLock › both + buttons read the SAME seatsAvailable, derived once',
    ],
    staysGreen: [
      'fs/rosterSeatLock › the roster ceiling is enforced in updateRegistration, both cases — THE MEASUREMENT: the lock survives the UI being gone',
    ],
    find: '  const seatsAvailable = rosterHasRoom({ attendeesListProvided, attendeesCount, attendees });',
    replace: '  const seatsAvailable = true;',
  },

  'no-server-lock': {
    file: ACTIONS,
    why: 'Remove the server ceiling entirely, leaving only the disabled button. The mirror of client-unlock.',
    reddens: [
      'fs/rosterSeatLock › the roster ceiling is enforced in updateRegistration, both cases',
      'fs/rosterSeatLock › the refusal NAMES the seat lock rather than blaming cancellation',
    ],
    find: "      filter.$expr = { $gte: ['$attendeesCount', rosterLength] };",
    replace: '      void rosterLength;',
  },

  'dup-off': {
    file: ACTIONS,
    why: 'Accept a duplicate attendee. The rule is the only thing standing between a roster and the same person entered twice.',
    reddens: [
      'fs/rosterSeatLock › the duplicate rule is imported, not re-implemented in the action',
    ],
    find: '      const dup = firstDuplicateAttendee(update.attendees);',
    replace: '      const dup = -1;',
  },

  'require-four': {
    file: ACTIONS,
    why: 'Put email and phone back on the admin path — the tightening direction of the asymmetry.',
    reddens: [
      'fs/rosterSeatLock › the ADMIN path requires only ชื่อ and นามสกุล',
    ],
    find: '        if (!a.firstName?.trim() || !a.lastName?.trim()) {',
    replace: '        if (!a.firstName?.trim() || !a.lastName?.trim() || !a.email?.trim() || !a.phone?.trim()) {',
  },

  'loosen-wizard': {
    file: SCHEMA,
    why: 'Loosen the CUSTOMER wizard to two fields — the other direction, and the one a reader "tidying the inconsistency" would reach for. It changes what the public form accepts.',
    reddens: [
      'fs/rosterSeatLock › the WIZARD’s zod is UNCHANGED and still demands all four',
    ],
    find: `  email:     z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:     z.string().trim().regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
});`,
    replace: `  email:     z.string().optional(),
  phone:     z.string().optional(),
});`,
  },

  'flatten-over': {
    file: 'src/lib/registrations/attendeeInfo.js',
    why: 'Revert the roster derivation to `named >= count`, so an over-capacity roster reports `complete` again — exactly the state that hid one production record for three rounds.',
    reddens: [
      'pure/attendeeInfo › MORE named rows than declared is `over`',
      'pure/attendeeInfo › the production shape reproduces: 2 named against a count of 1',
      'render/registrationAttendeeTab › an ALREADY-OVER roster shows M > N, and shows it as wrong',
      'render/registrationDetailShell › all three roster branches still render',
    ],
    find: `  if (named > count) return { state: 'over', named, count };
  return { state: named === count ? 'complete' : 'incomplete', named, count };`,
    replace: "  return { state: named >= count ? 'complete' : 'incomplete', named, count };",
  },

  'wrong-door': {
    file: ACTIONS,
    why: 'Let an UNPAID record through the paid action, so it files a `seats` row whose title claims a money implication that does not exist.',
    reddens: [
      'fs/attendeesCountPaidGate › updateAttendeesCountPaid is admin-guarded and refuses every wrong state',
    ],
    find: "  if (doc.status !== 'paid') {",
    replace: "  if (false) {",
  },
};

// ── Apply / revert ──────────────────────────────────────────────────────────

const BACKUP_SUFFIX = '.control-backup';
const STATE = path.join(ROOT, 'scripts', '.control-round8.state');

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
  console.log('Round 8 controls:\n');
  for (const [key, brk] of Object.entries(BREAKS)) {
    console.log(`  ${key}`);
    console.log(`      ${brk.why}`);
    for (const r of brk.reddens) console.log(`      red: ${r}`);
    console.log('');
  }
  process.exit(0);
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

if (cmd !== 'apply' || !BREAKS[name]) {
  console.error(`unknown break "${name ?? ''}" — run \`list\``);
  process.exit(2);
}
if (existsSync(STATE)) {
  console.error('a control is already applied — revert it before applying another');
  process.exit(2);
}

const brk = BREAKS[name];
const before = read(brk.file);
const after = spliceOnce(before, brk.find, brk.replace, name);

writeFileSync(path.join(ROOT, brk.file + BACKUP_SUFFIX), before, 'utf8');
write(brk.file, after);
writeFileSync(STATE, brk.file, 'utf8');

console.log(`APPLIED: ${name}\n${brk.why}`);
showDiff(brk.file, before, after);
console.log('\nEXPECTED RED:');
for (const r of brk.reddens) console.log(`  ${r}`);
console.log('\nnow: node test/run.mjs   then: node scripts/_control-round8.mjs revert');
