import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';

/**
 * INTERNAL NOTES ARE APPEND-ONLY, AND THE SERVER IS WHAT SAYS SO.
 *
 * ══ WHY THIS TIER AND NOT A RENDER TEST ═════════════════════════════════════
 *
 * The instruction was explicit: "Enforce append-only ON THE SERVER, not merely
 * by the absence of UI." A render test can prove there is no edit button. It
 * cannot prove that a hand-crafted POST — which is all a `'use server'` export
 * is — cannot rewrite the array. Every export of such a module is an endpoint,
 * and this repo has already paid for treating a client convention as a
 * guarantee, twice (applyArticlePositionPlan, and the in-house status map).
 *
 * So the claims below are about the ACTION, and the control script that
 * accompanies them REMOVES THE CLIENT'S GUARD and shows the server assertions
 * still hold — which is the shape the instruction asked for.
 *
 * ══ THREE CLAIMS RE-POINTED FROM A DELETED ACTION ═══════════════════════════
 *
 * `updateInhouseAdminNotes` is gone. Its cancellation-lock, no-unconditional-
 * update and not-found-vs-locked assertions lived in fs/inhouseWriteGate §2 and
 * are re-pointed here, at `addInternalNote`, which does the work now. Not
 * weaker: the same three claims about the action that actually runs, plus the
 * append-only ones that could not be made about a String field at all.
 *
 * A fourth — "the note is still clearable" — is DELETED WITH ITS SUBJECT and is
 * a real behaviour change: there is no longer any way to clear a note. That is
 * the design; clearing was the overwrite defect in its mildest form.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');
const INHOUSE = readSource('src/lib/actions/inhouse-registrations.js');

function actionBody(code, name) {
  const start = code.indexOf(`export async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone`);
  const rest = code.slice(start + 1);
  const nextIdx = rest.indexOf('export async function ');
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx);
}

const NOTE_BODY   = actionBody(ACTIONS.code, 'addInternalNote');
const UPDATE_BODY = actionBody(ACTIONS.code, 'updateRegistration');

// ── 1. APPEND-ONLY, STRUCTURALLY ────────────────────────────────────────────

test('addInternalNote uses $push and NEVER $set', () => {
  /**
   * THE CORE OF IT. `$push` appends; `$set` replaces. A single `$set` on this
   * field — even one that carefully reconstructs the array — is a code path that
   * can overwrite an existing note, and the whole design is that no such path
   * exists.
   */
  assert.match(NOTE_BODY, /\$push:\s*\{\s*adminNotes:/, 'the note is not appended with $push');
  assert.ok(!NOTE_BODY.includes('$set'), 'addInternalNote contains a $set — it can overwrite');
  assert.ok(!NOTE_BODY.includes('$pull'), 'addInternalNote can remove notes');
  assert.ok(!NOTE_BODY.includes('$pop'), 'addInternalNote can remove notes');
  assert.ok(!NOTE_BODY.includes('$unset'), 'addInternalNote can erase the field');
});

test('the SIGNATURE cannot name an existing note', () => {
  /**
   * The second structural guard, and the one that survives a careless refactor
   * of the first. `addInternalNote(id, body, source)` takes a STRING. There is
   * no index, no note id, no array — so a hand-crafted POST has nothing to aim
   * at even if a `$set` were reintroduced by accident.
   *
   * This is also why the subdocument has `_id: false`: an id would be the first
   * half of the edit API that is deliberately not being built.
   */
  const sig = /export async function addInternalNote\(([^)]*)\)/.exec(ACTIONS.code);
  assert.ok(sig, 'addInternalNote signature not found');
  const params = sig[1].split(',').map((p) => p.trim().split('=')[0].trim());
  assert.deepEqual(params, ['id', 'body', 'source'],
    `the signature grew a parameter: [${sig[1]}] — an index or a note id makes editing expressible`);
});

test('THE BACK DOOR IS SHUT: updateRegistration cannot write adminNotes', () => {
  /**
   * `$push` in one action is worth nothing if another action can `$set` the
   * whole array. `updateRegistration` is a wholesale `$set` of an allowlisted
   * bag, and `adminNotes` used to be in that allowlist — a caller could have
   * sent `adminNotes: []` and erased the record.
   *
   * Read from the action BODY with comments stripped: the allowlist's docstring
   * names the field to explain its removal, and against raw source that comment
   * would satisfy this assertion in the wrong direction.
   */
  assert.ok(!UPDATE_BODY.includes('adminNotes'),
    "adminNotes is back in updateRegistration — the append-only array is $set-able again");
});

test('addInternalNote is the ONLY writer of adminNotes in the whole action layer', () => {
  // Not "the other actions do not write it" — the strong form. Anything that
  // mentions the field outside this one action is a candidate second writer.
  const others = ACTIONS.code.replace(NOTE_BODY, '');
  assert.ok(!others.includes('adminNotes'),
    'something other than addInternalNote references adminNotes in registrations.js');
  assert.ok(!INHOUSE.code.includes('adminNotes'),
    'inhouse-registrations.js still touches adminNotes — updateInhouseAdminNotes should be gone');
});

test('the retired single-String action is really gone, not merely unused', () => {
  assert.ok(!INHOUSE.code.includes('export async function updateInhouseAdminNotes'),
    'updateInhouseAdminNotes still exists — two notes mechanisms, which was the thing to avoid');
  // …and the module is still there, so the assertion above is not passing
  // because the file was deleted out from under it.
  assert.ok(sourceExists('src/lib/actions/inhouse-registrations.js'));
  assert.ok(INHOUSE.code.includes('export async function updateInhouseStatus'),
    'the in-house action module lost its other exports too — something bigger is wrong');
});

// ── 2. RE-POINTED FROM updateInhouseAdminNotes ──────────────────────────────

test('the cancellation lock is in the FILTER, not a preceding read', () => {
  // Re-pointed from fs/inhouseWriteGate §2. Same claim, same reason: a read
  // before the write can be raced by the cancel it is checking for, and the
  // write then lands on a record cancelled a millisecond ago.
  assert.match(
    NOTE_BODY,
    /findOneAndUpdate\(\s*\{\s*_id:\s*id,\s*status:\s*\{\s*\$ne:\s*'cancelled'\s*\}\s*\}/,
    'the lock must be part of the query filter',
  );
});

test('no unconditional by-id update', () => {
  assert.ok(!NOTE_BODY.includes('findByIdAndUpdate('), 'the ungated update is back');
});

test('not-found is distinguished from cancelled-and-locked', () => {
  assert.ok(NOTE_BODY.includes('ไม่พบรายการ'), 'the not-found message is gone');
  assert.ok(NOTE_BODY.includes('ถูกยกเลิกแล้ว'), 'the lock has no message of its own');
});

// ── 3. THE BODY NEVER REACHES AN AUDIT ROW ──────────────────────────────────

test('the audit row records the ACT, never the note text', () => {
  /**
   * ══ THE FIELD MOST LIKELY TO QUOTE A CUSTOMER VERBATIM ═════════════════════
   *
   * These records hold names, emails, phones and tax ids, and an internal note
   * is where a salesperson writes what the customer actually said — what they
   * can afford, who to call. The audit trail is append-only and presently
   * forever, so anything copied into it cannot be redacted when a deletion
   * request arrives.
   *
   * The row says a note was added, by whom, when. Not what it said.
   */
  const call = /recordAdminActionAfter\(\{([\s\S]*?)\}\);/.exec(NOTE_BODY);
  assert.ok(call, 'addInternalNote writes no audit row at all');
  const payload = call[1];

  assert.ok(!/\bbefore\b/.test(payload), 'the audit call carries a `before` payload');
  assert.ok(!/\bafter\b/.test(payload), 'the audit call carries an `after` payload');
  // The two identifiers that would carry the text, by the names they have here.
  assert.ok(!/\bnote\b/.test(payload), 'the normalised note body reaches the audit row');
  assert.ok(!/\bbody\b/.test(payload), 'the note body reaches the audit row');

  // …and it DOES record the things it should, so this is not passing on an
  // audit call that was gutted.
  assert.match(payload, /action:\s*'notes'/, 'the action is not recorded as `notes`');
  assert.match(payload, /entity:\s*entityForSource\(source\)/, 'the entity is not derived from the source');
  assert.match(payload, /recordId:\s*String\(id\)/, 'the record id is not recorded');
  assert.match(payload, /actor:/, 'the actor is not recorded');
});

test('recordLabel is EMPTY — the reference number is already the recordId', () => {
  // Same discipline as every other registration action: the admin's
  // เลขอ้างอิง is String(_id).slice(-8), so recordId carries it and a label
  // would be a second copy of a value that is also personal-data-adjacent.
  assert.match(NOTE_BODY, /recordLabel:\s*''/, 'recordLabel is not empty');
});

// ── 4. authorName is DENORMALISED and not re-resolved ───────────────────────

test('authorName is stamped from the SESSION at write time', () => {
  /**
   * It is who wrote the note AT THE TIME. It must not be re-resolved from
   * `authorId` later — people leave, people are renamed, and a re-resolved
   * byline rewrites the past to match the present.
   *
   * The positive form: the value comes off the session, in this action.
   */
  assert.match(NOTE_BODY, /authorName:\s*session\.user\?\.name/,
    'authorName is not taken from the session at write time');
  assert.match(NOTE_BODY, /authorId:\s*session\.user\?\.id/,
    'authorId is not taken from the session — the note cannot be attributed to an account');
});

test('nothing looks authorName up from authorId at read time', () => {
  /**
   * The negative form, across the layer. A `.populate()`, a user lookup keyed on
   * a note's authorId, or a join in the reader would all defeat the
   * denormalisation while leaving the write path above untouched.
   *
   * `authorId` is a String rather than an ObjectId on the schema precisely so
   * `.populate()` is not even expressible — this asserts nobody worked around
   * that by hand.
   */
  const NOTES_LIB = readSource('src/lib/registrations/internalNotes.js');
  assert.ok(!NOTES_LIB.code.includes('populate'), 'the notes reader populates something');
  assert.ok(!/findById|findOne|import .*models/.test(NOTES_LIB.withImports),
    'the notes reader reaches for the database — it must be pure');
  assert.ok(!ACTIONS.code.includes('.populate('), 'the actions module populates a note author');
});

// ── 5. THE MODEL AGREES ─────────────────────────────────────────────────────

test('the note subdocument has NO _id — a note cannot be addressed', () => {
  const SCHEMA = readSource('src/models/internalNoteSchema.js');
  assert.match(SCHEMA.code, /\{\s*_id:\s*false\s*\}/,
    'the note subdocument gained an _id — the first half of an edit API');
  for (const field of ['body', 'authorId', 'authorName', 'createdAt']) {
    assert.ok(SCHEMA.code.includes(field), `the note schema lost ${field}`);
  }
});

test('BOTH models use the SAME subdocument — one mechanism, not two', () => {
  for (const rel of ['src/models/RegisterPublic.js', 'src/models/RegisterInhouse.js']) {
    const model = readSource(rel);
    assert.match(model.withImports, /import\s*\{\s*InternalNoteSchema\s*\}\s*from\s*'\.\/internalNoteSchema'/,
      `${rel} does not import the shared note schema`);
    assert.match(model.code, /adminNotes:\s*\{\s*type:\s*\[InternalNoteSchema\]/,
      `${rel} does not type adminNotes as an array of the shared schema`);
    // `default: undefined`, so an untouched document keeps having NO field. A
    // default of [] would turn "never had a note" into "had notes, has none".
    assert.match(model.code, /adminNotes:\s*\{[\s\S]{0,120}?default:\s*undefined/,
      `${rel}'s adminNotes defaults to something — it must default to undefined`);
  }
});
