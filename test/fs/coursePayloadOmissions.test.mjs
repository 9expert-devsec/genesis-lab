import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The course payload's two channels, kept distinct.
 *
 * `shapePayload` speaks to MSDB through `JSON.stringify`, and that gives it
 * exactly two ways to say something about a field:
 *
 *   VALUE PRESENT  → MSDB's `findByIdAndUpdate(id, body)` writes it. `false`,
 *                    `0`, `''` and `null` are all values and are all written.
 *   KEY UNDEFINED  → `JSON.stringify` drops the key, MSDB never sees it, and
 *                    the stored value is LEFT ALONE.
 *
 * The Public-checkbox fix moved the five booleans firmly into the first
 * channel. This guard is the other half: it pins that the fix did NOT drag the
 * deliberately-omitted fields along with it. Widening "absent means false" to
 * every field would make each save write all 30 keys, and a partial caller
 * would clobber whatever it did not know to send.
 *
 * A text scan, not a behavioural test: `shapePayload` is module-private inside
 * a `'use server'` file, which cannot export a sync function for a test to
 * call. The behaviour that CAN be reached lives in lib/courses/courseTypeFlags
 * and is tested there; this file guards the wiring around it.
 */

const SRC = readSource('src/lib/actions/courses.js');

test('shapePayload decides the flags through courseTypeFlags', () => {
  assert.match(
    SRC.code,
    /const\s*\{\s*isPublic,\s*isInhouse\s*\}\s*=\s*courseTypeFlags\(/,
    'the flags are no longer decided by the shared helper'
  );
});

test('the checkbox value is never used as the dialect discriminator again', () => {
  // The exact defect: `explicitPublic != null ? … : courseType !== 'inhouse'`.
  // An unchecked box is null, so this reads "legacy caller" on every uncheck.
  assert.doesNotMatch(
    SRC.code,
    /course_type_public'?\)?\s*!=\s*null|explicitPublic\s*!=\s*null/,
    'the checkbox value is being used to detect the legacy dialect again'
  );
  assert.doesNotMatch(
    SRC.code,
    /explicitInhouse\s*!=\s*null/,
    'same defect on the in-house flag'
  );
});

test('all five รูปแบบคอร์ส booleans are emitted unconditionally', () => {
  // Emitted as a plain `key: value` in the returned literal — never behind a
  // spread or a conditional, which would put them back in the "leave alone"
  // channel and make the boxes one-way switches again.
  for (const key of [
    'course_type_public',
    'course_type_inhouse',
    'course_workshop_status',
    'course_certificate_status',
    'course_promote_status',
  ]) {
    assert.match(SRC.code, new RegExp(`\\n\\s*${key}:\\s*\\S`), `${key} is not emitted`);
  }
});

/**
 * THE LEAVE-ALONE ROSTER — the current claim, stated explicitly because it has
 * now changed twice.
 *
 *   originally  program + previous_course were asserted here together
 *   3abbe70     previous_course LEFT the roster (`|| null`, deliberately: an
 *               optional prerequisite has to be removable). This guard failed
 *               on that change, which is exactly what it is for; the claim was
 *               narrowed to program and the null semantics moved to
 *               test/fs/clearableFields.test.mjs.
 *   now         FOUR MORE JOIN IT. Section 8's inputs were removed from the
 *               form, so the payload stops mentioning them entirely.
 *
 * Removing the inputs alone would have been the data-loss bug: `linesOf`
 * returns `[]` for a missing key, never undefined, so every save would have
 * shipped four empty arrays into an unfiltered `findByIdAndUpdate` — measured
 * before the change, 74 of the 77 upstream courses carry a course_doc_paths URL
 * and 2 carry exam_links.
 *
 *   now (2)     `website_urls` JOINS IT. Section 8 is gone entirely — it was
 *               the last field in it. Being publicly read is what made the
 *               editor worth keeping, not what makes the payload send it: both
 *               readers work off the STORED value, which omitting preserves.
 *
 * So the roster is program plus all five of the old section 8. The section-7
 * arrays are the control: they must still be sent, or "omit everything" would
 * satisfy every assertion here.
 */
const OMITTED = [
  'program',
  'course_doc_paths',
  'course_lab_paths',
  'course_case_study_paths',
  'exam_links',
  'website_urls',
];

test('CONTROL: program is still OMITTED when empty', () => {
  // `program` is the original member of the roster. If a clearing fix were
  // generalised across the payload, this is the field that would start being
  // written on every save — and `program: ''` is not a clearing instruction to
  // MSDB, it is a cast error on an ObjectId ref.
  assert.match(
    SRC.code,
    /program:\s*toStr\(get\('program'\)\)\s*\|\|\s*undefined/,
    'program no longer falls back to undefined — it would now be written on every save'
  );
});

test('the five removed section-8 fields are not emitted at all', () => {
  // Absent, not empty. A `key: linesOf(...)` line puts the field back in the
  // value channel with `[]` as its value, which is a wipe, not a no-op.
  for (const key of OMITTED.slice(1)) {
    assert.doesNotMatch(
      SRC.code,
      new RegExp(`\\n\\s*${key}:\\s*`),
      `${key} is emitted again — an empty array here overwrites real upstream data`
    );
  }
});

test('the five removed fields have no input left in the form', () => {
  // The other half: an input still posting the value while the payload ignores
  // it would look like a working editor that silently saves nothing.
  const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');
  for (const key of OMITTED.slice(1)) {
    assert.doesNotMatch(
      FORM.code,
      new RegExp(`name="${key}"`),
      `${key} still has a form input but the payload drops it — the editor would be a no-op`
    );
  }
});

test('website_urls is omitted, NOT sent empty — the 74-course wipe', () => {
  // `linesOf` returns `[]` for a missing key, never undefined. Removing the
  // input while leaving `website_urls: linesOf(...)` in place would have sent
  // an empty array on every save into MSDB's unfiltered findByIdAndUpdate, and
  // 74 of the 77 courses carry a URL there. The public readers
  // (ArticleDetailClient.jsx:712, career-paths.js:286) keep working because
  // they read the STORED value, which omitting is exactly what preserves.
  assert.doesNotMatch(
    SRC.code,
    /website_urls:\s*linesOf\(/,
    'website_urls is being SENT again — an empty array here blanks 74 courses'
  );
});

test('CONTROL: the section-7 arrays are untouched and still sent', () => {
  // THE control for this file. A shapePayload that returned {} — or an "omit
  // everything" edit — would satisfy every doesNotMatch above. These are the
  // fields that must still travel, from a section this change never went near.
  for (const key of ['course_objectives', 'bullets', 'training_topics']) {
    assert.match(
      SRC.code,
      new RegExp(`\\n\\s*${key}:\\s*\\S`),
      `${key} stopped being sent — this change should not have touched it`
    );
  }
});

test('CONTROL: the control above can distinguish the two channels', () => {
  // Proves the assertions are not both satisfied by any text: the booleans must
  // NOT carry `|| undefined`, which is what makes them the other channel.
  for (const key of ['course_type_public', 'course_type_inhouse']) {
    assert.doesNotMatch(
      SRC.code,
      new RegExp(`${key}:[^,\\n]*\\|\\|\\s*undefined`),
      `${key} is in the leave-alone channel — it can never be unchecked`
    );
  }
});
