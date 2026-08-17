import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPTIONAL_CATEGORIES,
  INITIAL_CONSENT,
  applyAll,
  toggleCategory,
} from '@/components/consent/CookieBanner';

/**
 * The cookie banner's THREE BUTTON BEHAVIOURS, asserted directly.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 * These transitions cannot be tested by clicking. `createRoot` is banned in
 * this suite (test/render/courseListUrlFilter spells out why — it leaks
 * globalThis.window across the shared process), and the browser tier needs a
 * mounted route, which CookieBanner deliberately does not have: it is not in
 * the public layout until consent is actually wired.
 *
 * That is exactly the situation where "accept-all turns all three on" quietly
 * becomes an unverified claim. The transitions were lifted out of the component
 * as pure functions so that claim could be pinned here instead. If someone
 * inlines them back into onClick handlers, this file stops compiling — which is
 * the intended alarm, not collateral damage.
 *
 * ── WHAT THIS FILE DOES NOT COVER ───────────────────────────────────────────
 * That the buttons are WIRED to these functions. That is markup, and it is
 * asserted in test/render/cookieBannerMarkup.test.mjs. Both halves are needed:
 * correct functions wired to nothing would pass this file alone.
 */

const KEYS = OPTIONAL_CATEGORIES.map((c) => c.key);

test('there are exactly three optional categories, and they are the Figma three', () => {
  assert.deepEqual(KEYS, ['analytics', 'functional', 'marketing']);
  assert.deepEqual(
    OPTIONAL_CATEGORIES.map((c) => c.label),
    ['คุกกี้วิเคราะห์', 'คุกกี้ด้านฟังก์ชัน', 'คุกกี้การตลาด'],
    'the Thai labels are the consent record users read — they are not decorative',
  );
});

test('PDPA: every optional category starts OFF', () => {
  // The Figma mockup shows all three CHECKED. That is the accepted-state
  // visual, not a lawful default: pre-ticked boxes are not affirmative consent.
  // If this test ever fails because someone "matched the mockup", the mockup is
  // not the authority here.
  for (const key of KEYS) {
    assert.equal(INITIAL_CONSENT[key], false, `${key} must start unchecked`);
  }
  assert.equal(
    Object.values(INITIAL_CONSENT).some(Boolean),
    false,
    'not one optional category may be pre-granted',
  );
});

test('the initial state is frozen, so no caller can mutate the default', () => {
  // A shared non-frozen default object is a live grenade: one component
  // mutating it in place would change the starting consent for every later
  // mount in the same process.
  assert.ok(Object.isFrozen(INITIAL_CONSENT));
});

test('"ยอมรับทั้งหมด" turns all three ON', () => {
  const next = applyAll(true);
  for (const key of KEYS) assert.equal(next[key], true, `${key} should be granted`);
});

test('"ปฏิเสธคุกกี้ที่ไม่จำเป็น" turns all three OFF', () => {
  // Reject has to work from a fully-accepted state, not just from the default —
  // that is the path a real user takes (accept, reconsider, reject).
  const accepted = applyAll(true);
  assert.equal(Object.values(accepted).every(Boolean), true, 'precondition');

  const next = applyAll(false);
  for (const key of KEYS) assert.equal(next[key], false, `${key} should be denied`);
});

test('applyAll covers every optional key, not a hardcoded three', () => {
  // Guards the case where a fourth optional category is added to
  // OPTIONAL_CATEGORIES but the accept/reject handlers keep setting three keys,
  // leaving the new one permanently off and silently unaccepted.
  assert.deepEqual(Object.keys(applyAll(true)).sort(), [...KEYS].sort());
  assert.deepEqual(Object.keys(applyAll(false)).sort(), [...KEYS].sort());
});

test('toggling one category leaves the other two alone', () => {
  const next = toggleCategory(INITIAL_CONSENT, 'analytics');
  assert.equal(next.analytics, true, 'the toggled one flips');
  assert.equal(next.functional, false, 'and the others do not');
  assert.equal(next.marketing, false);
});

test('toggle is its own inverse', () => {
  const once = toggleCategory(INITIAL_CONSENT, 'marketing');
  const twice = toggleCategory(once, 'marketing');
  assert.deepEqual(twice, { ...INITIAL_CONSENT });
});

test('toggle does not mutate the state it is given', () => {
  // useState relies on a NEW object to re-render; an in-place mutation would
  // flip the checkbox in memory and leave the UI showing the old value.
  const before = { ...INITIAL_CONSENT };
  const returned = toggleCategory(INITIAL_CONSENT, 'analytics');
  assert.deepEqual({ ...INITIAL_CONSENT }, before, 'the input is untouched');
  assert.notEqual(returned, INITIAL_CONSENT, 'a new object comes back');
});

test('CONTROL: a mutating toggle WOULD redden the test above', () => {
  const mutating = (state, key) => {
    state[key] = !state[key];
    return state;
  };
  const victim = { analytics: false };
  const out = mutating(victim, 'analytics');
  assert.equal(victim.analytics, true, 'the control really does mutate');
  assert.equal(out, victim, 'and really does return the same reference');
});

test('no consent-mode signal names leak into this round', () => {
  // This round is UI only. If someone maps a category to a Consent Mode signal
  // here, the next person will reasonably assume the wiring exists.
  const serialised = JSON.stringify(OPTIONAL_CATEGORIES);
  for (const signal of [
    'ad_storage',
    'analytics_storage',
    'ad_user_data',
    'ad_personalization',
    'functionality_storage',
    'personalization_storage',
  ]) {
    assert.equal(
      serialised.includes(signal),
      false,
      `${signal} must not appear until consent is genuinely wired`,
    );
  }
});
