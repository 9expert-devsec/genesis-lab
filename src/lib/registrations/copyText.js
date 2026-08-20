/**
 * THE TEXT SHAPE OF EVERY MULTI-VALUE COPY ON THE REGISTRATION SCREENS.
 *
 * ══ WHY THIS IS A MODULE AND NOT THREE TEMPLATE LITERALS ════════════════════
 *
 * A single-value copy has no shape to decide: the email IS the text. A
 * MULTI-value copy does, and the shapes multiply silently — the public attendee
 * row, the in-house contact and the two addresses would each grow their own
 * separator, their own field order and their own answer to "what if the phone is
 * missing", and nobody would notice because each looks right on its own.
 *
 * So the shapes live here, once, and are asserted here. `formatBillingAddress`
 * is deliberately NOT duplicated into this file — an address already has one
 * formatter and a second would be exactly the defect this module exists to
 * prevent. Callers copy what the screen already renders.
 *
 * ══ WHAT AN ADMIN IS PASTING INTO, AND WHY THAT DECIDES THE SEPARATOR ═══════
 *
 * THE ASSUMPTION, STATED SO IT CAN BE CORRECTED: the destination is a
 * spreadsheet or a form field in another system — an attendance sheet, a
 * certificate mail-merge, a quotation. It is not prose and it is not this
 * system.
 *
 * That decides two things:
 *
 *   · TAB-SEPARATED, not comma. A paste of tab-separated text lands in adjacent
 *     CELLS in Excel and Google Sheets; a comma-separated one lands in a single
 *     cell and has to be split by hand. Names and addresses also contain commas
 *     and do not contain tabs.
 *
 *   · POSITIONAL, so empty fields keep their column. An attendee with no phone
 *     copies as `name<TAB>email<TAB>` rather than `name<TAB>email` — the
 *     trailing tab looks like nothing and IS the point: paste five attendees and
 *     every phone lands in column C whether or not each row has one. Dropping
 *     empty fields would shift columns per row, which is the failure that makes
 *     a pasted block unusable and is invisible until someone sorts it.
 *
 * ── AND WHY NO HEADER ROW ─────────────────────────────────────────────────
 * A single attendee copied with a header is two lines where one was wanted, and
 * the header repeats on every paste. The columns are named on screen, three
 * inches from the button.
 */

/** The separator, named once so a caller cannot pick a different one. */
export const COPY_FIELD_SEPARATOR = '\t';

/**
 * ONE ATTENDEE, as a spreadsheet row: name, email, phone.
 *
 * The name is the two parts joined by a space and trimmed — the same shape the
 * table's name cell renders, not a third spelling of it.
 *
 * ── IT RETURNS '' FOR A ROW WITH NOTHING IN IT ────────────────────────────
 * Not two bare tabs. An empty slot is a row an admin added and did not fill, and
 * copying it would put invisible whitespace on the clipboard — the user pastes
 * and sees nothing happen, which reads as the button being broken. The caller
 * uses the empty string to decide the control does not render at all; see the
 * absent-means-absent rule the field rows are held to.
 */
export function attendeeCopyText(attendee) {
  const a = attendee ?? {};
  const name = `${String(a.firstName ?? '').trim()} ${String(a.lastName ?? '').trim()}`.trim();
  const email = String(a.email ?? '').trim();
  const phone = String(a.phone ?? '').trim();
  if (!name && !email && !phone) return '';
  return [name, email, phone].join(COPY_FIELD_SEPARATOR);
}

/**
 * A WHOLE ROSTER, one attendee per line.
 *
 * Empty rows are dropped rather than emitted as blank lines: a blank line in the
 * middle of a pasted block is a row the spreadsheet still counts, and the admin
 * has to find and delete it. A roster whose every row is empty returns '' by the
 * same rule as one attendee.
 */
export function rosterCopyText(attendees = []) {
  return (Array.isArray(attendees) ? attendees : [])
    .map(attendeeCopyText)
    .filter(Boolean)
    .join('\n');
}

/**
 * A PERSON'S NAME from any of the three shapes these screens hold — the public
 * coordinator, an attendee, and the in-house contact.
 *
 * One function rather than three, because "first and last joined by a space,
 * trimmed" is the same rule in all three places and a screen that spelled one of
 * them differently would be copying something the reader did not see.
 */
export function personCopyText({ firstName, lastName } = {}) {
  return `${String(firstName ?? '').trim()} ${String(lastName ?? '').trim()}`.trim();
}
