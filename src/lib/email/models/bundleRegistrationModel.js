import {
  buildAttendeeBlocks,
  invoiceCountryLabel,
  invoiceTypeLabel,
  scheduleTypeLabel,
  textBlock,
} from './labels';
import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';

/**
 * TemplateModel for POSTMARK_TEMPLATE_ALIAS_REG_BUNDLE — the confirmation a
 * customer receives when they request a quotation for a bundle.
 *
 * ══ A NEW ALIAS, NOT A VARIANT OF THE COURSE ONE ═══════════════════════════
 *
 * `publicRegistrationModel` carries `course_name` and `course_date` as SINGLE
 * SCALARS, because an ordinary registration is one course and one round. A
 * bundle is N of each plus a package price, and Mustachio has no conditionals
 * beyond section blocks — so serving both from one alias would mean wrapping
 * the entire course row of the SHIPPED registrant template in `{{^bundle}}` and
 * adding a price block inside it. That is an edit to a template currently
 * delivering real registrations, made to accommodate a feature it has nothing
 * to do with.
 *
 * A separate alias leaves that template untouched, and the two share what is
 * genuinely shared: `buildAttendeeBlocks`, the invoice labels, `textBlock`, and
 * `formatInvoiceBranchLabel`. The billing block is deliberately the FLAT shape
 * publicRegistrationModel uses (top-level `billing_personal` /
 * `billing_company` beside a `document_requested` show/hide flag) rather than
 * the nested shape the paid-receipt model still has — that nesting is what once
 * rendered a billing heading with nothing under it, and a new template should
 * not inherit it.
 *
 * ══ WHAT A BUNDLE NEEDS THAT THE COURSE MODEL HAS NO ROOM FOR ══════════════
 *
 *   bundle_name    the package, which is what the customer thinks they bought
 *   courses        a REPEATING section: one row per course+round. This is the
 *                  whole reason for the new template.
 *   course_count   Mustachio cannot count a section, so the number is resolved
 *                  here — the sentence "3 หลักสูตร" is not expressible in the
 *                  template otherwise.
 *   price block    a bundle is quoted at a package price, and the two prices
 *                  plus the derived percentage are the substance of the offer.
 *                  `publicRegistrationModel` omits price entirely on the
 *                  grounds that "a registration confirmation predates payment";
 *                  a bundle confirmation is ABOUT the price, and still predates
 *                  payment, which the template says in words.
 *
 * ── THE PERCENTAGE AND THE MONEY ARRIVE PRE-RESOLVED ─────────────────────
 * `discount` and the two price LABELS are computed by the caller and passed in,
 * not derived here. Both need something this module deliberately does not
 * have: `discountPercent` is the shared derivation the page and the editor also
 * read (so the mail cannot disagree with the chip the customer just saw), and
 * `formatPrice` is `Intl` currency formatting, which is locale machinery rather
 * than a label decision. Keeping them out is what leaves this file pure and
 * exercisable without either.
 *
 * The percentage is still never STORED — it is derived at every read, here as
 * on the page, from the two prices that must match a real quotation.
 *
 * PURE: no env, no db, no network, no `new Date()`.
 *
 * @param {object}   p
 * @param {string}   p.referenceNumber
 * @param {string}   p.bundleName
 * @param {Array<{courseName: string, dates: string, type: string}>} p.courses
 * @param {number|null} p.listPrice
 * @param {number|null} p.netPrice
 * @param {number|null} p.discount   whole percent, or null for no chip
 * @param {string}   p.priceLabelNet   pre-formatted currency, or ''
 * @param {string}   p.priceLabelList  pre-formatted currency, or ''
 * @param {object}   p.data           the validated bundle payload
 * @param {object[]} p.attendees
 * @param {'TH'|'OTHER'} p.invoiceCountry
 * @param {string}   p.invoiceAddress
 */
export function buildBundleRegistrationModel({
  referenceNumber,
  bundleName = '',
  courses = [],
  discount = null,
  priceLabelNet = '',
  priceLabelList = '',
  data,
  attendees = [],
  invoiceCountry = 'TH',
  invoiceAddress = '',
}) {
  const coordinator = data?.coordinator ?? {};
  const rows = Array.isArray(courses) ? courses : [];

  const { attendee_list, attendee_later } = buildAttendeeBlocks({
    attendeesListProvided: data?.attendeesListProvided,
    attendees,
    attendeesCount: data?.attendeesCount,
    coordinatorIsAttending: coordinator.isAttending,
  });

  return {
    ref_no: referenceNumber ?? '',

    // Same vocabulary as the course template — `ref_no`, `coordinator_*`,
    // `attendee_list` — so someone editing the two templates in the Postmark
    // dashboard is not translating dialects.
    coordinator_name: `${coordinator.firstName ?? ''} ${coordinator.lastName ?? ''}`.trim(),
    coordinator_first_name: coordinator.firstName ?? '',
    coordinator_email: coordinator.email ?? '',
    coordinator_phone: coordinator.phone ?? '',

    bundle_name: bundleName || 'แพ็กเกจอบรม',
    /**
     * ONE ROW PER COURSE, iterated with `{{#courses}}…{{/courses}}`.
     *
     * Every row is fully resolved — the training-type label is a string, not an
     * enum for the template to branch on — because Mustachio cannot map a value
     * to a label. Same rule the whole `labels.js` module exists for.
     */
    courses: rows.map((c) => ({
      course_name: c.courseName || c.courseId || '',
      course_date: c.dates || 'ตามรอบที่กำหนด',
      training_type_label: scheduleTypeLabel(c.type),
    })),
    // Mustachio cannot count a section. The sentence needs the number.
    course_count: rows.length,

    /**
     * The price block, as an object-or-`false` like every other conditional
     * here. `false` when neither price is set — an unpriced bundle should not
     * mail a heading with nothing under it, which is the exact failure the flat
     * billing shape was introduced to fix.
     *
     * `discount_chip` is separately `false` at 0%, because a bundle sold at its
     * list price is honest and "ลด 0%" advertises nothing — the same `> 0` rule
     * the section's own chip applies.
     */
    package_price: priceLabelNet || priceLabelList
      ? {
          net_price: priceLabelNet,
          list_price: textBlock(priceLabelList),
          discount_chip: discount != null && discount > 0 ? { percent: String(discount) } : false,
        }
      : false,

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
 * The billing section, FLAT — a show/hide flag plus two mutually exclusive
 * top-level blocks.
 *
 * ── KNOWINGLY THE SECOND COPY OF THIS FUNCTION ────────────────────────────
 * `publicRegistrationModel.js` has one, local to itself, and its header says
 * why it is local: sharing it would reach `publicPaidReceiptModel.js`, which is
 * still on the older nested shape and whose template nobody has re-approved.
 * That reasoning has not changed, so this file follows the same rule rather
 * than being the change that breaks it — extracting the shared version is a
 * decision about THREE templates and belongs to whoever re-approves the receipt.
 *
 * Stated rather than silently duplicated: this is a copy, it is deliberate, and
 * the condition for collapsing the three into one is written down.
 */
function buildFlatBillingBlocks({ requestInvoice, invoice, invoiceCountry, invoiceAddress }) {
  if (!requestInvoice || !invoice) {
    return {
      document_requested: false,
      invoice_type_label: '',
      invoice_country_label: '',
      billing_personal: false,
      billing_company: false,
    };
  }

  const isCorporate = invoice.type === 'corporate';
  const shared = {
    billing_tax_id: textBlock(invoice.taxId),
    // DERIVED, never stored — `invoice.branch` is legacy read-only and the
    // country split lives in the formatter so this call site cannot get it wrong.
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
