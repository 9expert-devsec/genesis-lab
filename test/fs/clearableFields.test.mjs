import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Which fields a save can CLEAR, and which it deliberately cannot.
 *
 * Four call sites shared one shape — `x = value || undefined` — and one
 * consequence: the key left the payload, so the old value survived the save and
 * "clear this" was a silent no-op. They do NOT share one fix, because the
 * channel that means "leave alone" is the same channel `undefined` uses, and
 * what should replace it depends entirely on the field's type:
 *
 *   adminNotes      String, no cast   → ''    the empty string IS the value
 *   notes           String, no cast   → ''
 *   previous_course ObjectId, optional → null  '' is a CAST ERROR, verified
 *   program         ObjectId, required → stays `|| undefined`, NOT clearable
 *
 * ── WHY previous_course IS null AND NOT '' ──────────────────────────────────
 * Probed read-only against MSDB's real schema with `validateSync()`, no
 * connection and no write:
 *
 *   previous_course: null   → accepted, stored null   (the path's own default)
 *   previous_course: ''     → REJECTED, "Cast to ObjectId failed for value \"\""
 *
 * So the string fix applied to the ref field would have turned a silent no-op
 * into a 400 on every clear — worse, and only visible in production.
 *
 * ── WHY program IS THE ODD ONE OUT ──────────────────────────────────────────
 * A course with no program drops out of the mega menu, the /schedule grouping
 * and all-courses at once. That ruling was MEASURED rather than assumed: 0 of
 * the 77 upstream courses have an empty program, so nothing currently depends
 * on clearing it. MSDB would happily accept null — its `program` path is not
 * `required` — which is exactly why the guard has to be here and in the form.
 *
 * A text scan: these are `'use server'` modules whose exports are POST
 * endpoints and whose imports reach next-auth, so there is nothing a unit test
 * can call. The rendered behaviour that CAN be reached is tested in the render
 * tier; this file guards the payload channel.
 */

const COURSES = readSource('src/lib/actions/courses.js');
const INHOUSE = readSource('src/lib/actions/inhouse-registrations.js');
const PUBLIC_REG = readSource('src/lib/actions/registrations.js');
const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');

// ── B1: the two plain strings ───────────────────────────────────────────────

/**
 * ── `adminNotes` IS NO LONGER A CLEARABLE FIELD, AND THAT IS DELIBERATE ─────
 *
 * This asserted that `updateInhouseAdminNotes` wrote `String(x ?? '')` rather
 * than `x || undefined`, so that emptying the box actually cleared the note —
 * Mongoose drops an undefined value from an update object, so the old note used
 * to survive the save.
 *
 * THE ACTION IS DELETED AND THE FIELD IS NOW AN APPEND-ONLY ARRAY. There is no
 * box to empty and no way to clear a note, by design: clearing was the overwrite
 * defect in its mildest form — the second writer erasing the first's work with
 * no record that it happened.
 *
 * So this test is REMOVED rather than re-pointed, because its claim no longer
 * has a subject. The `|| undefined` lesson it encoded is not lost: the sibling
 * assertions in this file still hold it for the fields that ARE clearable, and
 * `addInternalNote` has no `undefined` path at all — it refuses an empty body
 * instead of storing one, which fs/internalNotesAppendOnly asserts.
 *
 * Recorded here rather than deleted silently: "the old test said you could clear
 * it" is exactly the kind of thing a future reader finds and tries to restore.
 */

test('registration notes writes the trimmed string, so clearing clears', () => {
  assert.match(
    PUBLIC_REG.code,
    /update\.notes\s*=\s*String\(data\.notes\s*\?\?\s*''\)\.trim\(\)\.slice\(0,\s*500\);/,
    'update.notes is not written as a bare string'
  );
  assert.doesNotMatch(
    PUBLIC_REG.code,
    /update\.notes\s*=[^;\n]*\|\|\s*undefined/,
    'update.notes fell back to undefined again'
  );
});

test('CONTROL: a caller that never mentions notes still leaves them untouched', () => {
  // THE control for B1. Writing '' unconditionally would blank every note on
  // every partial update; the `!== undefined` gate is what keeps "absent" and
  // "explicitly empty" different, and it has to survive the fix.
  assert.match(
    PUBLIC_REG.code,
    /if\s*\(data\.notes\s*!==\s*undefined\)\s*\{[\s\S]{0,200}?update\.notes\s*=/,
    'the notes write is no longer gated on the caller having mentioned the field'
  );
});

// ── B2: the optional ref ────────────────────────────────────────────────────

test('previous_course falls back to null, so "— ไม่มี —" clears it', () => {
  assert.match(
    COURSES.code,
    /previous_course:\s*toStr\(get\('previous_course'\)\)\s*\|\|\s*null/,
    'previous_course does not fall back to null'
  );
});

test('CONTROL: previous_course is not cleared with an empty string', () => {
  // '' is a cast error on an ObjectId path — verified against MSDB's schema.
  // This pins that the B1 fix was not copy-pasted onto the ref field.
  assert.doesNotMatch(
    COURSES.code,
    /previous_course:\s*toStr\(get\('previous_course'\)\)\s*(?:\|\||\?\?)\s*''/,
    "previous_course clears with '' — MSDB rejects that with a cast error"
  );
});

// ── B3: the field that must NOT become clearable ────────────────────────────

test('CONTROL: program still omits the key when empty — absent means untouched', () => {
  // The load-bearing control for the whole file. If the clearing fixes had been
  // applied uniformly, this is the field that would have started being written
  // on every save, and an empty one would unset the program of any course
  // saved through a caller that did not know to send it.
  assert.match(
    COURSES.code,
    /program:\s*toStr\(get\('program'\)\)\s*\|\|\s*undefined/,
    'program no longer falls back to undefined — a cleared dropdown now clobbers it'
  );
  assert.doesNotMatch(
    COURSES.code,
    /program:\s*toStr\(get\('program'\)\)\s*\|\|\s*(?:null|'')/,
    'program was made clearable — that drops the course out of the menu, /schedule and all-courses'
  );
});

test('the program dropdown is required, so the no-op cannot be reached', () => {
  // Omitting the key is only safe because the form refuses to submit an empty
  // one. Without `required` the fix above is just a silent failure with a
  // comment on it.
  assert.match(
    FORM.code,
    /<select\b[^>]*name="program"[\s\S]{0,120}?\brequired\b/,
    'the program select is not required — an empty pick silently keeps the old program'
  );
});

test('CONTROL: the required probe is not satisfied by some other select', () => {
  // `required` appears on other inputs; prove the match is anchored to this one
  // by checking the field the ruling explicitly spared.
  assert.doesNotMatch(
    FORM.code,
    /<select\b[^>]*name="previous_course"[\s\S]{0,120}?\brequired\b/,
    'previous_course became required — it is the optional one, by design'
  );
});
