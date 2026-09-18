/**
 * The PUBLIC registration form's "หมายเหตุเพิ่มเติม" note — one limit, one
 * placeholder, read by both sides of that one flow.
 *
 * Consumers: the client textarea in components/registration/RegisterWizard.jsx
 * (`maxLength`, `placeholder`, the live counter) and the server rule in
 * lib/schemas/register-public.js (`.max(CUSTOMER_NOTE_MAX_LENGTH)`). Both read
 * these values so the counter, the browser and the server agree on the same
 * text; the cap is on CHARACTERS as JavaScript counts them (`String.length`),
 * the count `maxLength` and zod's `.max()` share.
 *
 * ── SCOPE: PUBLIC ONLY, ON PURPOSE ───────────────────────────────────────────
 * The bundle (500), in-house (2000), masterclass (500 client / mongoose) and
 * career-path (uncapped) notes keep their own rules and placeholders. A sweep
 * once put all five on this module and was reverted; test/fs/
 * registrationNoteFieldWiring pins that no other flow imports it, so widening
 * the scope again is a decision that has to be made in a test, not by grep.
 */
export const CUSTOMER_NOTE_MAX_LENGTH = 200;

export const CUSTOMER_NOTE_PLACEHOLDER = `เช่น ต้องการใบแจ้งหนี้ (ไม่เกิน ${CUSTOMER_NOTE_MAX_LENGTH} ตัวอักษร)`;

/** The message a server returns when a note somehow exceeds the cap. */
export const CUSTOMER_NOTE_TOO_LONG_MESSAGE = `หมายเหตุต้องไม่เกิน ${CUSTOMER_NOTE_MAX_LENGTH} ตัวอักษร`;

/** `183/200` — from the live value, never from separate state. */
export function customerNoteCounterLabel(value) {
  return `${String(value ?? '').length}/${CUSTOMER_NOTE_MAX_LENGTH}`;
}

/** True when a note (string or empty) fits the cap. */
export function customerNoteFits(value) {
  return String(value ?? '').length <= CUSTOMER_NOTE_MAX_LENGTH;
}
