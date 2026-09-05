import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isBundleRegistrationOpen } from '@/lib/pageBuilder/bundleRegistration';

/**
 * The open/closed rule, on its own terms.
 *
 * The BEHAVIOURAL agreement between the two readers — the section renderer and
 * the bundle quotation form — is asserted where the renderer lives
 * (test/render/promotionBundle). This file drives the predicate directly, over
 * the values a stored document can actually hold, because the renderer test can
 * only reach it through markup and cannot say anything about a call with no
 * content at all.
 */

test('ABSENT means OPEN — the state every section stored before the field existed reads back as', () => {
  /**
   * A `.lean()` read applies no Mongoose defaults and JSON drops `undefined`,
   * so this is not a hypothetical: it is what every pre-existing bundle looks
   * like on the way to a renderer. Getting it wrong closes every live promotion
   * at once, with nobody having touched a switch.
   */
  assert.equal(isBundleRegistrationOpen({}), true);
  assert.equal(isBundleRegistrationOpen({ registrationOpen: undefined }), true);
  assert.equal(isBundleRegistrationOpen({ name: 'Bundle 1', netPrice: 32640 }), true);
});

test('only a literal false closes it', () => {
  assert.equal(isBundleRegistrationOpen({ registrationOpen: false }), false);
  assert.equal(isBundleRegistrationOpen({ registrationOpen: true }), true);
});

test('the falsy values that are NOT false leave it open', () => {
  /**
   * `null`, `0` and `''` are not values an author can produce — the editor
   * writes a boolean — but a bad write or a hand-edited document can hold one,
   * and every one of them would close a live bundle under a truthiness check.
   * The field may only ever REMOVE the button, so anything it cannot recognise
   * has to leave the bundle as it was.
   */
  for (const v of [null, 0, '', NaN]) {
    assert.equal(
      isBundleRegistrationOpen({ registrationOpen: v }),
      true,
      `registrationOpen: ${String(v)} closed the bundle`,
    );
  }
  // And the string 'false' — what a form-encoded value would arrive as — is not
  // the boolean and must not be read as one.
  assert.equal(isBundleRegistrationOpen({ registrationOpen: 'false' }), true);
});

test('CONTROL: a truthiness check WOULD answer differently for those values', () => {
  /**
   * Without this the test above is satisfied by any function that returns true
   * for everything. This shows the two implementations genuinely diverge on the
   * exact inputs asserted, so the assertions are discriminating.
   */
  const truthy = (content) => Boolean(content?.registrationOpen);
  const diverged = [null, 0, '', NaN, undefined].filter(
    (v) => truthy({ registrationOpen: v }) !== isBundleRegistrationOpen({ registrationOpen: v }),
  );
  assert.equal(diverged.length, 5, 'the truthiness check agrees, so these cases prove nothing');
  // …and the two AGREE on the value that actually matters, which is why the
  // defect would never have shown up on an authored document.
  assert.equal(truthy({ registrationOpen: false }), isBundleRegistrationOpen({ registrationOpen: false }));
});

test('a missing content object is OPEN, not a throw', () => {
  /**
   * The form reaches this with whatever a page read handed back, and a section
   * whose `content` is absent must not crash the guard on its way to the
   * refusal it is going to produce anyway for other reasons.
   */
  assert.equal(isBundleRegistrationOpen(null), true);
  assert.equal(isBundleRegistrationOpen(undefined), true);
});
