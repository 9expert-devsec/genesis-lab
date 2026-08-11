import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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

const require = createRequire(import.meta.url);
const { getDataForZipCode } = require('thai-data');

/** A postcode with real subdistricts. */
const POPULATED_ZIP = '10110';
/**
 * One of the 24 records that EXIST as keys and carry nothing —
 * `{ zipCode: '81180', subDistrictList: null, districtList: null,
 *    provinceList: null }`, read from the installed package below rather than
 * transcribed, so the day upstream fills it in this fixture stops lying.
 */
const EMPTY_ZIP = '81180';
const UNKNOWN_ZIP = '99999';

/** Exactly what the component computes from a lookup. */
const optionsFor = (zip) =>
  (getDataForZipCode(zip)?.subDistrictList ?? []).map((s) => s.subDistrictName).length;

// ── the fixtures are what this file claims they are ─────────────────────────

test('the fixtures still behave as this file assumes', () => {
  // Not a control for the code under test — a check that the DATA has not
  // moved underneath the tests. If upstream populates 81180, the two "manual"
  // cases below silently become one and nobody would notice.
  assert.ok(optionsFor(POPULATED_ZIP) > 0, `${POPULATED_ZIP} lost its subdistricts`);
  assert.ok(getDataForZipCode(EMPTY_ZIP), `${EMPTY_ZIP} is no longer a key — pick another empty record`);
  assert.equal(optionsFor(EMPTY_ZIP), 0, `${EMPTY_ZIP} is no longer empty — pick another`);
  assert.equal(getDataForZipCode(UNKNOWN_ZIP), null, `${UNKNOWN_ZIP} is now a real postcode — pick another`);
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

test('a PRESENT-BUT-EMPTY postcode makes the field typeable too', () => {
  // 81180 returns a truthy record whose subDistrictList is null. Keying the fix
  // on `entry == null` would have fixed the unknown case and left this one
  // exactly as broken — which is why the decision keys on the option count.
  assert.ok(getDataForZipCode(EMPTY_ZIP), 'fixture is meant to EXIST in the dataset');
  const f = subDistrictFieldState({
    postalCode: EMPTY_ZIP,
    optionCount: optionsFor(EMPTY_ZIP),
  });
  assert.equal(f.state, SUB_DISTRICT_MANUAL);
  assert.equal(f.readOnly, false, 'a present-but-empty record still traps the user');
});

test('both routes to manual are indistinguishable to the field', () => {
  // The claim the fix rests on: one behaviour, two causes.
  assert.deepEqual(
    subDistrictFieldState({ postalCode: UNKNOWN_ZIP, optionCount: optionsFor(UNKNOWN_ZIP) }),
    subDistrictFieldState({ postalCode: EMPTY_ZIP, optionCount: optionsFor(EMPTY_ZIP) })
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
