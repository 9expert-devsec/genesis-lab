import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { ROUND_AND_STATUS_KEYS } from '@/lib/audit/auditContract';
import { PUBLIC_ACTION_TITLES } from '@/lib/audit/registrationHistory';

/**
 * THE SEAT COUNT AFTER PAYMENT: THERE IS NO DOOR.
 *
 * ══ WHAT WAS ACTUALLY WRONG, MEASURED BEFORE ROUND 8 ════════════════════════
 *
 * `attendeesCount` had NO STATUS GATE AT ALL. `updateRegistration`'s public
 * branch read the number, range-checked it 1..50 and set it, on any status
 * including `paid` — and `paid` is the state where that number has already
 * driven a charge. The audit trail recorded `update`, which on this screen means
 * "somebody edited this registration" and nothing more.
 *
 * THAT HOLE IS CLOSED AND STAYS CLOSED. Everything in section 1 below is round
 * 8's work, unchanged and still asserted.
 *
 * ══ WHAT REVERSED, AND IT IS A TIGHTENING ══════════════════════════════════
 *
 * Round 8 also built a SANCTIONED SECOND DOOR: `updateAttendeesCountPaid`, an
 * action behind a ขอเพิ่มจำนวนผู้เข้าอบรม panel that raised the count on a paid
 * record — increase-only, with consent copy naming both numbers and an audit row
 * carrying a before/after diff. The rules were:
 *
 *   unpaid     → editable through `updateRegistration`, an ordinary field
 *   paid       → refused there; `updateAttendeesCountPaid` is the only door
 *   cancelled  → refused everywhere, round 1's rule
 *
 * The middle line is now:
 *
 *   paid       → REFUSED, AND THERE IS NO OTHER DOOR
 *
 * The action, its panel, its copy, its increase-only logic and its audit writer
 * are all removed. A paid record's count cannot be changed by any path, in
 * either direction.
 *
 * ── WHY, BECAUSE A DELETED CAPABILITY LOOKS LIKE AN UNFINISHED ONE ────────
 * Raising the count on a paid registration is not something this team does in
 * this system. When a customer asks for more seats after paying, the whole thing
 * is handled outside; the system only records that the contact happened. So the
 * action was built for a workflow that does not run here, and it carried real
 * cost — a receipt whose headcount disagrees with its own total, a rule about
 * which document reads which field, and a standing path for the record to drift
 * from what Omise recorded.
 *
 * IT IS NOT A GAP WAITING TO BE FILLED. Section 5 asserts the door is gone, by
 * name, so re-adding it goes red and this note gets read first.
 *
 * ══ WHY THIS TIER ═══════════════════════════════════════════════════════════
 *
 * There is no database in the pure/fs/render tiers, so a server action's
 * BEHAVIOUR is asserted against its source — the same idiom
 * publicStatusWriteGate and inhouseWriteGate already use for the cancellation
 * lock. That is a real limit and it is stated rather than papered over: what is
 * pinned here is that the gate is written, that it is written in the FILTER
 * rather than as a read-then-write, and that the refusals exist and are
 * distinct. Whether Mongo honours a `$nin` is not this suite's question.
 *
 * The absence claims in section 5 are the shape this tier proves BEST — they are
 * claims about a whole file rather than about one execution.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');

/** One exported action's body, bounded at the next export. */
function actionBody(name) {
  const start = ACTIONS.code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = ACTIONS.code.slice(start + 1);
  const next = rest.indexOf('export async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

const UPDATE = actionBody('updateRegistration');

// ════════════════════════════════════════════════════════════════════════════
// 1. THE ORDINARY PATH REFUSES A PAID RECORD — AND ONLY FOR THIS FIELD
//    Round 8's work. Unchanged, and it now carries the whole rule rather than
//    half of it.
// ════════════════════════════════════════════════════════════════════════════

test('updateRegistration raises the paid gate for attendeesCount and no other field', () => {
  /**
   * The narrowness IS the claim. Round 1 ruled that money arriving freezes the
   * STATUS and nothing else — attendee names, the coordinator, the billing
   * address and the notes are exactly what needs correcting after a charge. A
   * gate that caught more than one field would undo that ruling as a side
   * effect of this one.
   *
   * This matters MORE now than when it was written. With the second door gone,
   * this gate is the only thing standing between a paid record and its count —
   * so a reader tempted to widen it has no compensating path to point at.
   */
  assert.equal((UPDATE.match(/paidGuard = true/g) ?? []).length, 1,
    'more than one field raises the paid gate');

  const at = UPDATE.indexOf('paidGuard = true');
  const branch = UPDATE.slice(0, at).lastIndexOf('if (data.');
  assert.notEqual(branch, -1, 'the gate is not inside a field branch');
  assert.match(UPDATE.slice(branch), /^if \(data\.attendeesCount !== undefined\)/,
    'a field other than attendeesCount raises the paid gate');
});

test('the gate is in the FILTER, and it does not replace the cancellation lock', () => {
  /**
   * ── THE BUG THIS SHAPE AVOIDS, STATED BECAUSE IT IS ONE LINE AWAY ─────────
   * An object literal keeps the LAST duplicate key. Writing the paid rule as a
   * second `status:` entry beside the existing one would have DELETED the
   * cancellation lock while reading like an addition, and every cancelled-record
   * test would have gone red for a reason nobody would connect to this change.
   * One `status` key, one list, built once.
   */
  assert.match(UPDATE, /const blocked = paidGuard \? \['cancelled', 'paid'\] : \['cancelled'\]/,
    'the blocked list is not the conditional pair');
  assert.match(UPDATE, /const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$nin:\s*blocked\s*\}\s*\}/,
    'the gate is not part of the query filter');
  assert.match(UPDATE, /findOneAndUpdate\(filter,/, 'the filter is not the one the update uses');
  assert.equal((UPDATE.match(/status:\s*\{/g) ?? []).length, 1,
    'there is more than one status clause in the filter — one of them is dead');
});

test('the three refusals are distinguishable, so the admin is told which rule fired', () => {
  // A single "cannot edit" message across three different causes is the failure
  // this file's siblings already record for not-found vs cancelled.
  assert.ok(UPDATE.includes('ไม่พบรายการ'), 'the not-found message is gone');
  assert.ok(UPDATE.includes('ใบสมัครนี้ถูกยกเลิกแล้ว'), 'the cancellation message is gone');
  assert.ok(UPDATE.includes('รายการนี้ชำระเงินแล้ว จึงเปลี่ยนจำนวนผู้เข้าอบรมไม่ได้'),
    'the paid refusal does not state the lock');
  assert.match(UPDATE, /paidGuard && existing\.status === 'paid'/,
    'the paid refusal is not conditioned on the gate AND the stored status');
});

/**
 * ══ THE REFUSAL STOPS AT "NO". BOTH HALVES OF THAT ARE DELIBERATE. ══════════
 *
 * This test did not exist in round 8 — it could not have, because the message
 * then ENDED by naming the panel. It is the reversal's assertion.
 */
test('the paid refusal names no control and routes the admin nowhere', () => {
  /**
   * ── HALF ONE: NO CONTROL, BECAUSE THERE IS NONE ─────────────────────────
   * The message used to end `กรุณาใช้ "ขอเพิ่มจำนวนผู้เข้าอบรม"`. Left in
   * place it would be the worst kind of stale copy — it reads as a working
   * instruction and sends an admin hunting for a control that does not exist.
   */
  assert.equal(UPDATE.includes('ขอเพิ่มจำนวนผู้เข้าอบรม'), false,
    'the paid refusal still names the removed control');
  assert.equal(UPDATE.includes('จากหน้าแก้ไขปกติ'), false,
    'the refusal still qualifies itself by WHICH page — that implies another page exists');

  /**
   * ── HALF TWO: NOT "CANCEL AND RE-REGISTER" EITHER ───────────────────────
   * The removed action's own decrease refusal said exactly that, and it should
   * not have. NOBODY HAS ESTABLISHED WHAT CANCELLING A PAID REGISTRATION DOES
   * TO RECONCILIATION, so this system must not route anyone down it. Offering a
   * next step we have not thought through is worse than offering none: it turns
   * an admin's question into an action, and the question is the correct outcome.
   *
   * Asserted across the WHOLE FILE rather than the one action, because the
   * sentence is equally wrong wherever it reappears.
   */
  assert.equal(ACTIONS.code.includes('ยกเลิกรายการนี้แล้วลงทะเบียนใหม่'), false,
    'a refusal routes the admin to cancel-and-re-register — the reconciliation '
    + 'consequences of cancelling a PAID registration have never been established');
});

test('CONTROL: the filter probe rejects a read-then-write and a duplicate status key', () => {
  const readThenWrite = "const filter = { _id: id };";
  assert.equal(/const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$nin:\s*blocked\s*\}\s*\}/.test(readThenWrite),
    false, 'the probe accepts an ungated filter');

  // The duplicate-key mistake, as it would actually be written.
  const duplicated = "const filter = { _id: id, status: { $ne: 'cancelled' }, status: { $ne: 'paid' } };";
  assert.equal((duplicated.match(/status:\s*\{/g) ?? []).length, 2,
    'the counter cannot see two status clauses');
  assert.equal((UPDATE.match(/status:\s*\{/g) ?? []).length, 1);
});

test('CONTROL: the absence probes can fire — they are not satisfied by an empty read', () => {
  /**
   * Four `includes(...) === false` assertions in a row is the shape that passes
   * on an empty string. The body is real, and the probes DO see these strings
   * when they are present.
   */
  // 12k, not 20k: `code` is comment-stripped and the removal took ~4k out of
  // this file. A floor set against the PRE-removal size is a floor that goes red
  // for the change it was meant to survive.
  assert.ok(ACTIONS.code.length > 12000,
    `registrations.js parsed to ${ACTIONS.code.length} chars — too short to be real`);
  assert.ok(UPDATE.length > 1500, `updateRegistration parsed to ${UPDATE.length} chars`);

  const guilty = 'error: "… กรุณาใช้ \\"ขอเพิ่มจำนวนผู้เข้าอบรม\\" หรือยกเลิกรายการนี้แล้วลงทะเบียนใหม่"';
  assert.ok(guilty.includes('ขอเพิ่มจำนวนผู้เข้าอบรม'), 'the control-name probe is blind');
  assert.ok(guilty.includes('ยกเลิกรายการนี้แล้วลงทะเบียนใหม่'), 'the cancel-path probe is blind');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE AUDIT SIDE: THE WRITER IS RETIRED, THE READER IS NOT
//    The asymmetry is the whole content of this section.
// ════════════════════════════════════════════════════════════════════════════

test('`attendeesCount` is OFF the audit diff allowlist, because nothing hands it over', () => {
  /**
   * ── THE DIRECTION THIS ASSERTION POINTS HAS FLIPPED ──────────────────────
   * Round 8 asserted `includes('attendeesCount')` and gave the reason: the
   * writer REDUCES a payload to the allowlist rather than rejecting it, so an
   * action handing over an unlisted key still writes its row with `before`/
   * `after` quietly emptied. That reasoning was right and the key belonged.
   *
   * `updateAttendeesCountPaid` was the ONLY action that ever handed
   * `attendeesCount` to the reduction. With it gone the key is dead, and a dead
   * entry on a SAFETY ALLOWLIST is not harmless — the list's whole value is
   * that it says exactly what may reach an append-only trail, and a key nothing
   * writes invites the next reader to assume something still does.
   *
   * REMOVING IT CANNOT TOUCH THE ROWS ALREADY FILED. The reduction runs at
   * WRITE time in `recordAdminAction`; nothing re-filters a stored row on read.
   */
  assert.equal(ROUND_AND_STATUS_KEYS.includes('attendeesCount'), false,
    'the seat count is still on the diff allowlist with no action left to write it');

  // And removing it did not disturb the four round fields and the status enum
  // that the allowlist exists for.
  for (const live of ['status', 'classId', 'classDate', 'scheduleType', 'attendanceMode']) {
    assert.ok(ROUND_AND_STATUS_KEYS.includes(live),
      `${live} fell off the allowlist — updateRegistrationRound's diff would be emptied in silence`);
  }
  // And the allowlist has not been opened up to something that IS personal data
  // on the way past.
  for (const personal of ['coordinator', 'attendees', 'invoice', 'taxId', 'email', 'phone']) {
    assert.equal(ROUND_AND_STATUS_KEYS.includes(personal), false,
      `${personal} reached the audit allowlist — the PII cap is the reason it exists`);
  }
});

test('the `seats` TITLE stays, because the rows it titles are still in the trail', () => {
  /**
   * ══ RETIRING A WRITER DOES NOT RETIRE ITS ROWS ═════════════════════════════
   *
   * This is the one place the removal cannot be literal, and it is worth the
   * paragraph. `updateAttendeesCountPaid` filed real `seats` rows against real
   * paid registrations. THE TRAIL IS APPEND-ONLY. Those rows are still there and
   * will render for as long as the record exists.
   *
   * `auditRowTitle` falls through to the RAW ACTION VALUE for an action it has
   * not been taught — a deliberate choice, so an untitled action is visible
   * rather than hidden behind "อื่น ๆ". Deleting this entry would therefore not
   * delete anything; it would print the bare English token `seats` in a Thai
   * history feed, on paid registrations, forever.
   *
   * So the writer list shrinks and the reader list does not. Anyone doing the
   * next removal of this shape should look for the same asymmetry before
   * deleting a title.
   */
  assert.ok(PUBLIC_ACTION_TITLES.seats, 'the `seats` title is gone — historical rows now render a raw enum');
  assert.match(PUBLIC_ACTION_TITLES.seats, /ชำระเงิน/,
    'the title no longer says these rows are post-payment changes');
});

test('no action writes a `seats` row any more', () => {
  // The other half of the asymmetry, and the half that would rot silently: a
  // title with no writer is correct here ONLY while it stays that way. If a new
  // action starts filing `seats`, the retirement note above becomes a lie.
  assert.equal(/action:\s*'seats'/.test(ACTIONS.code), false,
    'something files a `seats` audit row again — the title is no longer retired');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE CLIENT SIDE THE RENDER TIER CANNOT REACH
// ════════════════════════════════════════════════════════════════════════════

const CLIENT = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');

test('the attendee save OMITS attendeesCount on a paid record', () => {
  /**
   * ══ THE INTERACTION BUG THIS PINS, WHICH NEITHER SIDE SHOWS ALONE ══════════
   *
   * UNCHANGED BY THE REVERSAL, and deliberately so — this is not part of the
   * door that was removed, it is what stops the CLOSED door refusing saves it
   * was never meant to refuse.
   *
   * The server raises its paid gate on the PRESENCE of the key —
   * `data.attendeesCount !== undefined` — not on whether the value changed. It
   * has to: a rule that let an unchanged value through would be bypassable by
   * echoing the stored number back.
   *
   * The attendee card used to post `{ attendeesListProvided, attendeesCount,
   * attendees }` unconditionally. Put those two facts together and an admin
   * fixing a misspelt attendee NAME on a paid registration gets the whole save
   * refused — losing their edits to a field they never opened. Each half is
   * correct alone, which is why this needed the two read together rather than a
   * test on either.
   *
   * So the CLIENT is the side that drops the key. It matters MORE after the
   * reversal, not less: the paid gate is now permanent, so this is permanently
   * the thing keeping an ordinary attendee edit working on a paid record.
   */
  assert.match(CLIENT.code, /const attendeePayload = countLockedByPayment/,
    'the attendee payload is no longer conditional on the paid state');
  assert.match(CLIENT.code, /\?\s*\{ attendeesListProvided, attendees \}/,
    'the paid payload still carries attendeesCount — the whole save will be refused');
  assert.match(CLIENT.code, /:\s*\{ attendeesListProvided, attendeesCount, attendees \}/,
    'the unpaid payload no longer sends the count — it would become uneditable');
  assert.match(CLIENT.code, /save\(attendeePayload, 'save-attendees'\)/,
    'the card does not use the conditional payload');
});

test('the count INPUT is absent on a paid record, not disabled', () => {
  /**
   * Behind `editSection`, so the render tier cannot see it — pinned here, and
   * render/seatCountPaidControl says so at its head rather than leaving a reader
   * to conclude the claim is missing.
   *
   * ABSENT rather than disabled, for the reason `SectionCard` gives about a
   * greyed-out แก้ไข: a disabled control invites the click and then explains
   * nothing. And a LIVE one would be worse than useless here — see the payload
   * test above.
   */
  assert.match(CLIENT.code, /countLockedByPayment \? \(/,
    'the edit form does not branch on the paid state at all');
  // The number input still exists for the unpaid branch...
  assert.match(CLIENT.code, /<input type="number" min=\{1\} max=\{50\} value=\{attendeesCount\}/,
    'the unpaid count input is gone — the field became uneditable in every state');
  // ...and exactly one of them, so the paid branch did not simply copy it.
  assert.equal((CLIENT.code.match(/value=\{attendeesCount\}/g) ?? []).length, 1,
    'the paid branch renders a second bound count input');
});

test('the paid branch states the lock and offers no onward route', () => {
  // It read `ชำระเงินแล้ว — เปลี่ยนได้ที่ "ขอเพิ่มจำนวนผู้เข้าอบรม"` and pointed
  // at a panel underneath. Same two rules as the server refusal: name no control,
  // and do not send anyone to cancel-and-re-register.
  assert.ok(CLIENT.code.includes('ชำระเงินแล้ว — เปลี่ยนจำนวนผู้เข้าอบรมไม่ได้'),
    'the paid branch no longer states why the count is fixed');
  assert.equal(CLIENT.code.includes('เปลี่ยนได้ที่'), false,
    'the paid branch still points somewhere for the change');
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE DOOR IS GONE. THIS SECTION IS THE REVERSAL.
//    Absence claims over whole files — the shape this tier proves best.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Every trace of the removed path, by name, at the site that carried it.
 *
 * BY NAME AND NOT BY BEHAVIOUR, because there is no behaviour left to test. The
 * hazard a deletion leaves behind is that it comes back — piecemeal, by someone
 * who finds half of it still referenced and completes the pattern — so what is
 * asserted is that each half is absent from the file that held it.
 */
const REMOVED = [
  {
    what: 'the server action',
    rel: 'src/lib/actions/registrations.js',
    tokens: ['updateAttendeesCountPaid', 'ขอเพิ่มจำนวนผู้เข้าอบรม', "action: 'seats'"],
  },
  {
    what: 'the client panel, its handler and its state',
    rel: 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx',
    tokens: [
      'updateAttendeesCountPaid', 'handleSeatChange', 'seatPanelOpen', 'seatDraft',
      'ขอเพิ่มจำนวนผู้เข้าอบรม', 'ยืนยันเพิ่มจำนวน', 'chargedSeats',
    ],
  },
  {
    what: 'the consent copy, which was the control',
    rel: 'src/app/admin/registrations/_components/RegistrationDetailClient.jsx',
    tokens: [
      'ไม่คำนวณยอดเงินใหม่', 'ไม่เรียกเก็บเพิ่ม', 'ไม่คืนเงินโดยอัตโนมัติ',
      'จะไม่ตรงกันจนกว่าจะออกเอกสารใหม่นอกระบบ',
      'บันทึกในประวัติการดำเนินการ พร้อมจำนวนก่อนและหลัง',
    ],
  },
  {
    what: 'the action stub, which would hide a live import',
    rel: 'test/stub-registration-actions.mjs',
    tokens: ['updateAttendeesCountPaid'],
  },
];

for (const { what, rel, tokens } of REMOVED) {
  test(`the door is gone: ${what}`, () => {
    const { code } = readSource(rel);
    assert.ok(code.length > 500, `${rel} parsed to ${code.length} chars — the probe is reading nothing`);
    for (const token of tokens) {
      assert.equal(code.includes(token), false,
        `${rel} still carries \`${token}\`. The post-payment seat-count path was removed `
        + 'deliberately — read the header of this file before putting any of it back.');
    }
  });
}

test('CONTROL: the door-is-gone probes are not vacuous', () => {
  /**
   * Fifteen absences across three files is exactly the shape that passes on a
   * misread path. Two guards: each file was measured non-empty at its own test,
   * and the token matcher demonstrably fires on text that DOES contain them.
   */
  const guilty = "import { updateAttendeesCountPaid } from '@/lib/actions/registrations';"
    + " const [seatDraft, setSeatDraft] = useState(''); // ขอเพิ่มจำนวนผู้เข้าอบรม";
  for (const token of ['updateAttendeesCountPaid', 'seatDraft', 'ขอเพิ่มจำนวนผู้เข้าอบรม']) {
    assert.ok(guilty.includes(token), `the probe cannot see \`${token}\` even when it is there`);
  }

  // And the real client is the file that used to hold all of it, so its absence
  // means something rather than being a path typo.
  const client = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
  assert.ok(client.code.includes('countLockedByPayment'),
    'the client no longer knows about the paid lock at all — the path is probably wrong');
});

test('CONTROL: the allowlist and titles assertions are not vacuous', () => {
  // `includes` on an empty or enormous array would satisfy the positive half and
  // the negative half respectively.
  assert.ok(ROUND_AND_STATUS_KEYS.length >= 5, 'the allowlist parsed to almost nothing');
  assert.ok(ROUND_AND_STATUS_KEYS.length <= 8,
    'the allowlist has grown past the reviewed set — every entry needs its own argument');
  assert.equal(PUBLIC_ACTION_TITLES.notAnAction, undefined, 'the titles map answers for anything');
});
