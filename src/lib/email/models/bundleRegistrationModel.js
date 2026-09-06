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
 *                  whole reason for the new template. `{ count, items }`, the
 *                  same shape `attendee_list` uses — the count travels with the
 *                  rows, so the heading can say "3 หลักสูตร" from inside the
 *                  block that owns them and there is no second idiom to learn.
 *   package_price  a bundle is quoted at a package price, and TWO PRICES are
 *                  the substance of the offer: the full price, struck through,
 *                  and what the package costs. `publicRegistrationModel` omits
 *                  price entirely on the grounds that "a registration
 *                  confirmation predates payment"; a bundle confirmation is
 *                  ABOUT the price, and still predates payment, which the
 *                  template says in words.
 *
 * ── NO PERCENTAGE, AND NO AMOUNT SAVED ───────────────────────────────────
 * The mail shows the two figures and lets the gap between them speak. It does
 * not compute a percentage, and it does not compute a saving. `discountPercent`
 * (the promotion section's ลด N% chip) and `discountAmount` (the web quotation
 * panel's three-line breakdown) both still exist and are both still read — by
 * the SCREEN. Neither reaches this model, and this builder takes no `discount`
 * argument, so wiring one back in is an API change rather than a one-line
 * addition that looks like it belongs.
 *
 * ── THE MONEY ARRIVES PRE-RESOLVED ───────────────────────────────────────
 * The two price LABELS are formatted by the caller and passed in as strings,
 * not derived here: `formatPrice` (lib/utils) is `Intl` th-TH currency
 * formatting, which is locale machinery rather than a label decision, and it is
 * the SAME call the promotion section makes for these same two numbers — so the
 * mail and the card cannot spell one price two ways. Keeping it out is what
 * leaves this file pure and exercisable without it.
 *
 * PURE: no env, no db, no network, no `new Date()`. `coverImage` is read by the
 * CALLER (src/app/api/registration/bundle/route.js) off the page it has already
 * loaded, and passed in — the same division the course model states for its own
 * `courseImage`.
 *
 * @param {object}   p
 * @param {string}   p.referenceNumber
 * @param {string}   p.bundleName
 * @param {string}   p.coverImage     the promotion page's cover URL, or '' —
 *   see the note on `course_image` below.
 * @param {Array<{courseName: string, dates: string, type: string}>} p.courses
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
  coverImage = '',
  courses = [],
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
     * THE PROMOTION PAGE'S COVER — a PLAIN STRING, empty when the page carries
     * none.
     *
     * The key is `course_image` and not `bundle_cover`, deliberately: it is the
     * same vocabulary the course and in-house templates already use for the
     * same thing, so a person editing two templates in the Postmark dashboard
     * is not translating dialects. That is the rule the whole key list follows
     * — `ref_no`, `coordinator_*`, `attendee_list` are all here for it.
     *
     * The template gates the <img> on `{{#course_image}}`, and an empty string
     * is falsy to Mustachio, so the whole <img> disappears rather than
     * rendering a broken-image icon at a `src=""`. Never null: Mustachio
     * renders a null section as an empty one, which is visually identical to a
     * correct hide reached by a different path.
     */
    course_image: coverImage || '',

    /**
     * THE COURSE TABLE — `{ count, items } | false`, iterated with
     * `{{#courses}}…{{#each items}}…{{/each}}…{{/courses}}`.
     *
     * ── THIS IS `attendee_list`'S SHAPE, AND THAT IS THE POINT ──────────────
     * It was a bare array beside a separate `course_count`, which made this
     * model speak two idioms for one job: the attendee table already carried
     * its own count INSIDE its block, and a reader of this file had to learn
     * both. One idiom, and the count travels with the rows it counts.
     *
     * `course_count` is retired by the same change. It existed because
     * Mustachio cannot count a section and the heading needs the number — still
     * true, and now answered by `{{#courses}}({{count}} หลักสูตร){{/courses}}`,
     * which reads the number from inside the block that owns it.
     *
     * ── `false`, NOT AN EMPTY BLOCK ────────────────────────────────────────
     * No courses hides the HEADING as well as the table, rather than announcing
     * "0 หลักสูตร" over an empty one. Same rule, same reason as every other
     * conditional here: an object or the boolean `false`, never null, because
     * Mustachio renders a null section as an empty one and the two failures
     * then look identical.
     *
     * Every row is fully resolved — the training-type label is a string, not an
     * enum for the template to branch on — because Mustachio cannot map a value
     * to a label. Same rule the whole `labels.js` module exists for.
     */
    courses: rows.length
      ? {
          count: rows.length,
          items: rows.map((c) => ({
            course_name: c.courseName || c.courseId || '',
            course_date: c.dates || 'ตามรอบที่กำหนด',
            training_type_label: scheduleTypeLabel(c.type),
          })),
        }
      : false,

    /**
     * THE PRICE — an object-or-`false`, like every other conditional here.
     *
     * ── ONE ROW NOW, AND NO PERCENTAGE ─────────────────────────────────────
     *
     *     ราคา 38,990 บาท จากปกติ 55,700 บาท
     *
     * It was two stacked rows (ราคาปกติ struck through, then ราคาแพ็กเกจ). One
     * line says the same thing in a mail, where a two-row table for two numbers
     * is more scaffolding than content. The struck-through styling went with the
     * half it belonged to: the `จากปกติ` figure.
     *
     * THE SHAPE DID NOT HAVE TO CHANGE FOR THAT, and that is worth saying rather
     * than rediscovering: `list_text` was already a BLOCK, so
     * `{{#list_text}}…{{/list_text}}` hides the entire "จากปกติ …" fragment and
     * the row degrades to "ราคา 38,990 บาท" with no dangling preposition. The
     * two-row template needed exactly the same key to hide a whole row.
     *
     * The mail still states the full price and the package price and NOTHING
     * about a percentage or an amount saved; the size of the gap is the offer,
     * and the customer can see it.
     *
     * ── THE NUMBERS ARE BARE; บาท IS THE TEMPLATE'S ────────────────────────
     * `net_text` is `38,990`, not `฿38,990` and not `38,990 บาท`. The caller
     * formats with `formatBaht` (lib/utils) rather than `formatPrice`, because
     * the row writes บาท itself and the symbol made the unit appear twice.
     *
     * The unit is left to the TEMPLATE rather than baked in here, unlike every
     * label in this model — and the distinction is real: labels are resolved
     * here because Mustachio cannot map a value to one. บาท maps nothing. It is
     * static prose exactly like ราคา and จากปกติ on either side of it, and a
     * person editing the wording in the Postmark dashboard should be able to
     * change all three in the same place.
     *
     * So there is deliberately NO discount key. `discountPercent` still drives
     * the promotion section's ลด N% chip and `discountAmount` still drives the
     * web quotation panel's three-line breakdown — both stay, both are for the
     * SCREEN, and neither reaches this model. The builder does not take a
     * `discount` argument at all, which is what stops one being wired back in
     * as a plausible-looking addition.
     *
     * ── GATED ON THE NET PRICE ALONE ───────────────────────────────────────
     * `false` when there is no net price, even if a list price exists. A list
     * price by itself is a number with nothing to compare it to, and rendering
     * a table for it would put a struck-through figure above an empty row — the
     * same "heading with nothing under it" the flat billing shape exists to
     * prevent. The whole table drops instead.
     *
     * ── `list_text` IS A BLOCK, NOT A STRING ───────────────────────────────
     * `textBlock`, exactly as `billing_tax_id` uses it: `{ text }` when there is
     * a list price, `false` when there is not, so `{{#list_text}}…{{/list_text}}`
     * hides the whole `จากปกติ …` fragment. An empty string would leave the
     * preposition on screen with nothing after it — "ราคา 38,990 บาท จากปกติ
     *  บาท" — which is the failure this shape exists to prevent.
     *
     * THE TEMPLATE THIS MODEL IS WRITTEN FOR:
     *
     *   ราคา {{net_text}} บาท{{#list_text}} จากปกติ <s>{{text}} บาท</s>{{/list_text}}
     */
    package_price: priceLabelNet
      ? {
          net_text: priceLabelNet,
          list_text: textBlock(priceLabelList),
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
