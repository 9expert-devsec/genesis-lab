/**
 * THE ACTION QUEUE'S THRESHOLDS — every one of them, in one place.
 *
 * ══ WHY THEY ARE CONSTANTS AND WHY THE UI RENDERS FROM THEM ═════════════════
 *
 * A number whose rule is invisible cannot be trusted or challenged. "29" on a
 * card is a claim; "29, เกิน 14 วัน" is a claim a reader can disagree with, and
 * disagreeing is the point — these thresholds are guesses about how long is too
 * long, and the person who knows the answer is an admin, not this file.
 *
 * So the SAME constant that builds the Mongo filter also builds the Thai label.
 * A card whose text said "3 วัน" over a query using 2 would be a screen lying
 * about its own arithmetic, and there would be nothing to catch it: both halves
 * would look right in isolation. test/pure/dashboardQueue changes a constant and
 * asserts the rendered text follows.
 *
 * ── NO IMPORTS ──────────────────────────────────────────────────────────────
 * Same constraint as lib/dashboard/ranges.js and lib/registrations/statuses.js:
 * the pure tier loads this with nothing stubbed, and the day a script needs a
 * threshold it can read it from plain node.
 */

/** Hours a webhook error stays "recent". */
export const WEBHOOK_ERROR_WINDOW_HOURS = 24;

/** Days a PromptPay charge may sit unpaid before it is a stall. */
export const STALLED_PAYMENT_DAYS = 2;

/**
 * Days a registration may sit `pending` before nobody is plausibly working it.
 *
 * The same figure for public and masterclass ON PURPOSE. They are the same
 * question asked of two collections — "has anyone touched this in a fortnight" —
 * and two constants would drift into two different answers to it with no reason
 * ever written down. Split them when someone has a reason, not before.
 */
export const STALE_PENDING_DAYS = 14;

/**
 * The Thai phrase for each threshold, DERIVED from the number above it.
 *
 * Interpolated rather than written out, so the text cannot say one thing while
 * the query does another. This is the property test 8 pins.
 */
export const THRESHOLD_LABEL = Object.freeze({
  stalledPayment: `เกิน ${STALLED_PAYMENT_DAYS} วัน`,
  stalePending:   `เกิน ${STALE_PENDING_DAYS} วัน`,
  webhookWindow:  `ใน ${WEBHOOK_ERROR_WINDOW_HOURS} ชั่วโมงที่ผ่านมา`,
});

/** `now` minus N days, as a Date. */
export function daysAgo(days, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/** `now` minus N hours, as a Date. */
export function hoursAgo(hours, now = new Date()) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}
