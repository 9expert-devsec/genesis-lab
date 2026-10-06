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
 * CONSENT_SCHEMA_VERSION exists alongside it. Bump that too, and decide
 * whether the previous version can be MIGRATED rather than discarded.
 *
 * ── CB-C: "ด้านฟังก์ชัน" IS NO LONGER A CHOICE ─────────────────────────────
 * The owner's ruling. Its only occupant was next-themes' `localStorage.theme`,
 * which stores a setting the visitor picks themselves — that is "remembering
 * what you chose", i.e. คุกกี้ที่จำเป็น, not something to consent to. The v1
 * records that carried `functional` are migrated, not discarded: see
 * LEGACY_V1_CATEGORY_KEYS and parseConsent in src/lib/cookieConsentStore.js.
 */
export const OPTIONAL_CATEGORIES = [
  { key: 'analytics', label: 'คุกกี้วิเคราะห์' },
  { key: 'marketing', label: 'คุกกี้การตลาด' },
];

/**
 * The schema-v1 key set (CB-A3 … CB-B). Only the migration reads it: a valid v1
 * record keeps `analytics` and `marketing` and drops `functional`, so a visitor
 * who already answered is not asked again.
 */
export const LEGACY_V1_CATEGORY_KEYS = Object.freeze(['analytics', 'functional', 'marketing']);

/** Just the keys — what parseConsent and the bootstrap validator compare against. */
export const OPTIONAL_CATEGORY_KEYS = Object.freeze(
  OPTIONAL_CATEGORIES.map((c) => c.key),
);
