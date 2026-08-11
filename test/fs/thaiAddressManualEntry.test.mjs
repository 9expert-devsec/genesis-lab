import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The wiring the pure test cannot see.
 *
 * `subDistrictFieldState` decides locked/select/manual and is tested as
 * behaviour in test/pure. What that cannot check is whether the COMPONENT asks
 * it — a perfect decision function is worth nothing if the field still computes
 * `readOnly` from the option count itself. There is no jsdom in this runner, so
 * this is a text scan; the interaction it guards (typing into the field once it
 * is typeable) is only observable in a browser and is called out below.
 */

const FIELD = readSource('src/components/registration/ThaiAddressFields.jsx');
const PUBLIC_SCHEMA = readSource('src/lib/schemas/register-public.js');
const INHOUSE_SCHEMA = readSource('src/lib/schemas/register-inhouse.js');

// ── R1: the component defers to the pure decision ───────────────────────────

test('the field takes readOnly and placeholder from the shared decision', () => {
  // Matched on the BINDING, not the punctuation: the import became a
  // multi-line block when the telemetry pulled in SUB_DISTRICT_MANUAL, and a
  // guard that breaks on formatting reports a defect that is not there.
  assert.match(
    FIELD.withImports,
    /import \{[\s\S]*?\bsubDistrictFieldState\b[\s\S]*?\} from '@\/lib\/address\/subDistrictFieldState'/,
    'the decision is not imported'
  );
  assert.match(FIELD.code, /readOnly=\{subDistrictField\.readOnly\}/);
  assert.match(FIELD.code, /placeholder=\{subDistrictField\.placeholder\}/);
});

test('the field no longer decides readOnly from the option count itself', () => {
  // The literal trap: `readOnly={subDistrictOptions.length === 0}`. If this
  // comes back, a postcode outside the dataset is unfinishable again and the
  // pure tests all still pass.
  assert.doesNotMatch(
    FIELD.code,
    /readOnly=\{subDistrictOptions\.length === 0\}/,
    'the read-only-and-required trap is back'
  );
});

test('the manual hint is rendered and tied to the input for screen readers', () => {
  assert.match(FIELD.code, /subDistrictField\.hint && \(/, 'the hint is never rendered');
  assert.match(FIELD.code, /aria-describedby=\{subDistrictField\.hint \? hintId : undefined\}/);
});

// ── R2: the requirement is NOT relaxed ──────────────────────────────────────

test('CONTROL: subDistrict is still required by both schemas', () => {
  // A control, and the one that stops this fix drifting into the easy wrong
  // answer. Making the field optional would also clear the dead end — and would
  // silently accept registrations with no แขวง/ตำบล, which is a data problem
  // instead of a UX one. The fix is that the value became ENTERABLE.
  for (const [name, src] of [['public', PUBLIC_SCHEMA], ['inhouse', INHOUSE_SCHEMA]]) {
    assert.match(
      src.code,
      /subDistrict:\s*z\.string\(\)\.trim\(\)\.min\(1,\s*'กรุณาเลือกแขวง\/ตำบล'\)/,
      `${name} schema no longer requires subDistrict`
    );
  }
});

// ── telemetry: which postcode missed, and NOTHING else ──────────────────────

test('the miss event sends exactly two params: the postcode and the route', () => {
  /**
   * A PRIVACY constraint, not a formatting one. This event fires on the one
   * path where a real customer is stuck mid-registration, and the form it sits
   * in holds their name, email, phone, company, course and order value. A
   * postcode alone identifies an area of thousands; joined to any of those it
   * identifies a person.
   *
   * So the payload is pinned to its two keys, and the fields that must never
   * join them are named individually — a regex for "no other keys" would pass
   * against a payload that added `email` under a different spelling.
   */
  const call = FIELD.code.slice(
    FIELD.code.indexOf("gtagEvent('postcode_lookup_miss'"),
    FIELD.code.indexOf('});', FIELD.code.indexOf("gtagEvent('postcode_lookup_miss'"))
  );
  assert.notEqual(call.length, 0, 'the miss event is gone');

  assert.match(call, /postal_code: zip/);
  assert.match(call, /miss_route: getDataForZipCode\(zip\) \? 'present_but_empty' : 'absent'/);

  for (const forbidden of [
    'email', 'firstName', 'lastName', 'phone', 'companyName', 'taxId',
    'courseId', 'courseName', 'value', 'addressLine', 'district', 'province',
  ]) {
    assert.doesNotMatch(
      call,
      new RegExp(`\\b${forbidden}\\b`),
      `the miss event carries ${forbidden} — it must send the postcode and the route only`
    );
  }
});

test('the miss event fires once per postcode, not once per keystroke', () => {
  // The effect re-runs whenever any address field changes. Without the guard a
  // customer typing their แขวง/ตำบล by hand would emit one event per character
  // and the number would measure typing speed rather than misses.
  assert.match(FIELD.code, /reportedMissRef\.current === zip/, 'no per-postcode de-duplication');
  assert.match(FIELD.code, /reportedMissRef\.current = zip/);
});

test('the miss event only fires in the manual state', () => {
  // A locked or select field is not a miss.
  assert.match(
    FIELD.code,
    /if \(subDistrictField\.state !== SUB_DISTRICT_MANUAL\) return;/,
    'the event is not gated on the manual state'
  );
});

test('it rides the existing gtag wrapper — no new endpoint or transport', () => {
  assert.match(FIELD.withImports, /import \{ gtagEvent \} from '@\/lib\/analytics\/gtag'/);
  assert.doesNotMatch(FIELD.code, /\bfetch\(/, 'the component now makes its own network call');
});

// ── R3: a new postcode cannot inherit the old one's answers ─────────────────

test('both no-option paths clear the fields the previous postcode filled', () => {
  // Before: each path `return`ed early without touching district / province /
  // subDistrict, so values chosen under postcode A survived under postcode B —
  // a แขวง/ตำบล from the wrong province, submitted looking correctly filled.
  const effect = FIELD.code.slice(
    FIELD.code.indexOf("const zip = (value.postalCode ?? '').trim()"),
    FIELD.code.indexOf('const district =')
  );
  assert.notEqual(effect.length, 0, 'the postcode effect is gone');
  assert.equal(
    (effect.match(/clearDerived\(\)/g) ?? []).length,
    2,
    'the incomplete-zip and unknown-zip paths do not both clear'
  );
});

test('clearDerived drops exactly the three lookup-owned fields', () => {
  // Not addressLine: the admin typed that and no postcode owns it.
  const fn = FIELD.code.slice(FIELD.code.indexOf('const clearDerived'));
  const body = fn.slice(0, fn.indexOf('}, [value, onChange]);'));
  assert.match(body, /subDistrict: '', district: '', province: ''/);
  assert.doesNotMatch(body, /addressLine: ''/, 'clearing wipes the street address too');
});

test('the clear is keyed on the postcode alone, so typing cannot erase itself', () => {
  // In `manual` the user types into แขวง/ตำบล. If the effect re-ran on every
  // value change it would clear the field mid-keystroke.
  assert.match(
    FIELD.code,
    /\}, \[value\.postalCode\]\);/,
    'the postcode effect now depends on more than the postcode'
  );
});
