import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';
import { ROUND_AND_STATUS_KEYS } from '@/lib/audit/auditContract';
import { PUBLIC_ACTION_TITLES } from '@/lib/audit/registrationHistory';

/**
 * THE SEAT COUNT, AND THE THREE STATES IT MAY CHANGE IN.
 *
 * ══ WHAT WAS ACTUALLY WRONG, MEASURED BEFORE THE FIX ════════════════════════
 *
 * `attendeesCount` had NO STATUS GATE AT ALL. `updateRegistration`'s public
 * branch read the number, range-checked it 1..50 and set it, on any status
 * including `paid` — and `paid` is the state where that number has already
 * driven a charge. The audit trail recorded `update`, which on this screen means
 * "somebody edited this registration" and nothing more.
 *
 * So round 8 is CLOSING AN OPEN HOLE. The three rules are:
 *
 *   unpaid     → editable through `updateRegistration`, an ordinary field
 *   paid       → refused there; `updateAttendeesCountPaid` is the only door
 *   cancelled  → refused everywhere, round 1's rule, unchanged
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
 * The one thing this tier CAN prove better than a live test is the negative —
 * that the action does not touch `pricing` or `payment` — because that is a
 * claim about the whole body rather than about one execution.
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
const PAID   = actionBody('updateAttendeesCountPaid');

// ════════════════════════════════════════════════════════════════════════════
// 1. THE ORDINARY PATH REFUSES A PAID RECORD — AND ONLY FOR THIS FIELD
// ════════════════════════════════════════════════════════════════════════════

test('updateRegistration raises the paid gate for attendeesCount and no other field', () => {
  /**
   * The narrowness IS the claim. Round 1 ruled that money arriving freezes the
   * STATUS and nothing else — attendee names, the coordinator, the billing
   * address and the notes are exactly what needs correcting after a charge. A
   * gate that caught more than one field would undo that ruling as a side
   * effect of this one.
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
  assert.ok(UPDATE.includes('ขอเพิ่มจำนวนผู้เข้าอบรม'),
    'the paid refusal does not name the control the admin should use instead');
  assert.match(UPDATE, /paidGuard && existing\.status === 'paid'/,
    'the paid refusal is not conditioned on the gate AND the stored status');
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

// ════════════════════════════════════════════════════════════════════════════
// 2. THE DELIBERATE PATH
// ════════════════════════════════════════════════════════════════════════════

test('updateAttendeesCountPaid is admin-guarded and refuses every wrong state', () => {
  assert.match(PAID, /requireAdmin\('registrations'\)/, 'the action is not permission-guarded');

  // Cancelled — round 1's rule reaches this door too. Asserted because a NEW
  // write path is exactly where a lock gets forgotten.
  assert.match(PAID, /doc\.status === 'cancelled'/, 'a cancelled record is not refused');
  // Not paid — the wrong door. It matters because this action files a history
  // row whose title claims a money implication.
  assert.match(PAID, /doc\.status !== 'paid'/, 'an unpaid record is not sent back to the ordinary path');
  assert.ok(PAID.includes('กรุณาแก้ไขจำนวนผู้เข้าอบรมจากหน้าแก้ไขปกติ'),
    'the unpaid refusal does not say where to go instead');
});

test('a DECREASE is refused, and the refusal says why rather than failing silently', () => {
  /**
   * The control is `ขอเพิ่มจำนวนผู้เข้าอบรม` and the action matches it. A lower
   * number on a paid registration means the customer paid for seats they are not
   * taking — a refund this action cannot issue, cannot record as owed, and has
   * nowhere to put. Writing it would make the system quietly forget money.
   */
  assert.match(PAID, /if \(n < current\)/, 'a decrease is not detected');
  assert.ok(PAID.includes('ต้องมีการคืนเงิน'), 'the decrease refusal does not name the reason');
  assert.ok(PAID.includes('กรุณายกเลิกรายการนี้แล้วลงทะเบียนใหม่'),
    'the decrease refusal offers no path at all — a dead end reads as a bug');
  assert.match(PAID, /if \(n === current\)/, 'a no-op change is not refused');
});

test('the floor is the ROSTER, so the count cannot duck under the seat lock', () => {
  // Round 8's other rule is that the roster may never exceed the count. Lowering
  // the count below the people already listed would create an over-capacity
  // record through a door the roster guard does not watch.
  assert.match(PAID, /const roster = Array\.isArray\(doc\.attendees\)/,
    'the roster length is not read');
  assert.match(PAID, /if \(n < roster\)/, 'the roster floor is not enforced');
});

test('the write is conditional on BOTH the status and the count it read', () => {
  /**
   * Two races, two clauses:
   *   · `status: 'paid'` — a cancel landing between the read and the write must
   *     not be overwritten, the same reasoning as every other action here.
   *   · `attendeesCount: current` — optimistic concurrency. Two admins raising
   *     the count at once must not both succeed against the same `before`, or
   *     the second audit row would name a number that was never current. That is
   *     the trail lying, which is worse than the write failing.
   */
  assert.match(PAID, /\{ _id: id, status: 'paid', attendeesCount: current \}/,
    'the update is not conditional on the state it read');
  assert.match(PAID, /findOneAndUpdate\(/, 'the write is not a conditional update');
  assert.ok(PAID.includes('ถูกแก้ไขโดยผู้ใช้อื่น'),
    'a lost race is not reported as a conflict — it would look like a silent no-op');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. NO BILLING. THIS IS THE NEGATIVE THE SOURCE TIER PROVES BEST
// ════════════════════════════════════════════════════════════════════════════

test('the action touches neither pricing nor payment', () => {
  /**
   * `pricing` is a snapshot of what was actually charged and rewriting it would
   * destroy the only record of that. The requirement was explicitly NOT to build
   * billing; this is that requirement as an assertion rather than as a promise
   * in a docstring.
   *
   * A claim about the whole body, which is why the source tier is the right
   * place for it — an execution test would only prove the paths it happened to
   * take.
   */
  for (const forbidden of ['pricing', 'payment', 'vatAmount', 'subtotal', 'pricePerSeat', 'total']) {
    assert.equal(PAID.includes(forbidden), false,
      `updateAttendeesCountPaid references \`${forbidden}\` — it must not recalculate money`);
  }
  // It writes exactly one field.
  assert.match(PAID, /\$set: \{ attendeesCount: n \}/, 'the write is not a single-field $set');
  assert.equal((PAID.match(/\$set:/g) ?? []).length, 1, 'more than one $set in the action');
});

test('CONTROL: the forbidden-token probe would fire on a body that did recalculate', () => {
  // Six absences in a row is the shape that passes on an empty string.
  const guilty = "update.pricing = { subtotal: n * pricePerSeat, vatAmount: v, total: t };";
  const hits = ['pricing', 'subtotal', 'vatAmount', 'pricePerSeat', 'total']
    .filter((f) => guilty.includes(f));
  assert.equal(hits.length, 5, 'the probe cannot see a recalculation even when one is there');
  // …and the real body is long enough that the absences mean something.
  assert.ok(PAID.length > 1500, `the action body parsed to ${PAID.length} chars — too short to be real`);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. THE AUDIT ROW — THE SECOND EXCEPTION TO THE NO-DIFF RULE
// ════════════════════════════════════════════════════════════════════════════

test('the row carries the before and after counts, under its own action name', () => {
  assert.match(PAID, /action:\s*'seats'/, "the row is not filed under its own action");
  assert.match(PAID, /before:\s*\{ attendeesCount: current \}/, 'the row carries no before count');
  assert.match(PAID, /after:\s*\{ attendeesCount: n \}/, 'the row carries no after count');
  assert.match(PAID, /entity:\s*'public'/, 'the row is not filed against the public entity');
});

test('`attendeesCount` is on the audit allowlist, or the diff would be dropped', () => {
  /**
   * THE HALF THAT WOULD FAIL SILENTLY. The writer REDUCES a payload to the
   * pair's allowlist rather than rejecting it, so an action handing over a key
   * the contract does not permit still writes its row — with `before`/`after`
   * quietly emptied. The action above would look correct, the history feed would
   * show the event, and the two numbers would be gone.
   */
  assert.ok(ROUND_AND_STATUS_KEYS.includes('attendeesCount'),
    'the seat count is not on the allowlist — the diff would be reduced away in silence');
  // And the allowlist has not been opened up to something that IS personal data
  // on the way past.
  for (const personal of ['coordinator', 'attendees', 'invoice', 'taxId', 'email', 'phone']) {
    assert.equal(ROUND_AND_STATUS_KEYS.includes(personal), false,
      `${personal} reached the audit allowlist — the PII cap is the reason it exists`);
  }
});

test('the history feed has a title for it, so the row does not render a raw enum', () => {
  // Caught by the vocabulary test in render/registrationHistoryFeed too; asserted
  // here as well because the action and its title are one change and a reader
  // adding a second such action should see both requirements together.
  assert.ok(PUBLIC_ACTION_TITLES.seats, 'the `seats` action has no Thai title');
  assert.match(PUBLIC_ACTION_TITLES.seats, /ชำระเงิน/,
    'the title does not distinguish a post-payment change from an ordinary correction');
});

// ════════════════════════════════════════════════════════════════════════════
// 5. THE CLIENT SIDE THE RENDER TIER CANNOT REACH
// ════════════════════════════════════════════════════════════════════════════

const CLIENT = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');

test('the attendee save OMITS attendeesCount on a paid record', () => {
  /**
   * ══ THE INTERACTION BUG THIS PINS, WHICH NEITHER SIDE SHOWS ALONE ══════════
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
   * So the CLIENT is the side that drops the key.
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

test('the consent copy is a literal in the client, not assembled at runtime', () => {
  // The wording is the feature. A template built from fragments would be
  // unreadable in review and unassertable at source, and the render tier only
  // sees whatever the fixture happened to produce.
  for (const clause of [
    'ไม่คำนวณยอดเงินใหม่',
    'ไม่เรียกเก็บเพิ่ม',
    'ไม่คืนเงินโดยอัตโนมัติ',
    'จะไม่ตรงกันจนกว่าจะออกเอกสารใหม่นอกระบบ',
    'บันทึกในประวัติการดำเนินการ พร้อมจำนวนก่อนและหลัง',
  ]) {
    assert.ok(CLIENT.code.includes(clause), `the consent copy lost the clause "${clause}"`);
  }
  // And it reads the CHARGED seats rather than the count about to change.
  assert.match(CLIENT.code, /const chargedSeats = doc\.pricing\?\.seats \?\? attendeesCount/,
    'the charged-seat figure is not derived from pricing');
});

test('the client enforces nothing — the refusals are all the server’s', () => {
  /**
   * The handler reports whatever comes back and re-implements no rule. A client
   * that duplicated "no decrease" or "not below the roster" would be a second
   * place for those rules to live and a second place to fall behind — and the
   * server is the only one that counts, since every `'use server'` export is a
   * POST endpoint.
   */
  const start = CLIENT.code.indexOf('const handleSeatChange');
  assert.notEqual(start, -1, 'the seat-change handler is gone');
  const body = CLIENT.code.slice(start, CLIENT.code.indexOf('const cancelEdit', start));
  assert.ok(body.length > 200, 'the handler body did not parse');
  assert.match(body, /updateAttendeesCountPaid\(doc\._id, next\)/, 'the handler does not call the action');
  for (const rule of ['roster', 'pricing', "'paid'", 'current']) {
    assert.equal(body.includes(rule), false,
      `the client re-implements the server rule "${rule}" — two places for one rule`);
  }
});

test('CONTROL: the allowlist assertion is not vacuous — the list is real and bounded', () => {
  // `includes` on an empty or enormous array would satisfy the positive half and
  // the negative half respectively.
  assert.ok(ROUND_AND_STATUS_KEYS.length >= 5, 'the allowlist parsed to almost nothing');
  assert.ok(ROUND_AND_STATUS_KEYS.length <= 8,
    'the allowlist has grown past the reviewed set — every entry needs its own argument');
  assert.equal(PUBLIC_ACTION_TITLES.notAnAction, undefined, 'the titles map answers for anything');
});
