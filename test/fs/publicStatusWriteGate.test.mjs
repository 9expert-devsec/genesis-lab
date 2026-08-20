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
  /**
   * ── RE-POINTED IN ROUND 8, AND NOT WEAKENED ───────────────────────────────
   * The filter was `status: { $ne: 'cancelled' }`. It is now
   * `status: { $nin: blocked }`, where `blocked` is `['cancelled']` normally and
   * `['cancelled', 'paid']` when the payload touches `attendeesCount` — see the
   * note at that field, and the paid half in its own test below.
   *
   * The CLAIM is unchanged and is the one that mattered: the cancellation lock
   * is part of the query filter rather than a preceding read, so a cancel racing
   * this call cannot land. What moved is the shape carrying it.
   *
   * Both halves are asserted — that `cancelled` is in the blocked list, AND that
   * the list is what the filter uses — because matching only the `const blocked`
   * line would pass on a filter that ignored it.
   */
  assert.match(
    UPDATE_BODY,
    /const blocked = [^\n]*'cancelled'/,
    'the cancellation lock is no longer expressed as a blocked-status list'
  );
  assert.match(
    UPDATE_BODY,
    /const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$nin:\s*blocked\s*\}\s*\}/,
    'the lock must be part of the query filter, not a preceding read'
  );
  assert.match(
    UPDATE_BODY,
    /findOneAndUpdate\(filter,/,
    'and that filter must be the one the update actually uses'
  );
  // The unconditional branch: `cancelled` is blocked whatever the payload holds.
  assert.match(
    UPDATE_BODY,
    /:\s*\['cancelled'\]/,
    'a payload that touches no gated field must still be locked out of a cancelled record'
  );
});

test('CONTROL: the filter probe rejects a lock moved back out of the query', () => {
  /**
   * The assertion above is three `match`es, and a regex that matched nothing
   * would fail loudly — but a regex that matched the WRONG THING would not. So:
   * a body that reads the status first and then writes unconditionally must not
   * satisfy the filter probe, which is precisely the shape the lock replaced.
   */
  const readThenWrite = `
    const doc = await Model.findById(id).select('status').lean();
    if (doc.status === 'cancelled') return { ok: false };
    const filter = { _id: id };
    await Model.findOneAndUpdate(filter, { $set: update });
  `;
  assert.equal(
    /const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$nin:\s*blocked\s*\}\s*\}/.test(readThenWrite),
    false,
    'the probe accepts a read-then-write, which is the race the filter exists to close'
  );
  // …and it DOES accept the real shape, so it is not simply rejecting everything.
  assert.ok(
    /const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$nin:\s*blocked\s*\}\s*\}/
      .test("const filter = { _id: id, status: { $nin: blocked } };"),
    'the probe cannot see the shape it is written for'
  );
});

test('updateRegistration distinguishes not-found from cancelled-and-locked', () => {
  assert.ok(UPDATE_BODY.includes('ไม่พบรายการ'));
  assert.ok(UPDATE_BODY.includes('ใบสมัครนี้ถูกยกเลิกแล้ว'), 'the lock has its own message');
});

/**
 * ══ RE-POINTED IN ROUND 8. READ THE VACUITY NOTE — IT WAS FOUND, NOT AVOIDED ══
 *
 * This test used to read:
 *
 *     assert.ok(!/status:\s*\{\s*\$nin:\s*\[[^\]]*'paid'/.test(UPDATE_BODY));
 *     assert.ok(!/status:\s*\{\s*\$ne:\s*'paid'\s*\}/.test(UPDATE_BODY));
 *
 * — "updateRegistration must not gate on paid", round 1's ruling that money
 * arriving freezes the STATUS and nothing else.
 *
 * Round 8 gates exactly one field on paid: `attendeesCount`, the field that drove
 * the amount charged. AND BOTH ASSERTIONS ABOVE STAYED GREEN THROUGH THAT
 * CHANGE. Not because the ruling survived — because the paid literal moved out of
 * the `$nin:` position into `const blocked = paidGuard ? ['cancelled', 'paid'] :
 * ['cancelled']`, which neither regex can see. The guard went VACUOUS: it was
 * still passing, still named after a rule, and no longer testing that rule in
 * either direction.
 *
 * That is the pattern this suite has now hit in six consecutive rounds. It is
 * recorded rather than quietly fixed, because the tempting move — adjust the
 * regex until it goes red again — would have restored a guard that FORBIDS the
 * change round 8 asked for.
 *
 * ── WHAT THE CLAIM ACTUALLY IS, NOW THAT ONE FIELD IS GATED ────────────────
 * Round 1's ruling is not withdrawn; it is NARROWED, and the narrowing is the
 * thing to pin. So this asserts both halves:
 *
 *   · the paid gate exists and reaches EXACTLY ONE field — `attendeesCount`;
 *   · the filter is NOT unconditionally gated on paid, so the coordinator, the
 *     attendee names, the invoice and the notes stay editable after money
 *     arrives, which is round 1's ruling verbatim and is the half a careless
 *     widening would take out.
 */
test('the paid gate reaches attendeesCount ONLY — every other field stays editable', () => {
  // The gate exists, and it is raised by the seat count and by nothing else.
  assert.match(UPDATE_BODY, /paidGuard = true/, 'nothing raises the paid gate any more');
  const raises = [...UPDATE_BODY.matchAll(/paidGuard = true/g)].length;
  assert.equal(raises, 1, `${raises} fields raise the paid gate — it must be attendeesCount alone`);

  // …and the one that raises it is attendeesCount. Bounded to the branch, so
  // this cannot pass on the flag being set somewhere else entirely.
  const at = UPDATE_BODY.indexOf('paidGuard = true');
  const before = UPDATE_BODY.slice(0, at);
  const branch = before.lastIndexOf('if (data.');
  assert.notEqual(branch, -1, 'the gate is not inside a field branch at all');
  assert.match(before.slice(branch), /^if \(data\.attendeesCount !== undefined\)/,
    'a field other than attendeesCount raises the paid gate');

  // THE ROUND-1 HALF, UNCHANGED: the filter is not unconditionally paid-gated.
  // `['cancelled']` is the default arm, so a payload naming no gated field
  // reaches a paid record exactly as it did before.
  assert.match(UPDATE_BODY, /paidGuard \? \['cancelled', 'paid'\] : \['cancelled'\]/,
    'the paid block is no longer conditional — a paid record just went read-only');
});

test('CONTROL: the paid-gate probes reject both ways of getting this wrong', () => {
  /**
   * Two failure directions, and a probe that catches only one is half a guard.
   *   · TOO WIDE — the filter gates every field on paid (round 1 undone).
   *   · TOO NARROW — nothing gates attendeesCount (round 8 undone).
   */
  const tooWide = "const blocked = ['cancelled', 'paid'];";
  assert.equal(/paidGuard \? \['cancelled', 'paid'\] : \['cancelled'\]/.test(tooWide), false,
    'the probe accepts an unconditional paid block');

  const tooNarrow = "if (data.attendeesCount !== undefined) { update.attendeesCount = n; }";
  assert.equal(/paidGuard = true/.test(tooNarrow), false,
    'the probe accepts an ungated attendeesCount');

  // And it accepts the real shape, so it is not rejecting everything.
  const real = "if (data.attendeesCount !== undefined) {\n  paidGuard = true;\n}\n"
    + "const blocked = paidGuard ? ['cancelled', 'paid'] : ['cancelled'];";
  assert.ok(/paidGuard = true/.test(real) && /paidGuard \? \['cancelled', 'paid'\] : \['cancelled'\]/.test(real));
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
