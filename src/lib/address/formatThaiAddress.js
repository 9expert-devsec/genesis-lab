/**
 * One Thai address object → one line, WITH the administrative-division prefixes.
 *
 * ── WHY THIS IS ITS OWN FUNCTION ────────────────────────────────────────────
 * The prefix rule is the only thing in this repo that knows ตำบล from แขวง, and
 * it used to live inside `formatBillingAddress`. That made it reachable only by
 * callers willing to describe their data as an *invoice*, which is why the
 * in-house flow — whose addresses are a quotation address and a training VENUE
 * — hand-rolled `[...].filter(Boolean).join(' ')` at four sites instead, and
 * mailed customers `เชียงยืน เมืองอุดรธานี อุดรธานี 41000`: no prefixes, and no
 * way for a reader to tell the sub-district from the district.
 *
 * So the rule is extracted and the wrapper keeps its name. `formatBillingAddress`
 * still owns the invoice SHAPE — the TH/OTHER branch, the international field
 * order, the `country ?? 'TH'` default — and calls this for its Thai half.
 *
 * ── BANGKOK IS A DIFFERENT VOCABULARY, NOT A DIFFERENT FORMAT ───────────────
 * Bangkok's subdivisions are แขวง/เขต; every other province uses ตำบล/อำเภอ,
 * and only the provinces take the จังหวัด prefix — "จังหวัดกรุงเทพมหานคร" is
 * wrong, which is why the Bangkok branch emits the province bare.
 *
 * Detected with `startsWith('กรุงเทพ')` rather than an equality test, because
 * the stored string is sometimes 'กรุงเทพมหานคร' and sometimes 'กรุงเทพฯ'.
 * Carried over verbatim from formatBillingAddress; this function is a MOVE, not
 * a rewrite, and the public flow's output is asserted unchanged.
 *
 * ── A VENUE CALLS THIS DIRECTLY, AND MUST ───────────────────────────────────
 * Not `formatBillingAddress`. Round 3 of this project shipped a bug where the
 * billing address rendered under a สถานที่จัดอบรม heading — a customer being
 * told their course would be held at their accounts department — and the fix
 * was to keep the two concepts apart BY NAME (see `training_venue` in
 * src/lib/email/models/inhouseRegistrationModel.js). Routing a venue through a
 * function called "billing" reintroduces exactly the naming that caused it,
 * even though the string would come out right. The shared thing is the prefix
 * rule, and that is what this function is.
 *
 * Pure: no env, no db, no `new Date()`.
 *
 * @param {{addressLine?: string, subDistrict?: string, district?: string,
 *          province?: string, postalCode?: string}} [address]
 * @returns {string} single-line address, `''` when there is nothing to render
 */
export function formatThaiAddress(address) {
  const a = address ?? {};
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
