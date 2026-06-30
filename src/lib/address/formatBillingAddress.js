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

  const a = invoice.thaiAddress ?? {};
  const province = a.province || '';
  const isBangkok = province.startsWith('กรุงเทพ');

  const parts = isBangkok
    ? [
        a.addressLine,
        a.subDistrict && `แขวง${a.subDistrict}`,
        a.district && `เขต${a.district}`,
        province,
        a.postalCode,
      ]
    : [
        a.addressLine,
        a.subDistrict && `ตำบล${a.subDistrict}`,
        a.district && `อำเภอ${a.district}`,
        province && `จังหวัด${province}`,
        a.postalCode,
      ];

  return parts.filter(Boolean).join(' ');
}
