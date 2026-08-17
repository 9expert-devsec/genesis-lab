import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkboxBool, courseTypeFlags } from '@/lib/courses/courseTypeFlags';

/**
 * Unchecking "Public (เผยแพร่บนเว็บ)" must SAVE as unchecked.
 *
 * Traced hop by hop against COPILOT-STU: the payload already carried
 * `course_type_public: true` the moment it was shaped, so MSDB stored exactly
 * what it was sent. The bug was the discriminator on the legacy-compat branch —
 * `explicitPublic != null` asked "did the new form post this?" using a value
 * that is `null` BOTH for "unchecked" and for "this dialect has no such field".
 *
 * The pairing below is the whole claim, and neither half is worth anything
 * alone: unchecked must become `false`, and an absent key under the LEGACY
 * dialect must NOT be forced to `false`. A fix that simply coerced every
 * missing checkbox would pass the first and fail the second.
 */

// ── the fix ─────────────────────────────────────────────────────────────────

test('unchecked Public is false — the reported bug', () => {
  // An unchecked HTML checkbox contributes nothing to the submission, so the
  // raw value really is null. This is the exact input the browser produces.
  const { isPublic } = courseTypeFlags({
    courseType:   null,
    publicField:  null,
    inhouseField: 'on',
  });
  assert.equal(isPublic, false, 'unchecking Public still saved as public');
});

test('checked Public is true', () => {
  const { isPublic } = courseTypeFlags({ courseType: null, publicField: 'on' });
  assert.equal(isPublic, true);
});

test('both boxes unchecked gives both flags false', () => {
  // The old code returned isPublic TRUE here — `'' !== 'inhouse'`.
  assert.deepEqual(
    courseTypeFlags({ courseType: null, publicField: null, inhouseField: null }),
    { isPublic: false, isInhouse: false }
  );
});

test('course_type_inhouse unchecks too — the sibling that passed by luck', () => {
  // Its legacy fallback (`courseType === 'inhouse'`) happened to yield false,
  // the same answer "unchecked" wanted, which is why only one field was
  // reported. Pinned so a future edit cannot reintroduce the asymmetry.
  const { isInhouse } = courseTypeFlags({
    courseType:   null,
    publicField:  'on',
    inhouseField: null,
  });
  assert.equal(isInhouse, false);
});

// ── THE CONTROL ─────────────────────────────────────────────────────────────

test('CONTROL: under the legacy dialect an absent checkbox is NOT forced false', () => {
  // `course_type` posted means a legacy caller that has no checkboxes at all.
  // Both flags must come from it. Without this, the fix above is satisfied by
  // "every missing checkbox is false", which would silently unpublish every
  // course a legacy caller touches.
  assert.deepEqual(
    courseTypeFlags({ courseType: 'public', publicField: null, inhouseField: null }),
    { isPublic: true, isInhouse: false },
    'legacy course_type=public was overridden by absent checkboxes'
  );
  assert.deepEqual(
    courseTypeFlags({ courseType: 'inhouse', publicField: null, inhouseField: null }),
    { isPublic: false, isInhouse: true },
    'legacy course_type=inhouse was overridden by absent checkboxes'
  );
});

test('CONTROL: the legacy dialect ignores the checkboxes even when they ARE set', () => {
  // Pins which side wins, so the two dialects can never blend into a rule that
  // depends on submission order.
  assert.deepEqual(
    courseTypeFlags({ courseType: 'inhouse', publicField: 'on', inhouseField: 'on' }),
    { isPublic: false, isInhouse: true }
  );
});

// ── the checkbox truthiness rule, single-sourced ────────────────────────────

test('checkboxBool accepts the values a form and a plain object can carry', () => {
  for (const v of ['on', 'true', '1', true]) assert.equal(checkboxBool(v), true, String(v));
  for (const v of [null, undefined, '', 'off', 'false', '0', false]) {
    assert.equal(checkboxBool(v), false, String(v));
  }
});

test('CONTROL: checkboxBool does not treat every non-empty string as checked', () => {
  // The naive `Boolean(v)` fix would pass every test above and turn the string
  // 'false' into true — the shape that put "Inhouse Only .-" on four surfaces.
  assert.equal(checkboxBool('false'), false);
  assert.equal(checkboxBool('off'), false);
});
