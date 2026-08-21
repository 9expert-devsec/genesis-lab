import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE NOTE'S AUTHOR AND TIME COME FROM THE SERVER, AND ONLY FROM THE SERVER.
 *
 * ══ WHY THIS IS AN fs TEST AND NOT A RENDER ONE ═════════════════════════════
 *
 * The brief for round 13 said: whichever half was broken, assert it at THAT
 * layer — a write-path defect needs a write-path assertion, not a render one.
 * It turned out to be a read defect, and its pure and render halves are in
 * pure/internalNoteByline and render/internalNoteByline.
 *
 * WHAT IS LEFT IS THE HALF NEITHER OF THOSE CAN SEE: `addInternalNote` is a
 * server action with no database in this suite, so nothing here can RUN it. The
 * claim that survives is about SHAPE — that the three stamped fields are read
 * off the session at the write, that the clients do not supply them, and that
 * the reply the clients now trust actually exists. Every assertion below says
 * so at the assertion, per the standing rule about shape guards.
 *
 * ══ THE DEFECT, FOR THE NEXT READER ═════════════════════════════════════════
 *
 * A saved note rendered a bare `—`. The data was intact — measured read-only
 * with scripts/audit-internal-note-bylines.mjs — and the client's own optimistic
 * echo, `{ body, authorId: '', authorName: '', createdAt: null }`, was what was
 * on screen. Both call sites believed a revalidated `doc` prop would replace it.
 * IT CANNOT: `internalNotes` is `useState(() => readNotes(doc.adminNotes))` and
 * a useState INITIALISER RUNS ONCE PER MOUNT.
 *
 * So the guards below are pointed at the shape that made the echo possible.
 */

const ACTIONS = readSource('src/lib/actions/registrations.js');
const PUBLIC = readSource('src/app/admin/registrations/_components/RegistrationDetailClient.jsx');
const INHOUSE = readSource('src/app/admin/registrations/inhouse/_components/InhouseDetailClient.jsx');
const CLIENTS = [PUBLIC, INHOUSE];

/** One exported action's body, comments and imports already stripped. */
function actionBody(code, name) {
  const at = code.indexOf(`export async function ${name}`);
  assert.notEqual(at, -1, `${name} is gone from the action module`);
  const rest = code.slice(at + 1);
  const next = rest.indexOf('export async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

const NOTE_BODY = actionBody(ACTIONS.code, 'addInternalNote');

// ════════════════════════════════════════════════════════════════════════════
// 1. THE WRITE STAMPS FROM THE SESSION
// ════════════════════════════════════════════════════════════════════════════

test('the stamped fields come off the SESSION, not off an argument', () => {
  /**
   * The property: a caller cannot choose who a note is from. `addInternalNote`
   * takes `(id, body, source)` — asserted next door in internalNotesAppendOnly —
   * so the only way author could be client-supplied is if the body read it out
   * of `body` or a fourth parameter. It reads `session.user`.
   *
   * SHAPE, NOT BEHAVIOUR, and that is a compromise: this suite has no database
   * and no session, so the action cannot be run. What a source guard CAN say is
   * that the expression feeding `authorName` names the session.
   */
  assert.match(NOTE_BODY, /authorId:\s*session\.user\?\.id/,
    'authorId is no longer stamped from the session');
  assert.match(NOTE_BODY, /authorName:\s*session\.user\?\.name/,
    'authorName is no longer stamped from the session');
  assert.match(NOTE_BODY, /buildNoteEntry\(/,
    'the entry is no longer built by the shared builder — createdAt defaults there');
});

test('the action never re-resolves authorName from authorId', () => {
  /**
   * ══ ROUND 6'S DECISION, CHECKED RATHER THAN ASSUMED ═══════════════════════
   *
   * `authorName` is denormalised on purpose: it is who wrote the note AT THE
   * TIME. Round 6 predicted that a future reader would see the duplication and
   * "fix" it with a join, and predicted the symptom — a blank byline, because a
   * departed admin's id resolves to nothing.
   *
   * That symptom is exactly what was reported this round, so the decision was
   * the first thing to check. It survived: no populate, no lookup, no join.
   * Asserted here so the next report of a blank byline does not have to.
   */
  for (const forbidden of ['.populate(', '$lookup', 'findById(note.authorId', 'resolveAuthor']) {
    assert.ok(!NOTE_BODY.includes(forbidden),
      `addInternalNote reaches for ${forbidden} — authorName must never be re-resolved`);
  }
  // …and the whole action module, because a join added anywhere would do it.
  assert.ok(!ACTIONS.code.includes('$lookup'), 'a $lookup appeared in the registrations actions');
});

test('the action RETURNS the entry it stamped', () => {
  /**
   * The half the fix added. Without a reply the client has nothing to append but
   * a guess, which is what the echo was. The return is asserted by SHAPE and by
   * the field name the clients read, so renaming one without the other reddens.
   */
  assert.match(NOTE_BODY, /return\s*\{\s*ok:\s*true,\s*note:/,
    'addInternalNote no longer returns the stamped note');
  assert.match(NOTE_BODY, /doc\.adminNotes\?\.\[doc\.adminNotes\.length - 1\]/,
    'the returned note is not the entry that was just pushed');
  assert.match(NOTE_BODY, /serialize\(/,
    'the note crosses the boundary unserialised — a Date and an ObjectId would not survive');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. THE CLIENTS SUPPLY THE BODY AND NOTHING ELSE
// ════════════════════════════════════════════════════════════════════════════

test('NEITHER client constructs a note entry of its own', () => {
  /**
   * ══ THE DEFECT, AS AN ABSENCE ═════════════════════════════════════════════
   *
   * This is the exact literal that was on screen for the reported note. Banning
   * the SHAPE rather than the string: any object literal that names `authorName`
   * in a client file is a client deciding who wrote a note, which is the thing
   * that cannot be allowed to come back.
   */
  for (const src of CLIENTS) {
    assert.ok(!src.code.includes('authorName'),
      `${src.rel} names authorName — a client must not construct or override a byline`);
    assert.ok(!src.code.includes('authorId'),
      `${src.rel} names authorId — same reason`);
  }
});

test('both clients append the SERVER entry, through the SAME reader as the load', () => {
  /**
   * Not merely "they use res.note" — they run it through `readNotes`, which is
   * what makes an appended note and a reloaded one identical in shape. Two
   * constructions of one thing is what the defect was.
   */
  for (const src of CLIENTS) {
    assert.match(src.code, /setInternalNotes\(\(prev\) => \[\.\.\.prev, \.\.\.readNotes\(\[res\.note \?\? \{ body \}\]\)\]\)/,
      `${src.rel} does not append the server's entry through readNotes`);
    // …and the initial load uses the same reader, which is the other half of
    // "the two paths cannot disagree".
    assert.match(src.code, /useState\(\s*\(\) => readNotes\(/,
      `${src.rel} no longer seeds its notes through readNotes`);
  }
});

test('CONTROL: the probe reads CODE, and can find what it claims to look for', () => {
  /**
   * Every assertion above is an absence or a regex, and both pass against a
   * probe that is reading the wrong text. `readSource(...).code` strips comments
   * — and the round-13 docstrings at both call sites QUOTE the banned literal
   * while explaining why it is gone, so against raw source the absence test
   * would fail on correct code.
   */
  assert.ok(PUBLIC.raw.includes("authorName: ''"),
    'the raw source no longer quotes the old echo — this control has nothing to prove');
  assert.ok(!PUBLIC.code.includes("authorName: ''"),
    'the comment stripper is not running — the absence assertions read prose');
  // …and the scanned code is real code, not an empty string.
  assert.ok(PUBLIC.code.length > 10_000, 'readSource returned almost nothing');
  assert.ok(PUBLIC.code.includes('handleAddNote'), 'the probe cannot see a function known to be there');
  assert.ok(NOTE_BODY.length > 200 && NOTE_BODY.length < 4000,
    `the action slice is ${NOTE_BODY.length} bytes — the bounds are wrong, not the code`);
});
