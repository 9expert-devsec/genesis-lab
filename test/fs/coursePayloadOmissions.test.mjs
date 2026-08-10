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

test('CONTROL: program and previous_course are still OMITTED when empty', () => {
  // These two are the "leave alone" channel, and they must stay in it. If the
  // fix had generalised to "every absent field gets a value", these would start
  // being sent — and `program: ''` is not a clearing instruction to MSDB, it is
  // a cast error on an ObjectId ref.
  assert.match(
    SRC.code,
    /program:\s*toStr\(get\('program'\)\)\s*\|\|\s*undefined/,
    'program no longer falls back to undefined — it would now be written on every save'
  );
  assert.match(
    SRC.code,
    /previous_course:\s*toStr\(get\('previous_course'\)\)\s*\|\|\s*undefined/,
    'previous_course no longer falls back to undefined'
  );
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
