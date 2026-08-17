import {
  attendanceModeBlock,
  attendanceModeLabel,
  buildAttendeeBlocks,
  invoiceCountryLabel,
  invoiceTypeLabel,
  textBlock,
} from './labels';
import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';

/**
 * TemplateModel for POSTMARK_TEMPLATE_ALIAS_REG_USER — the confirmation a
 * public registrant receives the moment their form is accepted. No payment has
 * happened yet; the sales team follows up.
 *
 * Replaces src/lib/email/templates/registration-user.js, which stays as the
 * fallback while the alias is unset.
 *
 * ── VOCABULARY ──────────────────────────────────────────────────────────────
 * Keys follow the SHIPPED masterclass templates (`ref_no`, `coordinator_*`,
 * `course_*`, `attendee_list`) rather than the `ref_*` / `coord_*` naming of the
 * deleted buildPostmarkPayload, which never shipped. One vocabulary across the
 * account means a person editing two templates is not translating dialects.
 *
 * ── BILLING IS FLAT, AND THAT IS A FIX ──────────────────────────────────────
 * `billing_personal` and `billing_company` sit at the TOP LEVEL, reachable with
 * a single `{{#billing_personal}}`. They used to be nested inside
 * `document_requested`, and that nesting is exactly what made the draft
 * template render a billing HEADING WITH NOTHING UNDER IT: the outer section
 * opened, the inner one was addressed as if it were top-level, resolved to
 * nothing, and Mustachio dropped it silently. Nothing errors, nothing logs; the
 * customer just gets an empty box.
 *
 * `document_requested` is KEPT, reduced to a pure show/hide flag
 * (`{ show: true } | false`). It could have been dropped — the two billing
 * blocks already carry their own visibility — but the section HEADING and its
 * "the team will send your quotation" sentence belong to neither block, and
 * gating those on `{{#billing_personal}}…{{/billing_personal}}{{#billing_company}}
 * …{{/billing_company}}` would mean writing the heading twice, in two branches
 * that then drift. One flag for the section, one block per shape.
 *
 * NOTE the paid-receipt model still nests these inside `document_requested`.
 * The two shapes coexist deliberately: publicPaidReceiptModel.js is out of
 * scope for this design round and changing a shared helper would have altered
 * a template nobody has re-approved. That is a known divergence, not an
 * oversight — the flat builder below is local to this file for that reason.
 *
 * ── NOT MAPPED, AND WHY ─────────────────────────────────────────────────────
 *   · `total` / price — a registration confirmation predates payment.
 *   · `location` — masterclass vocabulary; a public class has a class date but
 *     no venue on this record.
 *   · `lineId`, `courseCode`, `ipAddress`, `source` — carried only by the
 *     DELETED admin template. This is the registrant's mail.
 *   · license_* — deferred by the user; deliberately absent, and deliberately
 *     nothing was removed on its account either.
 *
 * PURE: no env, no db, no network, no `new Date()`. `courseImage` is fetched by
 * the CALLER (src/app/api/registration/public/route.js) and passed in.
 *
 * @param {object}   p
 * @param {string}   p.referenceNumber
 * @param {object}   p.data            parsed publicRegistrationSchema output
 * @param {object[]} p.attendees       resolved list (coordinator prepended if attending)
 * @param {'TH'|'OTHER'} p.invoiceCountry
 * @param {string}   p.invoiceAddress  pre-flattened address string
 * @param {string}   p.courseImage     absolute Cloudinary URL, or '' — see the
 *   note on `course_image` below.
 */
export function buildPublicRegistrationModel({
  referenceNumber,
  data,
  attendees = [],
  invoiceCountry = 'TH',
  invoiceAddress = '',
  courseImage = '',
}) {
  const coordinator = data?.coordinator ?? {};

  const { attendee_list, attendee_later } = buildAttendeeBlocks({
    attendeesListProvided: data?.attendeesListProvided,
    attendees,
    attendeesCount: data?.attendeesCount,
    coordinatorIsAttending: coordinator.isAttending,
  });

  return {
    ref_no: referenceNumber ?? '',

    // `coordinator_name` is the full name (masterclass convention). The greeting
    // wants the first name alone, so it gets its own key rather than the
    // template slicing a string it cannot slice.
    coordinator_name: `${coordinator.firstName ?? ''} ${coordinator.lastName ?? ''}`.trim(),
    coordinator_first_name: coordinator.firstName ?? '',
    coordinator_email: coordinator.email ?? '',
    coordinator_phone: coordinator.phone ?? '',

    course_name: data?.courseName || data?.courseId || '',
    // The template's own fallback text, resolved here — Mustachio has no `||`.
    course_date: data?.classDate || 'ตามรอบที่เลือก',

    /**
     * A PLAIN STRING, empty when upstream had no cover or the fetch failed.
     * The template gates the <img> on `{{#course_image}}`, and an empty string
     * is falsy to Mustachio, so the whole <img> disappears rather than
     * rendering a broken-image icon at a `src=""`.
     */
    course_image: courseImage || '',

    /**
     * ประเภทการอบรม — ALWAYS present, for every schedule type.
     * Deliberately NOT merged with `attendance_mode`, which is the hybrid-only
     * "here is the option you picked" row. They answer different questions and
     * merging them loses one of the two: collapse into the block and the row
     * vanishes on classroom-only and online-only schedules (the bug — it was
     * blank for two of the three); collapse into the label and the mail starts
     * announcing a choice on a schedule where nothing was chosen.
     */
    training_type_label: trainingTypeLabel(data),
    attendance_mode: attendanceModeBlock({
      attendanceMode: data?.attendanceMode,
      scheduleType: data?.scheduleType,
    }),

    total_participants: data?.attendeesCount ?? attendees.length,
    attendee_list,
    attendee_later,

    ...buildFlatBillingBlocks({
      requestInvoice: Boolean(data?.requestInvoice),
      invoice: data?.invoice ?? null,
      invoiceCountry,
      invoiceAddress,
    }),

    billing_notes: textBlock(data?.notes),
  };
}

/**
 * scheduleType + attendanceMode → the one label the summary table always shows.
 *
 * `online` reports the Teams wording even though no choice was offered, because
 * the row answers "what is this course" and not "what did you pick".
 */
function trainingTypeLabel(data) {
  if (data?.scheduleType === 'online') return attendanceModeLabel('teams');
  if (data?.scheduleType === 'hybrid') return attendanceModeLabel(data?.attendanceMode);
  // classroom, or a record whose scheduleType never got set: a room booking is
  // the correct fail-safe, matching the hard-coded template.
  return attendanceModeLabel('classroom');
}

/**
 * The billing section, FLAT: a show/hide flag plus two mutually exclusive
 * top-level blocks.
 *
 * Local to this file rather than shared from ./labels, so that changing this
 * shape cannot reach publicPaidReceiptModel.js — which is out of scope and
 * still uses the nested `document_requested` form.
 *
 * The three optional rows stay `{ text } | false` so an absent branch or tax id
 * is HIDDEN. A plain '' would also be falsy to Mustachio, but only by accident:
 * the block form makes the intent explicit and is what the pure tier asserts.
 */
function buildFlatBillingBlocks({ requestInvoice, invoice, invoiceCountry, invoiceAddress }) {
  if (!requestInvoice || !invoice) {
    return {
      document_requested: false,
      // Empty rather than derived: with no invoice, `invoice?.type` would
      // resolve to the individual default and the model would carry a
      // confident-looking label for a document nobody asked for.
      invoice_type_label: '',
      invoice_country_label: '',
      billing_personal: false,
      billing_company: false,
    };
  }

  const isCorporate = invoice.type === 'corporate';
  const shared = {
    billing_tax_id: textBlock(invoice.taxId),
    // DERIVED, never stored. `invoice.branch` is a legacy read-only path; the
    // form writes branchType + branchCode for TH and branchFree for elsewhere,
    // and the country split lives in the formatter so this call site cannot get
    // it wrong. See src/lib/registration/branchLabel.js.
    billing_branch: textBlock(formatInvoiceBranchLabel(invoice)),
    billing_address: textBlock(invoiceAddress),
  };

  return {
    document_requested: { show: true },
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
