/**
 * ONE reader for "is there a legacy invoice address to show, and what is it".
 *
 * ══ WHY THIS IS A MODULE AND NOT A `&&` IN EACH SCREEN ══════════════════════
 *
 * The same row appears on BOTH detail screens — `ข้อมูลสำหรับออกใบเสนอราคา` on
 * the public one, `ใบเสนอราคา` in-house — over two documents whose address paths
 * are not even in the same place: public keeps them under `invoice`, in-house at
 * the top level. What must NOT differ between the two is the QUESTION being
 * asked, and a condition spelled twice is a condition that will eventually be
 * answered twice, differently. So the condition is here, once, and each screen
 * passes it the three values from wherever it keeps them.
 *
 * The wording is here for the same reason and a stronger one: the label is the
 * only thing telling an admin why this record looks unlike every other record.
 * Two spellings of that explanation is two explanations.
 *
 * ══ THE CONDITION, AND WHY IT IS NOT WIDER THAN THIS ════════════════════════
 *
 * Both structured addresses null AND a non-empty legacy string. That is all.
 *
 * IT IS DELIBERATELY NOT "a thaiAddress with no addressLine counts as empty".
 * There are documents — 20 of them in `register_inhouse` at the time of writing
 * — that carry a legacy blob AND a `thaiAddress` holding nothing but a
 * `postalCode`, because an admin opened a legacy-imported enquiry and saved it
 * through the edit form, which wrote the one field they filled. Those show a
 * lone postcode today and they keep showing a lone postcode: this module returns
 * '' for them, the legacy row does not render, and nothing about them changes.
 *
 * That is not an oversight and it is not a regression. "A structured address
 * with no address line is empty" is a rule that would reach every screen and
 * every record in the system, not those 20 — it needs its own measurement
 * before it is a rule at all, and folding it in here would ship it unmeasured
 * under cover of a display change.
 *
 * ══ AND IT IS DISPLAY ONLY ══════════════════════════════════════════════════
 *
 * NOTHING here parses, splits, or derives. The postcode at the end of a Drupal
 * blob is not reliably positioned and a แขวง/เขต guessed wrong is worse than a
 * plain line, because a guess and a fact are indistinguishable once stored. See
 * the ruling in RegisterPublic.legacyInvoiceAddress's docstring: the blob stays
 * one blob. There is no writer for this path on either screen — not in either
 * screen's editable-field map, not in `updateRegistration`'s allowlist — and
 * this module returns a STRING, which is the shape that cannot be saved.
 *
 * PURE: no env, no db, no network, no `new Date()`.
 */

/** The row label. Says "legacy" in the label itself, not only in the hint. */
export const LEGACY_INVOICE_ADDRESS_LABEL = 'ที่อยู่ (ข้อมูลเดิม)';

/**
 * The one-line explanation under the value.
 *
 * It answers the question an admin actually has in front of this row — "why is
 * this one different" — in the order they ask it: where it came from, what shape
 * it is in, and that it cannot be fixed here. The last clause matters most: the
 * row sits inside a card with a แก้ไข button, so without it the natural reading
 * is that the address simply has not been filled in yet.
 */
export const LEGACY_INVOICE_ADDRESS_HINT =
  'นำเข้าจากเว็บไซต์เดิมเป็นข้อความบรรทัดเดียว ไม่ได้แยกเป็น แขวง / เขต / จังหวัด / รหัสไปรษณีย์ และแก้ไขที่นี่ไม่ได้';

/**
 * The accessible name of the copy control, which renders as `คัดลอก{label}`.
 *
 * It carries `(ข้อมูลเดิม)` too. A screen-reader user hearing only
 * "คัดลอกที่อยู่ใบเสนอราคา" would have no way to know this value is the
 * unstructured one — the hint is visual text beside it, not part of the button.
 */
export const LEGACY_INVOICE_ADDRESS_COPY_LABEL = 'ที่อยู่ใบเสนอราคา (ข้อมูลเดิม)';

/**
 * The legacy line to display, or '' when there is nothing to display.
 *
 * @param {object} p
 * @param {object|null|undefined} p.thaiAddress          the structured Thai subdocument
 * @param {object|null|undefined} p.internationalAddress the structured foreign subdocument
 * @param {string|null|undefined} p.legacyInvoiceAddress the Drupal free-text blob
 * @returns {string} '' when a structured address exists or the blob is empty
 */
export function legacyInvoiceAddressLine({
  thaiAddress,
  internationalAddress,
  legacyInvoiceAddress,
} = {}) {
  // `!= null` on purpose: null and undefined both mean "no structured address",
  // and an in-house document that has never had one carries the path as
  // undefined rather than null. `=== null` alone would let the legacy row render
  // BESIDE a structured address on exactly the documents where the two shapes
  // coexist, which is the one outcome this condition exists to prevent.
  if (thaiAddress != null || internationalAddress != null) return '';
  return typeof legacyInvoiceAddress === 'string' ? legacyInvoiceAddress.trim() : '';
}
