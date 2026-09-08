/**
 * The optional consent categories, in the order the banner shows them.
 *
 * ── WHY THIS IS ITS OWN MODULE AND NOT A CONST IN CookieBanner.jsx ──────────
 *
 * It used to live there, and it cannot stay there now that three unrelated
 * layers need the same list:
 *
 *   · CookieBanner.jsx  — renders one toggle per entry (a CLIENT component)
 *   · cookieConsentStore.parseConsent() — is handed these keys as the EXACT set
 *     a stored record must carry, so a record naming a category we no longer
 *     have is rejected rather than half-honoured
 *   · the consent bootstrap in src/lib/analytics/consentMode.js — runs before
 *     the Google tag, in a plain inline <script>, with no React around it
 *
 * The third one is why the list had to move. Importing it from a `'use client'`
 * module would pull that whole component — and its icon dependencies — into the
 * graph of something that is not a component at all. This file has no
 * directive, no imports and no side effects, so every layer can read it.
 *
 * CookieBanner.jsx re-exports `OPTIONAL_CATEGORIES` so existing imports and the
 * tests that reach for it there keep working: one definition, two spellings of
 * the same import path, no drift.
 *
 * ── ADDING OR REMOVING A CATEGORY IS A BREAKING CHANGE TO STORED CONSENT ────
 * `parseConsent` compares the stored key set against this list EXACTLY. Change
 * this array and every consent record already in the wild becomes unreadable,
 * which makes the banner ask again — the safe direction, and the reason
 * CONSENT_SCHEMA_VERSION exists alongside it. Bump that too.
 */
export const OPTIONAL_CATEGORIES = [
  { key: 'analytics', label: 'คุกกี้วิเคราะห์' },
  { key: 'functional', label: 'คุกกี้ด้านฟังก์ชัน' },
  { key: 'marketing', label: 'คุกกี้การตลาด' },
];

/** Just the keys — what parseConsent and the bootstrap validator compare against. */
export const OPTIONAL_CATEGORY_KEYS = Object.freeze(
  OPTIONAL_CATEGORIES.map((c) => c.key),
);
