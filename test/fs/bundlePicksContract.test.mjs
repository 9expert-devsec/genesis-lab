import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';
import { PICK_REASONS } from '@/lib/pageBuilder/bundleRoundChoice';
import { PICK_REASON_TEXT } from '@/lib/pageBuilder/bundleRegistration';

/**
 * The 409 contract between the route and the wizard.
 *
 * ── WHY A SOURCE SCAN ─────────────────────────────────────────────────────
 * The two halves are in different runtimes: a server handler that returns a
 * status and a body, and a client branch that reads them. Nothing renders the
 * join, so there is no DOM to assert it from — and the failure it guards is
 * exactly the kind that passes every unit test on both sides: the route
 * renames its error key, the wizard's branch stops matching, and an applicant
 * whose round filled gets a generic "ส่งคำขอไม่สำเร็จ" with no way to recover.
 *
 * The reason VOCABULARY is checked at runtime rather than by scan, because it
 * is importable from both sides.
 */

const ROUTE = 'src/app/api/registration/bundle/route.js';
const WIZARD = 'src/components/registration/BundleWizard.jsx';

test('the route returns 409 with the per-item errors, and the wizard reads that exact key', () => {
  const route = readSource(ROUTE).code;
  assert.match(
    route, /error:\s*'bundle_picks_invalid',\s*errors:\s*verdict\.errors/,
    'the route no longer returns the per-item errors under that key',
  );
  assert.match(route, /\{\s*status:\s*409\s*\}/, 'the picks refusal is not a 409');

  const wizard = readSource(WIZARD).code;
  assert.match(
    wizard, /json\?\.error === 'bundle_picks_invalid'/,
    'the wizard does not branch on the key the route sends — a recoverable refusal would read as a generic failure',
  );
});

test('the route refuses the picks BEFORE opening the transaction', () => {
  // The whole point of a 409 here: nothing is written. Asserted by position,
  // because "zero rows" is otherwise only observable with a live database.
  const { code } = readSource(ROUTE);
  //
  // AGAINST THE CALL SITE, NOT THE HELPER'S DEFINITION. The first draft of
  // this test searched for startSession / RegisterPublic.create and failed:
  // writeLegsAtomically is DEFINED at the top of the file and CALLED near the
  // bottom, so position relative to the definition says nothing at all. The
  // premise was wrong, not the route.
  const refusal = code.indexOf("error: 'bundle_picks_invalid'");
  const call = code.indexOf('await writeLegsAtomically(');
  const legs = code.indexOf('buildBundleLegs({');
  assert.ok(refusal > 0, 'the picks refusal is gone');
  assert.ok(call > 0, 'the write call site was not found — this test cannot speak');
  assert.ok(
    refusal < call,
    'the picks are refused AFTER the write is issued — a rejected submission could write rows',
  );
  assert.ok(
    refusal < legs,
    'the legs are built before the picks are validated — wasted work on a doomed request',
  );
});

test('the route validates with the SAME function the wizard gates submit on', () => {
  for (const rel of [ROUTE, WIZARD]) {
    assert.match(
      readSource(rel).code, /validateBundlePicks/,
      `${rel} does not use the shared validator — the form could allow what the server refuses`,
    );
  }
});

test('a 409 returns the applicant to the pick step', () => {
  const { code } = readSource(WIZARD);
  const at = code.indexOf("json?.error === 'bundle_picks_invalid'");
  const branch = code.slice(at, at + 900);
  assert.match(branch, /setCurrentStep\(1\)/, 'the applicant is left on the review step with nothing to change');
  assert.match(branch, /setPickErrors\(/, 'the reasons are not surfaced');
});

test('a 409 does NOT clear the form data', () => {
  // The recovery property: a round changing under them must not cost an
  // applicant everything they typed.
  const { code } = readSource(WIZARD);
  const at = code.indexOf("json?.error === 'bundle_picks_invalid'");
  const branch = code.slice(at, at + 900);
  assert.doesNotMatch(branch, /setFormData\(null\)/);
  assert.doesNotMatch(branch, /removeItem\(/, 'the stored form was dropped on a recoverable refusal');
});

test('EVERY reason the core can return has Thai text for the applicant', () => {
  // A reason with no text renders an empty line — the applicant is told their
  // pick failed and not why. Checked over the vocabulary rather than over the
  // map, so a reason ADDED to the core without copy is caught.
  for (const reason of PICK_REASONS) {
    const text = PICK_REASON_TEXT[reason];
    assert.equal(typeof text, 'string', `no Thai text for reason "${reason}"`);
    assert.ok(text.trim().length > 0, `empty Thai text for reason "${reason}"`);
  }
});

test('control: the reason map has no entries the core cannot produce', () => {
  // The other direction — dead copy is a reason someone will try to trigger.
  for (const key of Object.keys(PICK_REASON_TEXT)) {
    assert.ok(PICK_REASONS.includes(key), `PICK_REASON_TEXT has a dead reason "${key}"`);
  }
});

test('the route derives a missing pick only for a single-round course', () => {
  // The legacy path, and the trap beside it: deriving for a multi-round course
  // would book round one silently, which is what the deleted guard stood in
  // for. Pinned at the source because the derivation is one branch.
  const { code } = readSource(ROUTE);
  assert.match(
    code, /if \(offered\.length === 1\) picks\[itemId\] = /,
    'the derivation is no longer gated on there being exactly one offered round',
  );
});
