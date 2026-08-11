import { test } from 'node:test';
import assert from 'node:assert/strict';
import { courseSaveOutcome } from '@/lib/courses/courseSaveOutcome';

/**
 * One save button, two stores, and the claim it is allowed to make.
 *
 * The course editor writes MSDB (HTTP, another service) and the genesis-side
 * CourseExtension (local Mongo upsert). There is no transaction across them, so
 * a half-landed save is a real state and the UI must be able to say so.
 *
 * The failure this guards is the QUIET one: report success, navigate away, and
 * leave the meta description behind. `allOk` is the only success signal and it
 * is the joint condition — the controls below are what stop it drifting into
 * `courseOk || extOk`, which would pass every happy-path test ever written.
 */

const OK = { ok: true };
const FAIL = { ok: false, error: 'upstream 500' };

test('both halves ok is the only success', () => {
  const o = courseSaveOutcome({ courseResult: OK, extResult: OK });
  assert.equal(o.allOk, true);
  assert.equal(o.partial, false);
});

test('CONTROL: MSDB ok but the extension failed is NOT success', () => {
  const o = courseSaveOutcome({ courseResult: OK, extResult: FAIL });
  assert.equal(o.allOk, false, 'a failed second write reported success');
  assert.equal(o.partial, true);
  assert.equal(o.courseOk, true);
  assert.equal(o.extOk, false);
  assert.equal(o.extError, 'upstream 500', 'the failing half is not named');
});

test('CONTROL: the extension ok but MSDB failed is NOT success', () => {
  // The mirror case. Without it, `allOk = courseOk` would pass the test above.
  const o = courseSaveOutcome({ courseResult: FAIL, extResult: OK });
  assert.equal(o.allOk, false, 'a failed FIRST write reported success');
  assert.equal(o.partial, true);
  assert.equal(o.courseError, 'upstream 500');
  assert.equal(o.extError, null, 'the half that worked was given an error');
});

test('neither half ok is a failure and is not "partial"', () => {
  const o = courseSaveOutcome({ courseResult: FAIL, extResult: FAIL });
  assert.equal(o.allOk, false);
  assert.equal(o.partial, false, 'both-failed is not the one-landed case');
});

test('a dead server action — null, undefined, a throw — is a failure', () => {
  // A server action that dies returns nothing. "Not obviously broken" must
  // never read as "fine", so only a literal `ok: true` counts.
  for (const dead of [null, undefined, {}, { ok: 'true' }, { ok: 1 }]) {
    const o = courseSaveOutcome({ courseResult: dead, extResult: OK });
    assert.equal(o.allOk, false, `${JSON.stringify(dead)} was treated as success`);
  }
});

test('CONTROL: the probe can produce allOk at all', () => {
  // Without this, every assert.equal(allOk, false) above passes vacuously if
  // allOk were hard-wired to false.
  assert.equal(courseSaveOutcome({ courseResult: OK, extResult: OK }).allOk, true);
});

test('called with nothing at all does not throw and is not success', () => {
  assert.equal(courseSaveOutcome().allOk, false);
});
