import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE IN-HOUSE WRITE GATES ARE AGAINST THE STORED STATUS.
 *
 * ── WHAT ROUND 1 LEFT, STATED EXACTLY ───────────────────────────────────────
 * Round 1 gated the PUBLIC paths and said so in its own comments. In-house had:
 *
 *   · `updateInhouseStatus` — an unconditional `findByIdAndUpdate(id, {status})`.
 *     Any pair of states, from anything. Round 1's note ("no agreed transition
 *     table yet; inventing one here would be a guess enforced on the sales
 *     team") was the reason, and the table is agreed now.
 *   · `updateInhouseAdminNotes` — NO GATE OF ANY KIND. Not a weaker one, not a
 *     stale read: an unconditional update on the id alone. The admin notes on a
 *     cancelled request would have stayed writable while every other field on
 *     the same record was frozen.
 *   · `updateRegistration` (the shared one) — gated, but PUBLIC ONLY, via an
 *     explicit `source === 'inhouse' ? { _id: id } : …` branch. That branch is
 *     the answer to "does round 1's implementation generalise": it does not,
 *     and it was written not to, because in-house had no `cancelled` to lock.
 *
 * ── TWO ACTIONS WRITE THE IN-HOUSE STATUS, AND BOTH ARE GATED ───────────────
 * `updateInhouseStatus` in lib/actions/inhouse-registrations.js is the one the
 * DETAIL SCREEN calls. `updateRegistrationStatus` in lib/actions/registrations.js
 * is reached through the shared list screen's `source` parameter. Gating one and
 * testing the other would leave the live path open, so both are asserted here.
 *
 * ── WHY A SOURCE SCAN AND NOT A UNIT TEST ───────────────────────────────────
 * These are `'use server'` modules whose imports reach next-auth → next/headers
 * and mongoose. There is nothing this suite can call. The checks below are
 * SHAPE checks on the query each action issues — they prove the filter names
 * the stored status, not that Mongo honoured it. The behaviour is click-tested.
 *
 * ── READING THE RIGHT VIEW ──────────────────────────────────────────────────
 * `code` strips imports; `withImports` does not. Every import-shaped assertion
 * below reads `withImports` and ships a control proving the stripping is real,
 * because a "this file imports X" rule read from `code` sees no import
 * statements at all and passes vacuously on any file in the repo.
 */

const INHOUSE = readSource('src/lib/actions/inhouse-registrations.js');
const SHARED  = readSource('src/lib/actions/registrations.js');

/**
 * The body of one exported action, from its own `export async function` to the
 * next one. Both markers are asserted, so a renamed function fails loudly here
 * instead of silently handing back an empty string that satisfies everything.
 */
function actionBody(code, name) {
  const start = code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = code.slice(start + 1);
  const nextIdx = rest.indexOf('export async function ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

const STATUS_BODY = actionBody(INHOUSE.code, 'updateInhouseStatus');
const NOTES_BODY  = actionBody(INHOUSE.code, 'updateInhouseAdminNotes');
const DELETE_BODY = actionBody(INHOUSE.code, 'deleteInhouseRegistration');
const SHARED_STATUS_BODY = actionBody(SHARED.code, 'updateRegistrationStatus');
const SHARED_UPDATE_BODY = actionBody(SHARED.code, 'updateRegistration');

// ── 1. updateInhouseStatus gates on the STORED value ────────────────────────

test('updateInhouseStatus filters on the stored status, atomically', () => {
  assert.match(
    STATUS_BODY,
    /findOneAndUpdate\(\s*\{\s*_id:\s*id,\s*status:\s*\{\s*\$in:\s*fromStates\s*\}/,
    'the permitted from-states must be in the FILTER, so Mongo checks them in one operation'
  );
});

test('the in-house status path does NOT read the status and then write it', () => {
  // The read-then-write shape is the unconditional by-id update this replaced.
  // A concurrent cancel between the read and the write would land the move on a
  // state nobody checked — and cancellation is terminal now.
  assert.ok(
    !STATUS_BODY.includes('findByIdAndUpdate('),
    'the in-house status path must not use an unconditional by-id update'
  );
});

test('the from-states come from the shared table, not a literal here', () => {
  assert.match(
    STATUS_BODY,
    /allowedFromStates\(status,\s*INHOUSE_STATUS_TRANSITIONS\)/,
    'the permitted from-states must be derived from the shared transition table'
  );
});

test('the from-states are WIDENED for documents the migration has not reached', () => {
  // Without this the whole in-house backlog is frozen for the window between
  // deploying and --apply: a retired value has no row in the three-value table,
  // so `allowedFromStates` names nothing that matches a stored `new`.
  assert.match(
    STATUS_BODY,
    /storedValuesForFilter\(from,\s*'inhouse'\)/,
    'a stored `new` or `contacted` must still be able to move'
  );
});

test('a null result is disambiguated by ONE extra read, on the refusal path only', () => {
  assert.match(STATUS_BODY, /if\s*\(!doc\)\s*\{[\s\S]*?findById\(id\)[\s\S]*?\}/);
  assert.ok(STATUS_BODY.includes('ไม่พบรายการ'), 'the not-found message survives');
  assert.ok(STATUS_BODY.includes('ไม่สามารถเปลี่ยนสถานะจาก'), 'the refusal has its own message');
});

test('the refusal message labels a RETIRED from-state, not a raw enum', () => {
  // Every unmigrated document holds one, so this is the normal case for the
  // whole window — not an edge. A live-only label map has no entry for
  // `contacted` and the message would read 'จาก "contacted"'.
  assert.match(STATUS_BODY, /statusLabel\(existing\.status\)/,
    'the from-state must go through the label lookup that knows retired values');
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
 * recordAdminActionAfter call in the action.
 */
test('every in-house status refusal returns before the audit write', () => {
  const audit = STATUS_BODY.indexOf('recordAdminActionAfter(');
  assert.notEqual(audit, -1, 'the successful path still writes an audit row');
  for (const marker of ['สถานะไม่ถูกต้อง', 'ไม่พบรายการ', 'ไม่สามารถเปลี่ยนสถานะจาก']) {
    const at = STATUS_BODY.indexOf(marker);
    assert.notEqual(at, -1, `${marker} is gone`);
    assert.ok(at < audit, `the refusal "${marker}" is positioned after the audit write`);
  }
});

test('CONTROL: the positional check can distinguish the two orders', () => {
  // Proves the assertion above is about ORDER and not merely about presence.
  const inverted = 'recordAdminActionAfter({});\n return { error: "ไม่พบรายการ" };';
  assert.ok(
    inverted.indexOf('ไม่พบรายการ') > inverted.indexOf('recordAdminActionAfter('),
    'the control is inert — this string must have the audit call FIRST'
  );
});

// ── 2. updateInhouseAdminNotes — the action that had NO gate ────────────────

test('updateInhouseAdminNotes refuses a write to a cancelled request, in the FILTER', () => {
  assert.match(
    NOTES_BODY,
    /findOneAndUpdate\(\s*\{\s*_id:\s*id,\s*status:\s*\{\s*\$ne:\s*'cancelled'\s*\}\s*\}/,
    'the lock must be part of the query filter, not a preceding read'
  );
});

test('updateInhouseAdminNotes no longer uses an unconditional by-id update', () => {
  assert.ok(!NOTES_BODY.includes('findByIdAndUpdate('), 'the ungated update is back');
});

test('updateInhouseAdminNotes distinguishes not-found from cancelled-and-locked', () => {
  assert.ok(NOTES_BODY.includes('ไม่พบรายการ'));
  assert.ok(NOTES_BODY.includes('คำขอนี้ถูกยกเลิกแล้ว'), 'the lock has its own message');
});

test('the note is still clearable — the empty string survives the gate rewrite', () => {
  // `''` NOT `|| undefined`: Mongoose drops an undefined value from an update
  // object, so clearing the box sent nothing and the old note survived. That
  // fix predates this round and the move to `$set` must not have undone it.
  assert.match(NOTES_BODY, /String\(adminNotes \?\? ''\)\.trim\(\)\.slice\(0, 2000\)/);
});

test('deleteInhouseRegistration is NOT gated — delete stays available when cancelled', () => {
  // The ruling, same as public. Delete is a different permission from edit,
  // writes its own audit row, and is the only way to clear a wrongly-cancelled
  // row now that cancellation is terminal.
  assert.ok(!DELETE_BODY.includes("'cancelled'"), 'deleteInhouseRegistration must not check the status');
  assert.ok(DELETE_BODY.includes('findByIdAndDelete('), 'and still deletes by id alone');
});

// ── 3. The shared actions cover in-house too ────────────────────────────────

test('updateRegistration gates BOTH sources — the public-only branch is gone', () => {
  // Round 1 wrote `source === 'inhouse' ? { _id: id } : { _id: id, status: … }`.
  // That branch would have left a cancelled in-house request fully editable.
  assert.ok(
    !/source === 'inhouse'\s*\n?\s*\?\s*\{\s*_id:\s*id\s*\}/.test(SHARED_UPDATE_BODY),
    'the public-only cancellation branch is back'
  );
  assert.match(
    SHARED_UPDATE_BODY,
    /const filter = \{\s*_id:\s*id,\s*status:\s*\{\s*\$ne:\s*'cancelled'\s*\}\s*\}/,
    'one filter must cover both collections'
  );
  assert.match(SHARED_UPDATE_BODY, /findOneAndUpdate\(filter,/,
    'and that filter must be the one the update actually uses');
});

test('updateRegistrationStatus has no separate in-house branch left', () => {
  // The two paths differ only in WHICH TABLE they read, which is a lookup —
  // not a control-flow fork with its own atomicity story.
  assert.ok(
    !/if\s*\(source === 'inhouse'\)\s*\{[\s\S]*?findByIdAndUpdate\(/.test(SHARED_STATUS_BODY),
    'the unconditional in-house status branch is back'
  );
  assert.match(SHARED_STATUS_BODY, /transitionsForSource\(source\)/,
    'the table must be selected by source, not branched on');
  assert.match(
    SHARED_STATUS_BODY,
    /findOneAndUpdate\(\s*\{\s*_id:\s*id,\s*status:\s*\{\s*\$in:\s*fromStates\s*\}/,
    'the shared status write must be conditional for both sources'
  );
});

test('the shared status write widens its from-states too', () => {
  assert.match(SHARED_STATUS_BODY, /storedValuesForFilter\(from,\s*source\)/);
});

test('CONTROL: the two shared bodies are genuinely different functions', () => {
  // `actionBody` slices on markers. If a rename made one of them return the
  // other's text — or an empty string — every assertion above would be about
  // the wrong code.
  assert.notEqual(SHARED_STATUS_BODY, SHARED_UPDATE_BODY);
  assert.ok(SHARED_STATUS_BODY.length > 200 && SHARED_UPDATE_BODY.length > 200,
    'an action body collapsed to near-nothing — the markers moved');
  assert.ok(SHARED_UPDATE_BODY.includes('inhouseFields'), 'updateRegistration lost its allowlist');
});

// ── 4. The vocabulary is derived, not respelled ─────────────────────────────

/** IMPORT-SHAPED RULE — reads `withImports`, with the control below. */
test('the in-house actions import their vocabulary and table from the module', () => {
  assert.match(
    INHOUSE.withImports,
    /import\s*\{[\s\S]*?INHOUSE_STATUS_TRANSITIONS[\s\S]*?\}\s*from\s*'@\/lib\/registrations\/statuses'/,
    'the transition table must be imported, not written out again'
  );
  assert.match(INHOUSE.code, /new Set\(INHOUSE_STATUS_VALUES\)/,
    'the status allowlist must be derived from the shared array');
});

test('CONTROL: the CODE view really does strip that import', () => {
  assert.ok(
    INHOUSE.withImports.includes("from '@/lib/registrations/statuses'"),
    'withImports keeps the import line'
  );
  assert.ok(
    !INHOUSE.code.includes("from '@/lib/registrations/statuses'"),
    'the control is inert — code did NOT strip the import, so the guard above proves nothing'
  );
});

test('no hand-written in-house status literal survives in the in-house actions', () => {
  // The exact Set that used to be here. Matching the array literal rather than
  // the individual names, because `'cancelled'` legitimately appears in the
  // `$ne` guard above and a bare-name scan would forbid it.
  assert.ok(
    !/\[\s*'new',\s*'contacted',\s*'quoted',\s*'closed-won',\s*'closed-lost'\s*\]/.test(INHOUSE.code),
    'the hand-written in-house enum is back'
  );
});
