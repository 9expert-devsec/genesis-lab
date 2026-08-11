import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * A successful save keeps the admin on the course they are editing.
 *
 * The navigation was a client-side `router.push('/admin/courses')` in the save
 * handler — not a `redirect()` in the server action, which only ever called
 * `revalidatePath`. So this is a shape guard on the handler: the branch that
 * decides "both halves landed" must not navigate, must re-baseline, and must
 * not refresh.
 *
 * A text scan because the handler is a click handler inside a client component
 * with two server actions behind it. What CAN be reached — whether a given pair
 * of results counts as success, and whether a given pair of snapshots counts as
 * dirty — is pure and tested in test/pure/courseSaveOutcome and
 * test/pure/courseFormDirty. This file pins the wiring between them.
 */

const SRC = readSource('src/app/admin/courses/_components/CourseForm.jsx');

/** The `if (outcome.allOk) { … }` block — the success branch, and only it. */
function successBranch(code) {
  const start = code.indexOf('if (outcome.allOk)');
  assert.notEqual(start, -1, 'the success branch is gone — has the save been rewritten?');
  const end = code.indexOf('setSaveReport(outcome)', start);
  assert.notEqual(end, -1, 'the partial-save branch is gone');
  return code.slice(start, end);
}

const SUCCESS = successBranch(SRC.code);

test('a successful save does NOT navigate away', () => {
  assert.doesNotMatch(
    SUCCESS,
    /router\.push/,
    'the edit page still leaves for /admin/courses after saving'
  );
});

test('a successful save does NOT call router.refresh', () => {
  // Deliberate: the course body is uncontrolled and the rail is useState-seeded,
  // so a refresh cannot update either without a REMOUNT — and a remount would
  // reset every field to whatever upstream returns, which after a just-written
  // save may not have caught up. See the comment at the branch.
  assert.doesNotMatch(SUCCESS, /router\.refresh/, 'a refresh can only reset fields here');
});

test('a successful save re-baselines the dirty snapshot', () => {
  assert.match(
    SUCCESS,
    /baselineRef\.current\s*=\s*snapshot\(\)/,
    'leaving after a successful save would still prompt'
  );
  assert.match(SUCCESS, /setDirty\(false\)/);
});

test('a successful save shows a success state', () => {
  assert.match(SUCCESS, /setSavedAt\(/, 'nothing tells the admin the save worked');
});

test('the success indicator is in the HEADER, above the scrolling column', () => {
  // The save button is in the header, so its answer must be too — a banner at
  // the bottom of a scrolling column is a message nobody sees.
  const header = SRC.code.slice(SRC.code.indexOf('<header'), SRC.code.indexOf('</header>'));
  assert.match(header, /บันทึกสำเร็จ/, 'the success message is not in the header');
  assert.match(header, /savedAt !== null && !dirty/, 'the message is not gated on being clean');
});

// ── the control ─────────────────────────────────────────────────────────────

test('CONTROL: a PARTIAL save does not navigate and does NOT re-baseline', () => {
  // The half-landed case. Re-baselining here would tell the admin their unsaved
  // work is saved; navigating would take them away from it. The branch must do
  // neither — it only records what happened.
  const partial = SRC.code.slice(SRC.code.indexOf('setSaveReport(outcome)'));
  const upToEnd = partial.slice(0, partial.indexOf('}'));
  assert.doesNotMatch(upToEnd, /router\.push/, 'a partial save navigates away');
  assert.doesNotMatch(upToEnd, /baselineRef\.current\s*=/, 'a partial save re-baselines — the warning is lost');
  assert.doesNotMatch(upToEnd, /setDirty\(false\)/, 'a partial save marks the form clean');
});

test('CONTROL: re-baselining exists exactly once in the save handler', () => {
  // Proves the assertion above is not passing merely because the string moved:
  // there is one re-baseline and it is the one inside the success branch.
  const handler = SRC.code.slice(SRC.code.indexOf('async function handleSubmit'));
  const body = handler.slice(0, handler.indexOf('\n  }\n'));
  assert.equal(
    (body.match(/baselineRef\.current\s*=\s*snapshot\(\)/g) ?? []).length,
    1
  );
});

test('CONTROL: the create page still navigates after a full create', () => {
  // UPDATED DELIBERATELY. This asserted the literal `router.push('/admin/
  // courses')`, which was right while create redirected to the list. It now
  // goes to the NEW COURSE'S EDITOR, derived from the `_id` MSDB returned —
  // `/admin/courses/<CODE>/edit` would be a 404 that reads as a missing
  // course. The claim it guards is unchanged: create still navigates on full
  // success, and this page still does not.
  assert.match(
    SRC.code,
    /router\.push\(\s*newId\s*\?[\s\S]{0,160}?\/edit`/,
    'the create page lost its post-create navigation'
  );
  assert.match(
    SRC.code,
    /encodeURIComponent\(newId\)/,
    'the redirect is not built from the returned _id'
  );
});
