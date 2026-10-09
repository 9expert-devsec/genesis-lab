import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { readSource, ROOT } from '../sourceScan.mjs';

/**
 * THE ATTENDEE CARDS EQUAL THE SELECTED COUNT — on first render, and after any
 * restore.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * The bundle wizard's กรอกข้อมูล step showed `จำนวนผู้สมัคร: 1` above TWO
 * cards (`ผู้เข้าอบรมท่านที่ 1`, `ผู้เข้าอบรมท่านที่ 2`), with
 * ผู้ประสานงานเป็นผู้เข้าอบรม unticked. The select and the `attendees` field
 * array were two sources of truth, reconciled by an effect that APPLIED A
 * DELTA — `append` once per missing row, against a `fields.length` captured in
 * the render that scheduled it. Any second invocation that still sees the
 * pre-append length applies the delta again, so a count of n yields 2n rows,
 * and `next.config.mjs` sets `reactStrictMode: true`, which is exactly such a
 * second invocation in development.
 *
 * It is a RECONCILIATION now: one `replace` to the required length. The
 * property this file asserts is therefore not "the effect converges" but "no
 * sequence of renders can land anywhere else".
 *
 * ── WHY A CHILD PROCESS FOR THE DRIVE ───────────────────────────────────────
 * Same reason as headerPropsParity and navSeeAllPosition: the row array is
 * built by an EFFECT, so `renderToStaticMarkup` sees zero cards whatever the
 * count says and can say nothing about this at all. `act` needs a development
 * React and this suite pins NODE_ENV=production, so the drive
 * (test/bundleAttendeeSeed.case.mjs) runs where the environment can be its own
 * and reports what is on screen; this file decides what the numbers must be.
 */

const CHILD = path.join(ROOT, 'test', 'bundleAttendeeSeed.case.mjs');
const run = spawnSync(process.execPath, [CHILD], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 180_000,
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, NODE_ENV: 'development' },
});
const R = run.status === 0 && run.stdout ? JSON.parse(run.stdout) : null;

test('the drive ran at all', () => {
  assert.equal(run.status, 0, `the drive exited ${run.status}:\n${run.stderr?.slice(-2000)}`);
  assert.notEqual(R, null, 'the drive printed nothing parseable');
  assert.equal(R.fresh.selectOptions, 20, 'the count select lost its options');
});

/**
 * ── THE CONTROL COMES FIRST, because every assertion below is "rows equal the
 * count" and that is also what a BLIND harness reports. The drive mounts the
 * delta shape the fix replaced and the reconciliation shape it uses, under the
 * same StrictMode, and the two must come back different. If they ever agree,
 * this file has stopped testing anything in either direction.
 */
test('CONTROL: the drive CAN see a delta-applying effect double up', () => {
  assert.equal(R.controlDelta.rows, 2, 'the delta shape no longer doubles — the drive is blind');
  assert.equal(R.controlReconcile.rows, 1, 'the reconciliation shape is not idempotent here');
});

// ── the rule, on every surface the step can be entered from ────────────────

/**
 * The scenarios where cards must equal the select exactly, and what each one
 * is. `coordinatorAttendingCountTwo` and `optedOutCountThree` are deliberately
 * NOT here — they are the two documented exceptions, asserted on their own
 * below.
 */
const EXACT = {
  fresh: 1,
  countOneTwoRows: 1,
  countThreeThreeRows: 3,
  wizardNoDraft_twoCourses: 1,
  wizardNoDraft_twoCourses_strict: 1,
  wizardNoDraft_fiveCourses: 1,
  wizardNoDraft_fiveCourses_strict: 1,
  wizardCountOneTwoRows_twoCourses: 1,
  wizardCountOneTwoRows_twoCourses_strict: 1,
  wizardCountOneTwoRows_fiveCourses: 1,
  wizardCountOneTwoRows_fiveCourses_strict: 1,
  wizardCountThreeThreeRows_twoCourses: 3,
  wizardCountThreeThreeRows_twoCourses_strict: 3,
  wizardCountThreeThreeRows_fiveCourses: 3,
  wizardCountThreeThreeRows_fiveCourses_strict: 3,
  strict_fresh: 1,
  strict_countOneTwoRows: 1,
  strict_countThreeThreeRows: 3,
};

test('cards == the select, in every scenario the step can be entered in', () => {
  for (const [name, expected] of Object.entries(EXACT)) {
    const r = R[name];
    assert.notEqual(r, undefined, `the drive did not report "${name}"`);
    assert.equal(r.selectValue, expected, `${name}: the select reads ${r.selectValue}`);
    assert.equal(
      r.cardCount, expected,
      `${name}: ${r.cardCount} cards under a select that says ${r.selectValue} — ${JSON.stringify(r.cardLabels)}`,
    );
  }
});

test('THE REPORTED SCREEN: a count of 1 is never two cards', () => {
  // Named on its own because it is the bug as it was seen, and because the
  // sweep above would still pass if this one entry were deleted from the table.
  for (const name of [
    'countOneTwoRows',
    'strict_countOneTwoRows',
    'wizardCountOneTwoRows_twoCourses',
    'wizardCountOneTwoRows_twoCourses_strict',
  ]) {
    assert.deepEqual(
      { select: R[name].selectValue, cards: R[name].cardCount },
      { select: 1, cards: 1 },
      `${name} still renders the mismatch`,
    );
    assert.deepEqual(R[name].cardLabels, ['ผู้เข้าอบรมท่านที่ 1']);
  }
});

test('the BUNDLE LEG COUNT does not reach the attendee count', () => {
  /**
   * One person or group registers for every course in a bundle, so the number
   * of items — and of legs the route later writes — is a storage detail. The
   * reported bundle had two courses and showed two cards, which is the
   * correlation this refutes: the same wizard, driven with two items and with
   * five, must answer the same.
   */
  for (const draft of ['wizardNoDraft', 'wizardCountOneTwoRows', 'wizardCountThreeThreeRows']) {
    const two = R[`${draft}_twoCourses`];
    const five = R[`${draft}_fiveCourses`];
    assert.equal(two.legCount, 2, 'the fixture no longer contrasts two items with five');
    assert.equal(five.legCount, 5, 'the fixture no longer contrasts two items with five');
    assert.equal(
      five.cardCount, two.cardCount,
      `${draft}: a five-course bundle drew ${five.cardCount} cards against ${two.cardCount} for two`,
    );
    assert.equal(five.selectValue, two.selectValue);
  }
});

// ── the two documented exceptions, which are rules and not drift ───────────

test("the coordinator's own slot is a mirror card, so count 2 draws ONE editable card", () => {
  // The public form's existing behaviour, unchanged: when the coordinator
  // attends, slot 1 is their read-only mirror and the editable cards start at
  // ท่านที่ 2. This is the one case where cards != count on purpose.
  for (const name of ['coordinatorAttendingCountTwo', 'strict_coordinatorAttendingCountTwo']) {
    assert.equal(R[name].selectValue, 2);
    assert.equal(R[name].cardCount, 1);
    assert.deepEqual(R[name].cardLabels, ['ผู้เข้าอบรมท่านที่ 2']);
  }
  assert.equal(R.coordinatorAttendingCountTwo.mirrorCard, true, 'the mirror card is gone');
});

test('the opt-out draws no cards at all, whatever the count says', () => {
  for (const name of ['optedOutCountThree', 'strict_optedOutCountThree']) {
    assert.equal(R[name].selectValue, 3);
    assert.equal(R[name].cardCount, 0);
  }
  assert.equal(R.optedOutCountThree.optOutNotice, true, 'the later-list notice is gone');
});

// ── a restore must not carry rows nobody can see ──────────────────────────

test('a restore with more rows than its count submits the count, not the rows', () => {
  /**
   * `countOneTwoRows` is a draft holding TWO attendee objects beside
   * `attendeesCount: 1` — reachable by setting the count to 2, filling both,
   * dropping it to 1 and leaving the step. The row beyond the count must not
   * survive into the payload.
   *
   * Asserted over the REGISTERED INPUTS rather than through a submit: this
   * form defaults `requestInvoice` true with no invoice object, so the schema
   * refuses it and `onSubmit` would never fire. The registered inputs ARE the
   * field array, so their indices are the payload.
   */
  for (const name of ['countOneTwoRows', 'strict_countOneTwoRows', 'wizardCountOneTwoRows_twoCourses']) {
    assert.equal(
      R[name].fieldArrayRows, 1,
      `${name}: ${R[name].fieldArrayRows} rows would be submitted under a count of 1`,
    );
  }
  // And a consistent restore keeps every row it legitimately has.
  assert.equal(R.countThreeThreeRows.fieldArrayRows, 3);
  assert.equal(R.optedOutCountThree.fieldArrayRows, 0, 'an opted-out draft still carries rows');
});

test('a restore reaches the form at all — otherwise the restores above prove nothing', () => {
  // The drive reads the draft out of sessionStorage through the WIZARD, which
  // is how the live page does it. If that path broke, every restore scenario
  // would silently become the `fresh` one and still pass.
  assert.equal(R.wizardCountThreeThreeRows_twoCourses.coordinatorName, 'C');
  assert.equal(R.wizardNoDraft_twoCourses.coordinatorName, '', 'the no-draft case picked up a draft');
});

// ── and the shape is pinned at the source, where the rule is written ──────

test('the reconciliation is ONE write to a target, not a loop of appends', () => {
  /**
   * The drive proves the behaviour; this pins the SHAPE, because the behaviour
   * can be restored to correctness by an effect that merely converges — and a
   * converging delta still renders the wrong thing for a frame, which is what
   * was reported. A `replace` to a computed target cannot.
   */
  const { code } = readSource('src/components/registration/AttendeesList.jsx');
  assert.match(code, /const \{ fields, replace \} = useFieldArray\(/, 'the field array no longer exposes replace');
  assert.match(code, /const target = listProvided \? required : 0;/, 'the target is no longer one number');
  assert.match(code, /replace\(\s*Array\.from\(\{ length: target \}/, 'the array is not rebuilt to the target');
  assert.equal(
    /\bappend\(/.test(code), false,
    'an append is back in this component — a delta cannot be idempotent',
  );
  assert.equal(
    /\bremove\(/.test(code), false,
    'a remove is back in this component — a delta cannot be idempotent',
  );
});

test('both consumers hand it the LIVE values, so a resize cannot wipe what is typed', () => {
  /**
   * `fields` from useFieldArray carry the values as of the last ARRAY
   * MUTATION, not the live ones, so rebuilding from them would clear rows 1
   * and 2 on the way from three attendees to two. `getValues` is threaded from
   * both forms for that reason, and a consumer that forgets it would shrink
   * the array by emptying it.
   */
  for (const rel of [
    'src/components/registration/BundleWizard.jsx',
    'src/components/registration/RegisterWizard.jsx',
  ]) {
    const { code } = readSource(rel);
    assert.match(code, /getValues=\{getValues\}/, `${rel} does not pass getValues to AttendeesList`);
    assert.match(code, /^\s*getValues,$/m, `${rel} does not take getValues off useForm`);
  }
  const { code } = readSource('src/components/registration/AttendeesList.jsx');
  assert.match(code, /getValues\?\.\('attendees'\)/, 'the component no longer reads the live values');
});
