/**
 * Pricing helpers for Omise checkout.
 *
 * Source of truth for the amount a customer pays. Used server-side in
 * the charge route (authoritative) and client-side in the wizard
 * (display only — the server recomputes and never trusts the client).
 *
 * Rules (Phase 1, confirmed with the team):
 *   total = (pricePerSeat * seats) + VAT 7%
 *   No withholding tax (WHT) in this phase — handled manually by staff.
 *
 * All amounts in THB. Omise expects the charge amount in the smallest
 * currency unit (satang) — multiply the THB total by 100 and round.
 */

export const VAT_RATE = 0.07;

/** Round to 2 decimal places without float artefacts. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve the effective per-seat price.
 * Prefers the per-round override, then the upstream course_price.
 * Returns a Number (coerces numeric strings) or null if neither set.
 */
export function resolvePricePerSeat({ priceOverride, coursePrice }) {
  const override = priceOverride == null ? null : Number(priceOverride);
  if (override != null && Number.isFinite(override) && override >= 0) {
    return override;
  }
  const base = coursePrice == null ? null : Number(coursePrice);
  if (base != null && Number.isFinite(base) && base >= 0) return base;
  return null;
}

/**
 * Build the full pricing snapshot from a per-seat price and seat count.
 * Throws if price is missing — callers must guard before reaching here.
 */
export function computePricing(pricePerSeat, seats) {
  const p = Number(pricePerSeat);
  const n = Number(seats);
  if (!Number.isFinite(p) || p < 0) throw new Error('Invalid pricePerSeat');
  if (!Number.isInteger(n) || n < 1) throw new Error('Invalid seats');

  const subtotal = round2(p * n);
  const vatAmount = round2(subtotal * VAT_RATE);
  const total = round2(subtotal + vatAmount);

  return {
    pricePerSeat: round2(p),
    seats: n,
    subtotal,
    vatRate: VAT_RATE,
    vatAmount,
    total,
    currency: 'THB',
  };
}

/** Convert a THB amount to satang (Omise's smallest unit). */
export function toSatang(thb) {
  return Math.round(Number(thb) * 100);
}

/** Format a THB amount for display, e.g. 22084.8 -> "22,084.80". */
export function formatTHB(amount) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}
