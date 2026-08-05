import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The consent a customer ticks on step 2 travels UI → wizard → route → Mongo.
 * test/pure/registrationQuoteConsent covers the far end (what gets written);
 * the two client hops are effects and click handlers a static render cannot
 * reach, so the seams are pinned here.
 *
 * The failure this guards is silent by construction: if any hop drops the
 * argument, the checkbox still renders, the request still succeeds, and the
 * doc quietly stores null — exactly the bug being fixed.
 */

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const read = (...p) => readFileSync(path.join(ROOT, ...p), 'utf8');

const STEP = read('src', 'components', 'registration', 'ReviewAndPayStep.jsx');
const WIZARD = read('src', 'components', 'registration', 'RegisterWizard.jsx');
const ROUTE = read('src', 'app', 'api', 'registration', 'public', 'route.js');
const CARD = read('src', 'components', 'payment', 'card.js');

const flat = (s) => s.replace(/\s+/g, ' ');

test('the sources are readable (the checks can see something)', () => {
  for (const [name, src] of [['step', STEP], ['wizard', WIZARD], ['route', ROUTE]]) {
    assert.ok(src.length > 500, `${name} looks empty (${src.length} chars)`);
  }
});

// ── Hop 1: the step passes its consent up ───────────────────────────────────

test('ReviewAndPayStep hands the fanned-out consent to onQuoteConfirm', () => {
  assert.ok(
    flat(STEP).includes('onQuoteConfirm(consentPayload)'),
    'expected `onQuoteConfirm(consentPayload)`',
  );
});

test('the consent it passes comes from consentFanOut, not a literal', () => {
  assert.ok(flat(STEP).includes('consentFanOut(consented)'), 'consentPayload = consentFanOut(consented)');
});

test('CONTROL: the argument-less call is gone', () => {
  // The pre-fix line. If both forms were present the assertion above could pass
  // while the live call path still dropped the consent.
  assert.equal(flat(STEP).includes('onQuoteConfirm()'), false);
});

// ── Hop 2: the wizard puts it in the request body ───────────────────────────

test('handleConfirm accepts a consent argument', () => {
  assert.ok(flat(WIZARD).includes('const handleConfirm = async (consent) =>'));
});

test('handleConfirm merges consent into the POST body', () => {
  assert.ok(
    flat(WIZARD).includes('JSON.stringify(consent ? { ...formData, consent } : formData)'),
    'expected the body to carry consent when present',
  );
});

test('CONTROL: the unconditional body is gone', () => {
  assert.equal(flat(WIZARD).includes('JSON.stringify(formData),'), false);
});

// ── Hop 3: the route writes it ──────────────────────────────────────────────

test('the quote route builds its document through buildQuoteRegistration', () => {
  assert.ok(flat(ROUTE).includes('buildQuoteRegistration({ data, attendees, ipAddress })'));
});

test('CONTROL: the route no longer inlines a create() payload that omits consent', () => {
  // The old shape — a literal starting at courseId with no `consent:` key.
  assert.equal(flat(ROUTE).includes('RegisterPublic.create({ courseId:'), false);
});

// ── Part C: the dead export is gone ─────────────────────────────────────────

test('CARD_BRAND_LOGO is no longer exported', () => {
  assert.equal(CARD.includes('CARD_BRAND_LOGO'), false);
});

test('CONTROL: the sibling export it sat next to IS still there', () => {
  // Proves the absence check reads the real file rather than an empty string.
  assert.ok(CARD.includes('CARD_BRAND_LABEL'), 'CARD_BRAND_LABEL still has a consumer');
});
