/**
 * Whether a batch accepts "ขอใบเสนอราคา" registrations.
 * Legacy batches predate the field and read back as `undefined` through
 * .lean() — those must count as ENABLED, so this compares against false
 * rather than testing truthiness.
 */
export function isQuoteEnabled(batch) {
  return batch?.quote_enabled !== false;
}
