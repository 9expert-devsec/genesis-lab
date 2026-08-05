import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The `omisePaymentEnabled` branch in RegisterWizard picks which step-2 screen
 * renders. Neither branch is reachable from a server render (step 2 needs
 * formData, which arrives from sessionStorage in an effect), so the wiring
 * itself is pinned here while test/render/registrationPaymentStep.test.mjs
 * covers what each screen actually renders.
 *
 * This also guards the deletions: the old single-panel implementation must
 * stay gone, not linger as dead code that a later edit re-reaches.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WIZARD = path.join(ROOT, 'src', 'components', 'registration', 'RegisterWizard.jsx');
const SRC = readFileSync(WIZARD, 'utf8');

/** Collapse JSX whitespace so a branch can be matched as one string. */
const FLAT = SRC.replace(/\s+/g, ' ');

test('the wizard source is readable (the checks can see something)', () => {
  assert.ok(SRC.length > 1000, `expected a substantial file, got ${SRC.length} chars`);
  assert.ok(FLAT.includes('omisePaymentEnabled'), 'the toggle prop is present');
});

test('toggle OFF routes to StepPreview', () => {
  assert.ok(
    FLAT.includes('!omisePaymentEnabled && ( <StepPreview'),
    'expected `!omisePaymentEnabled && (<StepPreview`',
  );
});

test('toggle ON routes to ReviewAndPayStep', () => {
  assert.ok(
    FLAT.includes('omisePaymentEnabled && ( <ReviewAndPayStep'),
    'expected `omisePaymentEnabled && (<ReviewAndPayStep`',
  );
});

test('CONTROL: the negated branch does NOT reach ReviewAndPayStep', () => {
  // If both branches matched the same component, the two tests above would
  // pass while the toggle did nothing.
  assert.equal(FLAT.includes('!omisePaymentEnabled && ( <ReviewAndPayStep'), false);
  assert.equal(FLAT.includes('&& ( <StepPreview data={formData} pricing'), false);
});

// ── The replaced implementation is gone ─────────────────────────────────────

const REMOVED = ['UnifiedPaymentStep', 'QrDisplay', 'ConsentCheckbox', 'CONSENT_ITEMS'];

for (const name of REMOVED) {
  test(`\`${name}\` no longer appears in RegisterWizard`, () => {
    assert.equal(SRC.includes(name), false, `${name} should have been deleted`);
  });
}

test('CONTROL: the same absence probe finds the names that DID survive', () => {
  // Proves `SRC.includes` is looking at real content — a mis-pointed path would
  // make every removal assertion above pass vacuously.
  for (const kept of ['StepPreview', 'ReviewAndPayStep', 'StepComplete', 'AttendanceModeSelector']) {
    assert.ok(SRC.includes(kept), `${kept} must still be present`);
  }
});
