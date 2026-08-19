import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_AUTHOR_NAME,
  NOTE_MAX_LENGTH,
  buildNoteEntry,
  isLegacyStringNote,
  normalizeNoteBody,
  readNotes,
} from '@/lib/registrations/internalNotes';

/**
 * THE INTERNAL-NOTE SHAPE, AND THE EXPAND-PHASE READER.
 *
 * Driven directly because the interesting cases are DATA SHAPES — a legacy
 * String, an array with a hole in it, a body of whitespace — and a render test
 * would need a fixture per case while asserting the same function through three
 * layers of JSX.
 *
 * The reader tolerating BOTH shapes is what makes the deploy and the migration
 * independent of each other, so its two branches are the heart of this file.
 */

// ── 1. normalizeNoteBody ────────────────────────────────────────────────────

test('a body of whitespace normalises to the empty string', () => {
  // The action tests THIS RESULT rather than the raw input, so "is it empty" is
  // asked of the exact string that would have been stored. Testing the input
  // instead lets '   ' through and stores '' — a byline attached to nothing.
  for (const empty of ['', '   ', '\t\n', undefined, null]) {
    assert.equal(normalizeNoteBody(empty), '');
  }
});

test('a body is trimmed and capped', () => {
  assert.equal(normalizeNoteBody('  hello  '), 'hello');
  assert.equal(normalizeNoteBody('x'.repeat(NOTE_MAX_LENGTH + 500)).length, NOTE_MAX_LENGTH);
});

// ── 2. buildNoteEntry ───────────────────────────────────────────────────────

test('an entry carries body, authorId, authorName and createdAt', () => {
  const at = new Date('2026-08-19T10:00:00.000Z');
  const entry = buildNoteEntry({ body: 'x', authorId: 'u1', authorName: 'สมชาย', createdAt: at });
  assert.deepEqual(entry, { body: 'x', authorId: 'u1', authorName: 'สมชาย', createdAt: at });
});

test('a missing author becomes the empty string, never undefined', () => {
  /**
   * `undefined` is DROPPED by Mongoose from an update object, so an entry built
   * without an author would be pushed with the KEY ABSENT — and the note would
   * render a blank byline that no assertion looking for a name can distinguish
   * from a name that failed to load.
   */
  const entry = buildNoteEntry({ body: 'x', createdAt: new Date(0) });
  assert.equal(entry.authorId, '');
  assert.equal(entry.authorName, '');
  assert.ok('authorId' in entry && 'authorName' in entry, 'a key went missing rather than being empty');
});

// ── 3. readNotes — THE EXPAND-PHASE READER ──────────────────────────────────

test('an absent field reads as an empty list', () => {
  for (const nothing of [undefined, null]) {
    assert.deepEqual(readNotes(nothing), []);
  }
});

test('THE LEGACY BRANCH: a plain String reads as ONE entry', () => {
  /**
   * This is what makes the deploy independent of the migration. A document the
   * migration has not reached still renders its note, and a rollback strands
   * nothing.
   */
  const at = new Date('2024-01-01T00:00:00.000Z');
  const notes = readNotes('คุยกับลูกค้าแล้ว', { legacyCreatedAt: at });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, 'คุยกับลูกค้าแล้ว');
  assert.equal(notes[0].authorId, '');
  assert.equal(notes[0].authorName, LEGACY_AUTHOR_NAME, 'a legacy note has no named author placeholder');
  assert.equal(notes[0].createdAt, at);
});

test('a legacy note with no timestamp gets null, NOT "now"', () => {
  /**
   * Dating a 2024 note to today would be wrong in a direction that looks
   * precise. `null` renders no date at all, which is the honest answer.
   */
  assert.equal(readNotes('x')[0].createdAt, null);
});

test('an EMPTY legacy string reads as no notes, not as one blank note', () => {
  for (const empty of ['', '   ']) {
    assert.deepEqual(readNotes(empty), [], 'an empty String produced a note with no body');
  }
});

test('THE ARRAY BRANCH: entries pass through, normalised', () => {
  const at = new Date('2026-08-19T10:00:00.000Z');
  const notes = readNotes([
    { body: '  first  ', authorId: 'u1', authorName: 'ก', createdAt: at },
    { body: 'second', authorId: 'u2', authorName: 'ข', createdAt: at },
  ]);
  assert.equal(notes.length, 2);
  assert.equal(notes[0].body, 'first', 'the body was not trimmed');
  assert.equal(notes[1].authorName, 'ข');
  // ORDER IS PRESERVED. The list is append-only, so its order is its chronology
  // and a reader that sorted or reversed would be inventing one.
  assert.deepEqual(notes.map((n) => n.body), ['first', 'second']);
});

test('an array entry with no body is DROPPED, not rendered as a byline', () => {
  const notes = readNotes([
    { body: 'real', authorName: 'ก' },
    { body: '   ', authorName: 'ข' },
    { body: '', authorName: 'ค' },
    null,
    undefined,
  ]);
  assert.deepEqual(notes.map((n) => n.body), ['real'],
    'a note with no text survived — that renders an author attached to nothing');
});

test('an array entry with a missing author gets the empty string', () => {
  const [note] = readNotes([{ body: 'x' }]);
  assert.equal(note.authorId, '');
  assert.equal(note.authorName, '');
  assert.equal(note.createdAt, null);
});

test('CONTROL: the two branches are genuinely distinguishable', () => {
  /**
   * Both branches return an array of the same shape, so a reader that had
   * accidentally collapsed them — treating the String as a one-character array,
   * say — would still satisfy most of the assertions above. The author is what
   * separates them: only the legacy branch stamps the placeholder.
   */
  const legacy = readNotes('a note');
  const modern = readNotes([{ body: 'a note' }]);
  assert.equal(legacy[0].body, modern[0].body, 'the fixture is not comparing like with like');
  assert.notEqual(legacy[0].authorName, modern[0].authorName,
    'the legacy and array branches produce identical entries — one of them is not running');
  assert.equal(modern[0].authorName, '', 'an array entry gained the legacy placeholder');
});

test('a String is NOT mistaken for an array of characters', () => {
  // `Array.isArray('abc')` is false, but a reader written with `[...stored]`
  // or `stored.map` would split it into characters and produce three notes.
  assert.equal(readNotes('abc').length, 1);
});

// ── 4. isLegacyStringNote — what the migration filters on ───────────────────

test('isLegacyStringNote is true only for a non-empty String', () => {
  assert.equal(isLegacyStringNote('x'), true);
  assert.equal(isLegacyStringNote('  x  '), true);
  assert.equal(isLegacyStringNote(''), false, 'an empty string is not a note to migrate');
  assert.equal(isLegacyStringNote('   '), false);
  assert.equal(isLegacyStringNote([]), false);
  assert.equal(isLegacyStringNote([{ body: 'x' }]), false, 'an already-migrated array read as legacy');
  assert.equal(isLegacyStringNote(undefined), false);
  assert.equal(isLegacyStringNote(null), false);
});

// ── 5. The contract phase has NOT happened ──────────────────────────────────

test('THE STRING BRANCH IS STILL PRESENT — the narrowing is a later commit', () => {
  /**
   * Expand / migrate / contract. Removing the legacy branch is the CONTRACT step
   * and must be last and alone, after `--apply` has run and been confirmed —
   * doing it in the same deploy as the expand leaves no rollback.
   *
   * This assertion exists so that removal is a DELIBERATE red test rather than a
   * tidy-up nobody notices. When the contract commit lands, this test is deleted
   * in it, on purpose, along with the legacy-branch tests above.
   */
  assert.equal(readNotes('legacy').length, 1,
    'the String branch was removed — if that was the contract step, delete this test in that commit');
});
