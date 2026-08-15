/**
 * Label vocabulary shared by the three registration TemplateModel builders.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * A Postmark Template holds Subject + HTML + Text and a Mustachio renderer.
 * It has no `if attendanceMode === 'teams'`, no dictionary, no fallback
 * expression worth trusting. So EVERY branch that used to live inside the
 * hard-coded HTML has to be resolved on this side of the wire, and the model
 * that crosses it must be renderable by substitution and section-iteration
 * alone. These helpers are that resolution step, in one place, because
 * publicRegistrationModel and publicPaidReceiptModel render the same course
 * summary and the same billing block and must not drift apart.
 *
 * ── THE OBJECT-OR-`false` CONVENTION, AND WHY `null` IS BANNED ──────────────
 * Every conditional block is either an OBJECT or the boolean `false`, never
 * `null` and never `undefined`. Mustachio renders `{{#block}}…{{/block}}` for
 * a null as an EMPTY block and drops the section silently — the same visual
 * result as `false`, reached by a different path, so a bug that turns a real
 * block into null looks exactly like a correctly-hidden one. `false` is the
 * only "hidden" spelling; anything else is a defect, and the pure tier asserts
 * it field by field.
 *
 * Pure: no env, no db, no `new Date()`. Every value derives from arguments.
 */

import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';

export const ATTENDANCE_TEAMS = 'Online via Microsoft Teams';
export const ATTENDANCE_CLASSROOM = 'Classroom';

/**
 * `teams` → the Teams label, anything else → Classroom.
 *
 * Matches the hard-coded templates exactly: they test `=== 'teams'` and treat
 * every other value (including undefined) as Classroom, which is the correct
 * fail-safe — a registration whose mode never got set is a room booking.
 */
export function attendanceModeLabel(attendanceMode) {
  return attendanceMode === 'teams' ? ATTENDANCE_TEAMS : ATTENDANCE_CLASSROOM;
}

/**
 * The mode row is HYBRID-ONLY. On a classroom-only or online-only schedule the
 * mode carries no information (there is nothing to have chosen between) and the
 * templates omit the row entirely rather than state the obvious.
 *
 * Returned as a block rather than a `show` flag plus a sibling label, so the
 * Postmark side is `{{#attendance_mode}}…{{label}}…{{/attendance_mode}}` and
 * the label cannot be rendered outside its own conditional by mistake.
 */
export function attendanceModeBlock({ attendanceMode, scheduleType }) {
  return scheduleType === 'hybrid'
    ? { label: attendanceModeLabel(attendanceMode) }
    : false;
}

/**
 * รูปแบบเนื้อหา — the in-house content mode, as a plain string, ALWAYS present.
 *
 * The schema is `z.enum(['standard', 'custom']).default('standard')`, so there
 * is no absent case to hide and no block to gate: every enquiry has a mode and
 * the mail states it.
 *
 * ── THIS IS KNOWINGLY THE THIRD COPY OF THIS WORDING ────────────────────────
 * Two others already exist and they DISAGREE with each other:
 *
 *   · `CONTENT_MODES` — src/components/registration/InhouseForm.jsx:40
 *     'ใช้ Outline มาตรฐาน' / 'ปรับเนื้อหาบางส่วน'
 *   · `CONTENT_MODE_LABEL` — src/app/admin/registrations/inhouse/
 *     _components/InhouseDetailClient.jsx:61
 *     'Outline มาตรฐาน' / 'ปรับเนื้อหา' / 'ให้แนะนำ'
 *
 * This copy follows THE FORM's wording, because that is the text the customer
 * read on the card they clicked and on the review step before they submitted.
 * An acknowledgement that renames their choice reads as a different choice.
 * It therefore diverges from the ADMIN map, which is shorter on both values —
 * fine, since that screen is read by the sales team and not by the customer.
 *
 * The admin map also carries a third entry, `consult: 'ให้แนะนำ'`, which is
 * DEAD: the enum has no such value, so nothing can be written with it. Its
 * comment there claims it is for historical enquiries. That claim is not
 * verified here and is not this function's business; it is recorded so the
 * next person comparing the three does not read the difference as a gap.
 *
 * The other two are NOT refactored into this one. The form's list carries
 * `desc` and `icon` alongside the label and drives the card UI; the admin map
 * is a lookup over historical values. Collapsing three shapes into one is a
 * separate change with its own blast radius.
 */
export function contentModeLabel(contentMode) {
  return contentMode === 'custom' ? 'ปรับเนื้อหาบางส่วน' : 'ใช้ Outline มาตรฐาน';
}

/** Invoice/quotation recipient kind. Non-corporate is an individual. */
export function invoiceTypeLabel(type) {
  return type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป';
}

/**
 * `OTHER` → ต่างประเทศ, anything else → ไทย.
 *
 * DELIBERATE NORMALISATION, and the only behavioural difference between these
 * builders and the templates they replace: the templates ask `=== 'TH'`, so an
 * explicit `null` or a typo renders as ต่างประเทศ — a Thai company labelled
 * foreign. The schema only ever emits 'TH' | 'OTHER', so the two agree on all
 * real data; asking the positive question makes the failure mode "labelled
 * Thai" instead, which is the safer half of a coin flip on junk input.
 */
export function invoiceCountryLabel(country) {
  return country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย';
}

/** A row the template omits when empty, as a block. `''`/null/undefined → false. */
export function textBlock(value) {
  const text = typeof value === 'string' ? value.trim() : value ? String(value) : '';
  return text ? { text } : false;
}

/**
 * The attendee table and the "we'll send the list later" note — TWO blocks,
 * and there is a THIRD state where both are `false`.
 *
 * The hard-coded templates have exactly this shape and it is easy to miss:
 * a list was promised (`attendeesListProvided` true) but `attendees` is empty
 * renders NEITHER the table NOR the note. Collapsing that into "show the note
 * whenever the table is absent" would tell a customer who did submit names
 * that their names are missing. So the note is gated on the strict
 * `=== false`, not on the absence of the table.
 *
 * @returns {{attendee_list: {count:number, items:object[]}|false,
 *            attendee_later: {show:true}|false}}
 */
export function buildAttendeeBlocks({
  attendeesListProvided,
  attendees = [],
  attendeesCount,
  coordinatorIsAttending = false,
}) {
  const list = Array.isArray(attendees) ? attendees : [];
  const showList = Boolean(attendeesListProvided) && list.length > 0;

  return {
    attendee_list: showList
      ? {
          count: attendeesCount ?? list.length,
          items: list.map((a, i) => ({
            index: i + 1,
            name: `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim(),
            email: a?.email ?? '',
            phone: a?.phone ?? '',
            // The coordinator, when attending, is prepended server-side by the
            // route — so slot 0 and only slot 0 can carry the marker.
            is_coordinator: i === 0 && Boolean(coordinatorIsAttending),
          })),
        }
      : false,
    attendee_later: attendeesListProvided === false ? { show: true } : false,
  };
}

/**
 * The billing block, gated on the customer having actually asked for a document.
 *
 * `billing_personal` and `billing_company` are mutually exclusive and nested
 * INSIDE the request block, so the Postmark template opens one conditional to
 * decide whether there is a billing section at all and a second to decide which
 * of the two shapes it takes. Flattening them to siblings (which the shipped
 * masterclass quote template does) means three top-level conditionals that can
 * disagree — a model with `document_requested: false` and a live
 * `billing_company` renders a stray company name under no heading.
 *
 * @returns {object|false}
 */
export function buildDocumentRequestedBlock({
  requestInvoice,
  invoice,
  invoiceCountry,
  invoiceAddress,
}) {
  if (!requestInvoice || !invoice) return false;

  const isCorporate = invoice.type === 'corporate';
  const shared = {
    billing_tax_id: textBlock(invoice.taxId),
    // DERIVED, never stored — `invoice.branch` is a legacy read-only path and a
    // registration written by the current form leaves it empty. Reading it here
    // would blank the สาขา row on every new paid receipt. See
    // src/lib/registration/branchLabel.js.
    billing_branch: textBlock(formatInvoiceBranchLabel(invoice)),
    billing_address: textBlock(invoiceAddress),
  };

  return {
    invoice_type_label: invoiceTypeLabel(invoice.type),
    invoice_country_label: invoiceCountryLabel(invoiceCountry),
    billing_personal: isCorporate
      ? false
      : {
          billing_name: `${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim(),
          ...shared,
        },
    billing_company: isCorporate
      ? {
          billing_company_name: invoice.companyName ?? '',
          ...shared,
        }
      : false,
  };
}
