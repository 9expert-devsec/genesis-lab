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
  assert.match(FIELD.withImports, /import \{ subDistrictFieldState \}/, 'the decision is not imported');
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
