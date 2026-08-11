import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupPostcode, isKnownPostcode } from '@/lib/address/postcodeIndex';
import {
  subDistrictFieldState,
  SUB_DISTRICT_LOCKED,
  SUB_DISTRICT_SELECT,
  SUB_DISTRICT_MANUAL,
} from '@/lib/address/subDistrictFieldState';

/**
 * แขวง/ตำบล must never be read-only AND required at the same time.
 *
 * That combination made the form unfinishable for any postcode the dataset does
 * not cover — a real customer hit it on a masterclass registration. The
 * requirement is not relaxed here; the field becomes enterable, which is a
 * different thing and is what these tests check.
 *
 * ── THE FIXTURES ARE REAL, NOT HAND-SHAPED ──────────────────────────────────
 * The `manual` state is reached two ways that look nothing alike to the lookup,
 * so both are driven through the ACTUAL installed dataset rather than through
 * an object written to match what the code expects. Starting from data already
 * in the shape the code produces is how the training_topics suite failed to see
 * its own bug.
 */

/** A postcode with real subdistricts. */
const POPULATED_ZIP = '10110';
const UNKNOWN_ZIP = '99999';

/**
 * ── WHAT CHANGED HERE WHEN THE DATASET DID, AND WHY IT IS NOT A DELETION ────
 * These fixtures used to come from `thai-data`, and one of them —
 * `EMPTY_ZIP = '81180'` — was a record that EXISTED as a key while carrying
 * nulls. Two tests were built on it: "a PRESENT-BUT-EMPTY postcode makes the
 * field typeable too", and "both routes to manual are indistinguishable".
 *
 * thailand_postcode_2026.json has no such records — every key holds at least one
 * subdistrict, pinned by a test in postcodeIndex.test.mjs — and 81180 is not in
 * it at all. So those two tests had thai-data's SHAPE as their subject, not the
 * field's behaviour, and no fixture substitution can keep them as they were.
 *
 * They are REFRAMED, not dropped, because the claim underneath them is still
 * load-bearing: `subDistrictFieldState` decides on the OPTION COUNT and knows
 * nothing about why the options are missing. That is what makes it correct for a
 * cause that does not exist today but could return the moment the dataset gains
 * a hollow entry. The reframed version below drives the function directly rather
 * than through whichever dataset happens to be installed — which is also why it
 * can no longer rot.
 *
 * Everything else in this file was always dataset-free and is untouched.
 */
const optionsFor = (zip) => lookupPostcode(zip).length;

// ── the fixtures are what this file claims they are ─────────────────────────

test('the fixtures still behave as this file assumes', () => {
  // Not a control for the code under test — a check that the DATA has not moved
  // underneath the tests. If 10110 ever loses its subdistricts, or 99999 becomes
  // a real postcode, the cases below stop testing what they claim to.
  assert.ok(optionsFor(POPULATED_ZIP) > 0, `${POPULATED_ZIP} lost its subdistricts`);
  assert.equal(isKnownPostcode(UNKNOWN_ZIP), false, `${UNKNOWN_ZIP} is now a real postcode — pick another`);
  assert.equal(optionsFor(UNKNOWN_ZIP), 0);
});

// ── locked ──────────────────────────────────────────────────────────────────

test('fewer than five digits is locked, exactly as before', () => {
  for (const zip of ['', '1', '101', '1011']) {
    const f = subDistrictFieldState({ postalCode: zip, optionCount: 0 });
    assert.equal(f.state, SUB_DISTRICT_LOCKED, `"${zip}" is not locked`);
    assert.equal(f.readOnly, true);
    assert.equal(f.placeholder, 'กรอกรหัสไปรษณีย์ก่อน');
    assert.equal(f.hint, null, 'a half-typed postcode should not accuse the dataset');
  }
});

// ── select ──────────────────────────────────────────────────────────────────

test('five digits with real options is the dropdown, still typeable', () => {
  const f = subDistrictFieldState({
    postalCode: POPULATED_ZIP,
    optionCount: optionsFor(POPULATED_ZIP),
  });
  assert.equal(f.state, SUB_DISTRICT_SELECT);
  assert.equal(f.readOnly, false);
  assert.equal(f.hint, null);
});

// ── manual, by both routes ──────────────────────────────────────────────────

test('an UNKNOWN postcode makes the field typeable', () => {
  // getDataForZipCode('99999') → null.
  const f = subDistrictFieldState({
    postalCode: UNKNOWN_ZIP,
    optionCount: optionsFor(UNKNOWN_ZIP),
  });
  assert.equal(f.state, SUB_DISTRICT_MANUAL);
  assert.equal(f.readOnly, false, 'the field is still read-only — the form cannot be completed');
  assert.match(f.hint ?? '', /ไม่พบรหัสไปรษณีย์นี้/);
});

test('a PRESENT-BUT-EMPTY postcode would make the field typeable too', () => {
  // REFRAMED — see the fixture note at the top. thai-data had 24 records that
  // were keys carrying nulls; keying the fix on `entry == null` would have fixed
  // the unknown case and left those exactly as broken, which is why the decision
  // keys on the OPTION COUNT instead.
  //
  // The 2026 dataset has no hollow records, so this cause cannot be reproduced
  // from data any more. The guarantee is still worth pinning, so it is asserted
  // where it actually lives — a full postcode with zero options is `manual`, and
  // the function is never told which of the two reasons produced the zero.
  const f = subDistrictFieldState({ postalCode: '81180', optionCount: 0 });
  assert.equal(f.state, SUB_DISTRICT_MANUAL);
  assert.equal(f.readOnly, false, 'a present-but-empty record would still trap the user');
});

test('both routes to manual are indistinguishable to the field', () => {
  // The claim the fix rests on: one behaviour, two causes. The function takes a
  // COUNT, so it cannot tell an absent postcode from a hollow one — which is the
  // property being asserted, and the reason it survives the dataset swap.
  assert.deepEqual(
    subDistrictFieldState({ postalCode: UNKNOWN_ZIP, optionCount: optionsFor(UNKNOWN_ZIP) }),
    subDistrictFieldState({ postalCode: '81180', optionCount: 0 })
  );
});

// ── the invariant, stated directly ──────────────────────────────────────────

test('the field is never read-only once a full postcode has been typed', () => {
  // The trap in one line: readOnly && required. The schemas keep `min(1)`, so
  // read-only at five digits is unfinishable regardless of how it was reached.
  for (const count of [0, 1, 9]) {
    const f = subDistrictFieldState({ postalCode: '20131', optionCount: count });
    assert.equal(f.readOnly, false, `readOnly with a full postcode and ${count} options`);
  }
});

test('non-digits do not count toward the five', () => {
  // The input strips them, but the rule must not depend on that: ' 1011 ' is
  // four digits and belongs in locked, not manual.
  assert.equal(subDistrictFieldState({ postalCode: ' 1011 ' }).state, SUB_DISTRICT_LOCKED);
  assert.equal(subDistrictFieldState({ postalCode: '10110' }).state, SUB_DISTRICT_MANUAL);
});

test('called with nothing is locked, not manual', () => {
  // A missing value must not read as "postcode not found" and accuse the
  // dataset on an untouched form.
  assert.equal(subDistrictFieldState().state, SUB_DISTRICT_LOCKED);
  assert.equal(subDistrictFieldState({}).hint, null);
});
