/**
 * The customer's "หมายเหตุเพิ่มเติม" note — ONE limit, ONE placeholder, every flow.
 *
 * Public, bundle, in-house, masterclass and career-path registrations each
 * carried their own copy of this rule (500 / 500 / none / 500 / none, four
 * different placeholders) and drifted. Every flow now reads these three
 * values: the client textarea (`maxLength`, `placeholder`, the live counter)
 * and the server rule (`.max(CUSTOMER_NOTE_MAX_LENGTH)` in the zod schemas, or the
 * explicit check in the two flows that have no zod on the server).
 * test/fs/registrationNoteField pins that no flow spells the number itself.
 *
 * The cap is on CHARACTERS as JavaScript counts them (`String.length`), the
 * same count `maxLength` and zod's `.max()` use, so the counter, the browser
 * and the server always agree on the same text.
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
