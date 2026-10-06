/**
 * The cookie banner's state transitions, as pure functions (CB-C).
 *
 * They lived inside CookieBanner.jsx while that component held the toggles. The
 * two-layer redesign moved the toggles into the settings panel, and both layers
 * need the same three transitions, so they are here — no React, no DOM — where
 * test/pure/cookieBannerState.test.mjs asserts them directly. (createRoot is
 * banned in this suite's node tiers, so a click cannot be simulated; a pure
 * transition is the only way "ยอมรับทั้งหมด turns everything on" is a tested
 * claim rather than a reading of the code.)
 */

import { OPTIONAL_CATEGORIES } from '@/lib/consentCategories';

/** The PDPA-correct starting point: every optional category off. */
export const INITIAL_CONSENT = Object.freeze(
  Object.fromEntries(OPTIONAL_CATEGORIES.map(({ key }) => [key, false])),
);

/** "ยอมรับทั้งหมด" / "ปฏิเสธทั้งหมด" — every optional key to `value`. */
export function applyAll(value) {
  return Object.fromEntries(OPTIONAL_CATEGORIES.map(({ key }) => [key, value]));
}

/** Flip one optional category, leaving the others untouched. */
export function toggleCategory(state, key) {
  return { ...state, [key]: !state[key] };
}

/**
 * What kind of decision this was, for the aggregate counters (CB-C §4).
 * "บันทึกตัวเลือก" with everything on or everything off is still reported as
 * `custom` — the visitor went through the panel and chose; the counters keep
 * that distinct from the one-click buttons.
 *
 * @param {'accept_all'|'reject_all'|'save'} action  which button was pressed
 * @returns {'accept_all'|'reject_all'|'custom'}
 */
export function choiceKind(action) {
  if (action === 'accept_all') return 'accept_all';
  if (action === 'reject_all') return 'reject_all';
  return 'custom';
}
