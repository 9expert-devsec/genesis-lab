import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noteByline, readNotes, buildNoteEntry, LEGACY_AUTHOR_NAME,
} from '@/lib/registrations/internalNotes';

/**
 * THE NOTE BYLINE — WHO, WHEN, OR NOTHING.
 *
 * ══ WHY THIS IS A PURE TEST AND NOT A RENDER ONE ════════════════════════════
 *
 * The decision the defect turned on is a STRING decision: given a note, what
 * does the byline say, and is there one at all. Making that claim through a
 * component means rendering two whole detail screens to ask a question about
 * two fields, and it means the assertion is bound to markup that a restyle can
 * move. The rendering half — that an empty byline emits NO ELEMENT — is asserted
 * in render/internalNoteByline, over the component, where it belongs.
 *
 * ══ THE DEFECT THIS FILE EXISTS FOR ═════════════════════════════════════════
 *
 * A saved internal note rendered a bare `—` where its author and time belong.
 * `scripts/audit-internal-note-bylines.mjs` (read-only) established that the
 * STORED note carried `authorName`, `authorId` and `createdAt`, all populated —
 * so the write path and round 6's denormalisation were both fine, and the
 * failure was that the CLIENT appended an echo of its own with those three
 * fields blank and then never replaced it.
 *
 * Two things came out of that and both are asserted here: a byline with nothing
 * to say returns '', and NOTHING anywhere invents an author.
 */

const fmt = (d) => `[${new Date(d).toISOString().slice(0, 10)}]`;

// ════════════════════════════════════════════════════════════════════════════
// 1. WHAT IT SAYS
// ════════════════════════════════════════════════════════════════════════════

test('a complete note reads WHO · WHEN, in that order', () => {
  // The order is the claim, not just the content: the author is the thing a
  // reader of an append-only log is looking for, and the time qualifies it.
  assert.equal(
    noteByline({ authorName: 'Yanisa P.', createdAt: '2026-08-21T07:36:14.339Z' }, fmt),
    'Yanisa P. · [2026-08-21]',
  );
});

test('a name with no time renders the name, and no dangling separator', () => {
  assert.equal(noteByline({ authorName: 'Yanisa P.', createdAt: null }, fmt), 'Yanisa P.');
});

test('a time with no name renders the time, and no leading separator', () => {
  /**
   * `detailHeading`'s trailing-colon defect in miniature: the obvious spelling
   * is `${who} · ${when}`, which produces ` · [2026-08-21]` for a note whose
   * author was never recorded — a separator pointing at nothing, which reads as
   * a value that failed to load.
   */
  assert.equal(noteByline({ authorName: '', createdAt: '2026-08-21T07:36:14.339Z' }, fmt), '[2026-08-21]');
});

test('a note with NEITHER returns the empty string — never a dash', () => {
  /**
   * ══ ROUND 5'S RULE, APPLIED TO THE OPPOSITE SITUATION ═════════════════════
   *
   * `update — → —` established it: whatever cannot be shown renders NO ELEMENT.
   * There the emptiness was deliberate (field diffs carry PII); here it never
   * is, because a byline is the point of an append-only log. The RENDERING is
   * the same either way, and the reason it must be is that a dash makes a claim
   * — "we looked and there is nothing" — which was false in this case: the data
   * was in the database the whole time.
   */
  for (const note of [
    { authorName: '', createdAt: null },
    { authorName: null, createdAt: undefined },
    { authorName: '   ', createdAt: null },
    {},
    null,
    undefined,
  ]) {
    assert.equal(noteByline(note, fmt), '', `returned something for ${JSON.stringify(note)}`);
    assert.ok(!noteByline(note, fmt).includes('—'), 'a dash came back from the byline');
  }
});

test('a formatter that returns nothing does not leave a separator behind', () => {
  // The date is present but unformattable — a null formatter, a bad value. The
  // byline degrades to the name alone rather than to `name · `.
  assert.equal(noteByline({ authorName: 'Yanisa P.', createdAt: 'x' }, () => ''), 'Yanisa P.');
  assert.equal(noteByline({ authorName: 'Yanisa P.', createdAt: 'x' }, () => null), 'Yanisa P.');
  assert.equal(noteByline({ authorName: '', createdAt: 'x' }, () => ''), '');
});

test('CONTROL: the formatter really is being called', () => {
  // Every assertion above would also hold if the date half were dead code. This
  // is what says the `when` branch is reached and uses the injected formatter
  // rather than a second one hidden in the module.
  const seen = [];
  noteByline({ authorName: 'A', createdAt: 'STAMP' }, (d) => { seen.push(d); return 'F'; });
  assert.deepEqual(seen, ['STAMP'], 'the formatter was not called with the stored value');
  assert.equal(noteByline({ authorName: 'A', createdAt: 'STAMP' }, () => 'F'), 'A · F');
});

// ════════════════════════════════════════════════════════════════════════════
// 2. NOTHING INVENTS AN AUTHOR
// ════════════════════════════════════════════════════════════════════════════

test('an unattributed ARRAY note stays unattributed — no fallback name', () => {
  /**
   * THE INSTRUCTION, ASSERTED. A note saved without an author is unattributed,
   * and attributing it to whoever happens to be looking would make the record
   * say something false. `LEGACY_AUTHOR_NAME` is the ONE synthesised name in
   * this module and it applies to the pre-migration STRING shape alone, where
   * it says out loud that it does not know.
   */
  const [note] = readNotes([{ body: 'ก', authorId: '', authorName: '', createdAt: null }]);
  assert.equal(note.authorName, '', 'readNotes supplied a name for an array note that had none');
  assert.equal(noteByline(note, fmt), '', 'the byline invented something for an unattributed note');
  assert.notEqual(note.authorName, LEGACY_AUTHOR_NAME,
    'the legacy placeholder leaked onto an array note — it is for the String shape only');
});

test('…and the LEGACY STRING shape still gets its named placeholder', () => {
  // The control for the assertion above: the synthesised name exists, it is
  // reachable, and it is reachable from exactly one branch.
  const [legacy] = readNotes('a note written before the array existed');
  assert.equal(legacy.authorName, LEGACY_AUTHOR_NAME);
  assert.ok(noteByline(legacy, fmt).startsWith(LEGACY_AUTHOR_NAME),
    'the legacy note lost the placeholder that says we do not know');
});

// ════════════════════════════════════════════════════════════════════════════
// 3. THE SHAPE THE ROUND-13 REPLY TRAVELS IN
// ════════════════════════════════════════════════════════════════════════════

test('the server entry and a reloaded one produce the SAME byline', () => {
  /**
   * ══ THE PROPERTY THE FIX TURNS ON ═════════════════════════════════════════
   *
   * `handleAddNote` appends `readNotes([res.note])` and the initial load is
   * `readNotes(doc.adminNotes)`. Running the reply through the SAME reader is
   * what makes "the note you just added" and "the note after a reload"
   * indistinguishable — the old echo was a second, lossier construction of the
   * same thing, and the whole defect was that the two disagreed.
   */
  const stamped = buildNoteEntry({
    body: 'test note',
    authorId: '6a0fc39e5fc32aec01d7d7f9',
    authorName: 'Yanisa P.',
    createdAt: new Date('2026-08-21T07:36:14.339Z'),
  });
  // The reply crosses the server boundary as JSON, exactly as `serialize` sends
  // it — a Date becomes a string, and the reader must not care.
  const overTheWire = JSON.parse(JSON.stringify(stamped));

  const [appended] = readNotes([overTheWire]);
  const [reloaded] = readNotes([overTheWire]);
  assert.equal(noteByline(appended, fmt), 'Yanisa P. · [2026-08-21]');
  assert.deepEqual(appended, reloaded);
});

test('a reply with no note at all degrades to the body, and says nothing false', () => {
  /**
   * The fallback: `readNotes([res.note ?? { body }])`. An older server, or a
   * reply that lost the field, produces an entry with a body and no byline —
   * which renders the note and NO element beneath it. That is the honest
   * degradation, and it is only honest because the dash is gone.
   */
  const [fallback] = readNotes([{ body: 'test note' }]);
  assert.equal(fallback.body, 'test note');
  assert.equal(noteByline(fallback, fmt), '');
});

test('CONTROL: readNotes drops an entry with no body, so the fallback cannot be blank', () => {
  // If `body` were empty too, the fallback would append a byline attached to
  // nothing. It does not: the reader filters it out and the list is unchanged.
  assert.deepEqual(readNotes([{ body: '' }]), []);
  assert.deepEqual(readNotes([{ body: '   ' }]), []);
  assert.deepEqual(readNotes([undefined]), []);
  // …and a real body IS kept, so the emptiness above is about the body rather
  // than about the reader rejecting everything.
  assert.equal(readNotes([{ body: 'ก' }]).length, 1);
});
