import { formatThaiAddress } from './formatThaiAddress';

/**
 * Format a registration `invoice` object into a single billing-address line.
 *
 * Invoice shape:
 *   country: "TH" | "OTHER"
 *   thaiAddress: { addressLine, subDistrict, district, province, postalCode }
 *     - province is the full Thai string; Bangkok === "กรุงเทพมหานคร"
 *   internationalAddress: { line1, line2, city, state, postalCode, country }
 *
 * Bangkok uses แขวง/เขต prefixes; other Thai provinces use ตำบล/อำเภอ/จังหวัด.
 *
 * ── WHAT THIS FUNCTION OWNS AFTER THE EXTRACTION ────────────────────────────
 * The invoice SHAPE, and only that: which branch a `country` selects, the
 * international field order and its `', '` join, and the `?? 'TH'` default that
 * makes a missing country Thai. The Thai prefix rule moved to
 * ./formatThaiAddress so that callers holding a bare address — an in-house
 * quotation address, a training venue — can reach it without having to pretend
 * their data is an invoice. Behaviour here is UNCHANGED; the extraction is a
 * move, asserted byte-for-byte over Bangkok, non-Bangkok, missing subDistrict,
 * missing province, an empty object and the OTHER branch.
 *
 * A VENUE MUST NOT COME THROUGH HERE. Call formatThaiAddress directly — see the
 * naming note in that file.
 *
 * @param {object} invoice
 * @returns {string} single-line address ("" when missing)
 */
export function formatBillingAddress(invoice) {
  if (!invoice) return '';

  if ((invoice.country ?? 'TH') === 'OTHER') {
    const a = invoice.internationalAddress ?? {};
    return [a.line1, a.line2, a.city, a.state, a.postalCode, a.country]
      .filter(Boolean)
      .join(', ');
  }

  return formatThaiAddress(invoice.thaiAddress);
}
