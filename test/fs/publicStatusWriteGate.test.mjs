import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE WRITE GATE IS AGAINST THE STORED STATUS — not against what the client
 * sent, and not against which buttons the client chose to render.
 *
 * ── THE DEFECT THIS GUARDS ──────────────────────────────────────────────────
 * `updateRegistrationStatus` validated only that the TARGET was a member of the
 * public status set. It never looked at the CURRENT state. Every rule about
 * which moves are legal — no admin edge into `paid`, no way out of `cancelled` —
 * was enforced by RegistrationDetailClient's STATUS_ACTIONS map and nothing
 * else. In a `'use server'` module every export is a POST endpoint, so that is
 * a convention the client is trusted to follow, not a guarantee. Same shape the
 * repo already paid for in applyArticlePositionPlan.
 *
 * `updateRegistration` had no status gate at all, so a cancelled record's
 * fields stayed writable.
 *
 * ── WHY A SOURCE SCAN AND NOT A UNIT TEST ───────────────────────────────────
 * This is a `'use server'` module whose imports reach next-auth → next/headers
 * and mongoose. There is nothing a unit test in this suite can call. So the
 * checks below are SHAPE checks on the query the action issues — they prove the
 * filter names the stored status, not that Mongo honoured it. The behaviour
 * itself is click-tested.
 *
 * ── READING THE RIGHT VIEW ──────────────────────────────────────────────────
 * `code` strips imports; `withImports` does not. Every assertion below states
 * which it uses, and the import-shaped ones read `withImports` with a control
 * proving the stripping is real — otherwise a "this file imports X" rule read
 * from `code` passes vacuously against a file with no imports at all.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');

/**
 * The body of one exported action, from its own `export async function` to the
 * next one. Both markers are asserted, so a renamed function fails loudly here
 * instead of silently handing back an empty string that satisfies everything.
 */
function actionBody(code, name) {
  const start = code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone from registrations.js`);
  const rest = code.slice(start + 1);
  const nextIdx = rest.indexOf('export async function ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

const STATUS_BODY = actionBody(ACTIONS.code, 'updateRegistrationStatus');
const UPDATE_BODY = actionBody(ACTIONS.code, 'updateRegistration');

// ── 1. updateRegistrationStatus gates on the STORED value ───────────────────

test('updateRegistrationStatus filters on the stored status, atomically', () => {
  // CODE view: this is about the query the function issues, not its imports.
  assert.match(
    STATUS_BODY,
    /findOneAndUpdate\(\s*\{\s*_id:\s*id,\s*status:\s*\{\s*\$in:\s*fromStates\s*\}/,
    'the permitted from-states must be in the FILTER, so Mongo checks them in one operation'
  );
  // `fromStates` is `allowedFromStates(status, table)` widened through
  // `storedValuesForFilter`. Naming the variable in the filter and the
  // derivation separately keeps this readable as the list grew a second step.
  assert.match(STATUS_BODY, /allowedFromStates\(status,\s*table\)/,
    'the from-states must still come from the transition table');
});

/**
 * ── REWRITTEN: THE PUBLIC/IN-HOUSE BRANCH IS GONE ───────────────────────────
 *
 * Round 1 sliced this body at `} else {` and asserted only that the PUBLIC half
 * had no `findByIdAndUpdate`, explicitly allowing the call to survive in the
 * in-house branch "which is unchanged this round".
 *
 * Round 2 removed the branch entirely — one conditional update serves both
 * sources, differing only in which table `transitionsForSource` returns. So the
 * slice has nothing to cut on, and the assertion is now the stronger one it
 * could not be before: the unconditional by-id update is gone from the WHOLE
 * action, not from one half of it.
 */
test('updateRegistrationStatus does NOT read the status and then write it, on EITHER source', () => {
  assert.ok(
    !STATUS_BODY.includes('findByIdAndUpdate('),
    'an unconditional by-id update is back — a concurrent cancel could be raced'
  );
  assert.ok(STATUS_BODY.includes('findOneAndUpdate('), 'the conditional update is gone');
  assert.ok(
    !STATUS_BODY.includes("if (source === 'inhouse')"),
    'the per-source branch is back — the two paths must differ only by table'
  );
});

test('a null result is disambiguated by ONE extra read, on the refusal path only', () => {
  // null means EITHER not-found OR not-permitted. Both must be reachable and
  // must produce different messages, or the admin is told a live record was
  // deleted.
  assert.match(STATUS_BODY, /if\s*\(!doc\)\s*\{[\s\S]*?findById\(id\)[\s\S]*?\}/);
  assert.ok(STATUS_BODY.includes('ไม่พบรายการ'), 'the not-found message survives');
  assert.ok(STATUS_BODY.includes('ไม่สามารถเปลี่ยนสถานะจาก'), 'the refusal has its own message');
});

/**
 * A REJECTED TRANSITION WRITES NO AUDIT ROW.
 *
 * The trail is only evidence because every row is something that happened. A
 * refused move did not happen, and filing one puts a status change in the
 * history of a record that never changed status — worse than silence, because
 * it reads as proof.
 *
 * Positional: every refusal return must appear BEFORE the single
 * recordAdminActionAfter call in this action.
 */
test('every refusal returns before the audit write', () => {
  const audit = STATUS_BODY.indexOf('recordAdminActionAfter(');
  assert.notEqual(audit, -1, 'the successful path still writes an audit row');
  for (const marker of ['สถานะไม่ถูกต้อง', 'ไม่พบรายการ', 'ไม่สามารถเปลี่ยนสถานะจาก']) {
    const at = STATUS_BODY.indexOf(marker);
    assert.notEqual(at, -1, `${marker} is gone`);
    assert.ok(at < audit, `the refusal "${marker}" is positioned after the audit write`);
  }
});

test('CONTROL: the positional check can distinguish the two orders', () => {
  // Proves the assertion above is about ORDER and not merely about presence:
  // the same comparison run against a body with the audit call first must fail.
  const inverted = 'recordAdminActionAfter({});\n return { error: "ไม่พบรายการ" };';
  assert.ok(
    inverted.indexOf('ไม่พบรายการ') > inverted.indexOf('recordAdminActionAfter('),
    'the control is inert — this string must have the audit call FIRST'
  );
});

// ── 2. updateRegistration is gated on the stored status ─────────────────────

test('updateRegistration refuses a write to a cancelled record, in the FILTER', () => {
  assert.match(
    UPDATE_BODY,
    /status:\s*\{\s*\$ne:\s*'cancelled'\s*\}/,
    'the lock must be part of the query filter, not a preceding read'
  );
  assert.match(
    UPDATE_BODY,
    /findOneAndUpdate\(filter,/,
    'and that filter must be the one the update actually uses'
  );
});

test('updateRegistration distinguishes not-found from cancelled-and-locked', () => {
  assert.ok(UPDATE_BODY.includes('ไม่พบรายการ'));
  assert.ok(UPDATE_BODY.includes('ใบสมัครนี้ถูกยกเลิกแล้ว'), 'the lock has its own message');
});

test('the lock is NOT extended to paid — a paid record stays editable', () => {
  // A ruling, not an oversight. Attendee names, the coordinator, the billing
  // address and the notes are exactly what needs correcting after money
  // arrives. Only the STATUS is frozen on a paid record, and that is the
  // transition table's job.
  assert.ok(
    !/status:\s*\{\s*\$nin:\s*\[[^\]]*'paid'/.test(UPDATE_BODY),
    'updateRegistration must not gate on paid'
  );
  assert.ok(
    !/status:\s*\{\s*\$ne:\s*'paid'\s*\}/.test(UPDATE_BODY),
    'updateRegistration must not gate on paid'
  );
});

test('deleteRegistration is NOT gated — delete stays available when cancelled', () => {
  // Also a ruling. Delete is a different permission from edit, writes its own
  // audit row, and is the only way to clear a wrongly-cancelled row now that
  // cancellation is terminal. If someone "completes" the lock by gating this,
  // this test is what says no.
  const DELETE_BODY = actionBody(ACTIONS.code, 'deleteRegistration');
  assert.ok(!DELETE_BODY.includes("'cancelled'"), 'deleteRegistration must not check the status');
  assert.ok(DELETE_BODY.includes('findByIdAndDelete('), 'and still deletes by id alone');
});

// ── 3. The vocabulary is derived, not respelled ─────────────────────────────

/**
 * IMPORT-SHAPED RULE — reads `withImports`.
 *
 * The public status set used to be `new Set(['pending','confirmed','paid',
 * 'cancelled'])`, a second spelling of the enum sitting on the server where no
 * screen could contradict it. It must now come from the module.
 */
test('the public status set is derived from lib/registrations/statuses', () => {
  assert.match(
    ACTIONS.withImports,
    /import\s*\{[\s\S]*?PUBLIC_STATUS_VALUES[\s\S]*?\}\s*from\s*'@\/lib\/registrations\/statuses'/,
    'the values must be imported, not written out again'
  );
  assert.match(ACTIONS.code, /new Set\(PUBLIC_STATUS_VALUES\)/);
});

test('CONTROL: the CODE view really does strip imports', () => {
  // Without this, the assertion above could be written against `code`, find no
  // import statements at all, and pass vacuously on any file. This proves the
  // two views differ in exactly the way the rule above depends on.
  assert.ok(
    ACTIONS.withImports.includes("from '@/lib/registrations/statuses'"),
    'withImports keeps the import line'
  );
  assert.ok(
    !ACTIONS.code.includes("from '@/lib/registrations/statuses'"),
    'the control is inert — code did NOT strip the import, so the guard above proves nothing'
  );
});

test('no hand-written public status literal survives in the action module', () => {
  // The exact array that used to be there. Matching the literal rather than the
  // individual names, because the names legitimately appear in the guards above
  // (`$ne: 'cancelled'`) and a bare-name scan would forbid those too.
  assert.ok(
    !/\[\s*'pending',\s*'confirmed',\s*'paid',\s*'cancelled'\s*\]/.test(ACTIONS.code),
    'the hand-written public enum is back'
  );
  assert.ok(
    !/status:\s*'confirmed'/.test(ACTIONS.code),
    'a per-status countDocuments naming `confirmed` is back — derive from the array'
  );
});

test('the public counts are one countDocuments per declared value', () => {
  assert.match(
    actionBody(ACTIONS.code, 'getRegistrationStatusCounts'),
    /PUBLIC_STATUS_VALUES\.map\(\(value\)\s*=>/,
    'a status added to the array must be counted without editing this file'
  );
});

/**
 * ── REWRITTEN: IN-HOUSE IS NO LONGER "UNTOUCHED" ────────────────────────────
 *
 * This test used to assert the OPPOSITE of what the code should now do —
 * that `if (source === 'inhouse')` was present and kept its unconditional
 * `findByIdAndUpdate`. It was correct for round 1, where the in-house
 * transition table was still undecided and enforcing a guess on the sales team
 * would have been worse than enforcing nothing.
 *
 * The table is agreed now, so the assertion is inverted rather than deleted:
 * what it guarded was "do not enforce a rule nobody has agreed", and the
 * successor guard is "the rule that WAS agreed is enforced for both sources
 * from one place". The in-house-specific gates live in fs/inhouseWriteGate.
 */
test('the shared vocabulary is imported for both sources, not respelled', () => {
  assert.match(ACTIONS.withImports, /INHOUSE_STATUS_VALUES[\s\S]*?from '@\/lib\/registrations\/statuses'/);
  assert.match(ACTIONS.withImports, /PUBLIC_STATUS_VALUES[\s\S]*?from '@\/lib\/registrations\/statuses'/);
  assert.match(ACTIONS.code, /new Set\(INHOUSE_STATUS_VALUES\)/);
  assert.match(ACTIONS.code, /new Set\(PUBLIC_STATUS_VALUES\)/);
});

test('the transition table is chosen by source, and there is no second branch', () => {
  assert.match(STATUS_BODY, /const table = transitionsForSource\(source\)/,
    'the per-source table must be a lookup');
  // Exactly one conditional update in the action: two would mean the branch
  // came back wearing a different shape.
  assert.equal((STATUS_BODY.match(/findOneAndUpdate\(/g) ?? []).length, 1,
    'there must be exactly one status write in this action');
});
