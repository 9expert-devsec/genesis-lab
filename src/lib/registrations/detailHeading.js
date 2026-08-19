/**
 * THE DETAIL SCREEN'S H1, FOR BOTH SOURCES.
 *
 * `ข้อมูลการลงทะเบียน : สมชาย ใจดี` — a fixed label, a separator, and the field
 * that identifies the record to the person reading it.
 *
 * ══ WHY THIS IS A MODULE AND NOT TWO TEMPLATE LITERALS ══════════════════════
 *
 * Because of the empty case, which is the whole reason the heading is delicate.
 * The identifying field CAN BE MISSING — a public registration whose coordinator
 * has no first or last name, an in-house request with no company recorded — and
 * the obvious spelling
 *
 *     `ข้อมูลการลงทะเบียน : ${name}`
 *
 * renders `ข้อมูลการลงทะเบียน : ` at 40px with a colon pointing at nothing. That
 * is not a cosmetic problem: a heading ending in a separator reads as a value
 * that failed to load, and the reader cannot tell it from a page that broke.
 *
 * Written inline it would be one such literal per screen and the empty branch
 * would have to be remembered twice. Here it is one function, and
 * test/pure/registrationDetailHeading drives every branch of it without a DOM.
 *
 * ══ WHAT REPLACED WHAT ══════════════════════════════════════════════════════
 *
 * The heading used to be `ใบสมัคร <refNo>` / `In-house Request <refNo>`, with
 * the reference number in mono beside it. THE REFERENCE NUMBER HAS LEFT THE
 * HEADING ENTIRELY and now appears as a row of the ข้อมูลระบบ card at the foot
 * of the page.
 *
 * That move has a consequence worth stating where someone will find it: round 3
 * deleted the เลขอ้างอิง column from BOTH list tables, and the reason recorded
 * at the time was that the detail page's heading carried it. So the ข้อมูลระบบ
 * row is not a nicety — with the heading changed it is the ONLY place in the
 * whole UI the reference number appears, apart from the two delete-confirm
 * dialogs, which quote it and are deliberately left alone.
 *
 * Pure, no imports, no React. Safe on both sides of the network boundary.
 */

/**
 * The label both screens carry. ONE constant rather than one per screen: the
 * two headings are the same sentence about two collections, and a screen that
 * drifted to its own wording would be the first step back towards the two
 * unrelated headings this replaces.
 */
export const DETAIL_HEADING_LABEL = 'ข้อมูลการลงทะเบียน';

/**
 * The separator, with its spaces baked in.
 *
 * ` : ` and not `: `. The space BEFORE the colon is deliberate and is Thai
 * typographic practice for this construction — Thai does not space words, so a
 * colon set tight against a Thai glyph reads as part of it. It is spelled here
 * once so the two screens cannot disagree by a space, which is exactly the kind
 * of difference nobody sees in review and everybody sees on the page.
 */
const SEPARATOR = ' : ';

/**
 * Build the heading.
 *
 * @param {string|null|undefined} identifier the coordinator's name (public) or
 *        the company (in-house). Whitespace-only counts as absent — a
 *        coordinator record holding `{firstName: ' ', lastName: ''}` joins to a
 *        single space, which is truthy and would have produced the bare colon
 *        this function exists to prevent.
 * @returns {string} the label alone when there is nothing to name, otherwise
 *        `label : identifier`. NEVER a trailing separator.
 */
export function detailHeading(identifier) {
  const trimmed = String(identifier ?? '').trim();
  return trimmed ? `${DETAIL_HEADING_LABEL}${SEPARATOR}${trimmed}` : DETAIL_HEADING_LABEL;
}

/**
 * The public screen's identifying field: the coordinator's name.
 *
 * ── WHY THE COORDINATOR AND NOT THE COURSE ────────────────────────────────
 * The course is already the SUBTITLE, one line down, and it is also the biggest
 * cell of the row the reader clicked to get here. The coordinator is the person
 * the admin is about to email or ring, and it is the one fact on the page that
 * answers "whose registration is this".
 *
 * Joined and re-trimmed rather than interpolated: a record with a first name and
 * no last name must not produce a trailing space, because `detailHeading` would
 * then be handed a truthy string whose visible content ends mid-name.
 */
export function publicHeadingIdentifier(doc) {
  const c = doc?.coordinator ?? {};
  return [c.firstName, c.lastName].map((v) => String(v ?? '').trim()).filter(Boolean).join(' ');
}

/**
 * The in-house screen's identifying field: THE COMPANY.
 *
 * ══ THE CHOICE, AND WHY IT IS NOT THE CONTACT NAME ══════════════════════════
 *
 * Both were candidates. The company wins on three counts:
 *
 *   1. AN IN-HOUSE REQUEST IS FROM AN ORGANISATION. The contact is whoever was
 *      asked to send the form; they change between the enquiry and the quote and
 *      again before the invoice. The company is the party the quotation is
 *      addressed to and the thing the deal is filed under.
 *   2. IT AGREES WITH HOW THE READER GOT HERE. The in-house LIST table's primary
 *      column is the company name, so the heading names the same thing the row
 *      they clicked did. A heading naming the contact would make the reader
 *      check they had opened the right record.
 *   3. THE CONTACT IS NOT LOST. It is the card immediately below, with the
 *      email and phone that make it actionable — which the heading could not
 *      carry anyway.
 *
 * The public screen naming a PERSON and this one naming an ORGANISATION is not
 * an inconsistency: each names the party that identifies its own record type. A
 * public registration is booked by an individual and frequently has no company
 * at all.
 *
 * ── IT FOLLOWS `displayCompany`, INCLUDING THE DIVERGENCE RULE ─────────────
 * Same precedence as the card below: the CONTACT company when the two names
 * disagree (a legacy document from the two-input form), otherwise the quotation
 * company falling back to the contact one. Choosing differently here would put
 * one company in the heading and another in the card three inches below it.
 */
export function inhouseHeadingIdentifier(doc) {
  const contactCompany = String(doc?.companyName ?? '').trim();
  const quotationCompany = String(doc?.quotationCompany ?? '').trim();
  const diverges = Boolean(contactCompany && quotationCompany && contactCompany !== quotationCompany);
  return diverges ? contactCompany : (quotationCompany || contactCompany);
}
