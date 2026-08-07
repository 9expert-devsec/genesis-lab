import { textBlock } from './labels';
import { formatBranchLabel } from '@/lib/registration/branchLabel';

/**
 * TemplateModel for POSTMARK_TEMPLATE_ALIAS_INHOUSE_USER — the acknowledgement
 * sent to whoever submitted an in-house training enquiry. No date, no price:
 * this email says "we have it, here is your reference, sales will call".
 *
 * Replaces src/lib/email/templates/registration-inhouse-user.js, which stays as
 * the fallback while the alias is unset.
 *
 * ── THE TWO ADDRESSES ARE DIFFERENT ADDRESSES ───────────────────────────────
 * `training_venue` is WHERE THE TRAINING HAPPENS. `billing_address` is where
 * the quotation is sent. The draft template conflated them — it rendered the
 * billing address under a "สถานที่จัดอบรม" heading — and a customer reading
 * that is being told their course will be held at their accounts department.
 * They come from different form fields, appear under different headings, and
 * are false in different situations: there is no venue for an online or
 * flexible enquiry, and no billing address until someone fills the quotation
 * section. Keeping them apart is the specific reason `training_venue` exists.
 *
 * For the same reason there is no longer a `quotation_address` key. It held the
 * billing address under a name that invited exactly the mix-up above, and one
 * value with two names is how the wrong one ends up in the template. RENAMED,
 * not duplicated — see the report's key list.
 *
 * ── `course_name`: THE FIRST COURSE ONLY, AND WHY THAT IS CORRECT ───────────
 * The form is a SINGLE-SELECT that wraps its one value in an array —
 * `setValue('coursesInterested', [e.target.value])`, InhouseForm.jsx — and
 * every read site takes `[0]`. The zod schema is `z.array(...).min(1)`, which
 * is WIDER than the UI, and that width is not evidence of multi-select; it is
 * just a loose schema. So this model renders the first entry, matching the
 * cover image, which is taken from the same course.
 *
 * THE GAP, STATED SO A CUSTOMER NEVER DISCOVERS IT: if a second entry ever
 * reaches this model — a schema-valid API client, a future multi-select — it is
 * SILENTLY DROPPED. Nothing errors and nothing logs; the customer simply reads
 * a confirmation naming one of the courses they asked about. It is currently
 * unreachable through the UI, and a test pins the behaviour so the day it stops
 * being unreachable, the limit is already written down rather than discovered.
 *
 * ── AND IT IS A TITLE, NOT A CODE ───────────────────────────────────────────
 * `coursesInterested` holds course_id CODES ("COPILOT-STU"), because
 * InhousePageContent maps upstream with `id: c.course_id`. The route resolves
 * the display title from the SAME fetch it already makes for the cover and
 * passes it in as `courseName`.
 *
 * The fallback is the CODE, never ''. A lookup can fail — upstream 500, DNS,
 * timeout — and it must not take the course name with it: "COPILOT-STU" is ugly
 * but actionable, whereas a blank course name on a quote-request confirmation
 * leaves the customer with no idea what they asked about. The fallback lives
 * HERE rather than in the route so it is guaranteed for every caller and
 * testable without a network.
 *
 * ── `company_name` AND `billing_company_name` ARE NOW ONE FIELD ─────────────
 * The form asked for the company twice — once in ผู้ประสานงาน as `companyName`
 * and once in the quotation block as `quotationCompany` — and people filled the
 * two in differently, which is how an acknowledgement ended up greeting one
 * legal entity and billing another. There is one input now, and BOTH keys are
 * still emitted from it: the Postmark template uses `company_name` in the
 * opening sentence and `billing_company_name` in the quotation table, and
 * deleting either would leave a hole in a template nobody has re-approved.
 * Same value under two keys is safe HERE, where both are read-only renderings
 * of one source; what is unsafe is two SOURCES, which is what was removed.
 *
 * `companyName` itself survives as a Mongoose path, written by exactly one line
 * in the API route as a legacy-compat mirror for the admin list's $regex.
 *
 * ── NOT MAPPED, AND WHY ─────────────────────────────────────────────────────
 * `contentMode`, `contentDetails`, `onlineRegion`, `onlineTimezone`,
 * `preferredContact*`, `scheduleNote`. Every one was rendered by
 * registration-inhouse-admin.js and by NOTHING else. That template is deleted
 * and this is the customer's mail, so they are not here — a real loss of detail
 * for the team, since the BCC copy of this mail is now the only notification
 * anyone internal receives. The enquiry itself is in the admin dashboard, where
 * whoever answers it has to be anyway.
 *
 * `objective`, `skillLevel` and `onsiteEquipment` USED TO BE ON THAT LIST and
 * are no longer, for a different reason: the form stopped asking. They are not
 * "carried elsewhere" and they are not "dropped from the mail" — they do not
 * exist on a current submission at all. The paths remain on the Mongoose schema
 * so historical enquiries still read back in the admin dashboard.
 *
 * license_* is DEFERRED by the user: deliberately not added, and nothing was
 * removed on its account either.
 *
 * PURE: no env, no db, no network, no `new Date()`. `courseImage` is fetched by
 * the CALLER (src/app/api/registration/inhouse/route.js) and passed in.
 *
 * @param {object} p
 * @param {string} p.referenceNumber
 * @param {object} p.data              parsed inhouseRegistrationSchema output
 * @param {string} p.quotationAddress  pre-flattened BILLING address string
 * @param {string} p.courseImage       cover of the FIRST course only — see above
 * @param {string} p.courseName        resolved display title of that same
 *   course, or '' when the lookup failed — in which case the code is used.
 */
export function buildInhouseRegistrationModel({
  referenceNumber,
  data,
  quotationAddress = '',
  courseImage = '',
  courseName = '',
}) {
  const d = data ?? {};
  const courses = Array.isArray(d.coursesInterested) ? d.coursesInterested.filter(Boolean) : [];

  return {
    ref_no: referenceNumber ?? '',

    // In-house has no "coordinator" — it has a contact — but the key names stay
    // in the shipped vocabulary so one Postmark account speaks one language.
    coordinator_name: `${d.contactFirstName ?? ''} ${d.contactLastName ?? ''}`.trim(),
    coordinator_first_name: d.contactFirstName ?? '',
    coordinator_email: d.contactEmail ?? '',
    coordinator_phone: d.contactPhone ?? '',
    contact_position: d.contactRole ?? '',
    contact_department: d.contactDepartment ?? '',

    // One source, two keys — see the docstring. `companyName` is not on the
    // schema any more, so reading it here would emit '' on every submission.
    company_name: d.quotationCompany ?? '',
    total_participants: d.participantsCount ?? 0,

    /**
     * THE COVER OF THE FIRST COURSE ONLY, not "the" course's cover — an enquiry
     * may name several and there is no single image for a list. Empty when
     * upstream had no cover or the fetch failed; the template gates the <img>
     * on `{{#course_image}}` so an empty value renders nothing at all rather
     * than a broken-image icon.
     */
    course_image: courseImage || '',
    // Resolved title, else the raw code, else nothing to name at all. The
    // middle term is the one that matters: it is what the customer reads when
    // upstream is down.
    course_name: courseName || courses[0] || '',

    training_format_label: trainingFormatLabel(d.trainingFormat),
    schedule_label: scheduleLabel(d),
    training_venue: trainingVenue(d),

    billing_company_name: d.quotationCompany ?? '',
    billing_tax_id: textBlock(d.taxId),
    // Derived, never stored. `branch` is a legacy read-only path; the current
    // form writes branchType + branchCode. See branchLabel.js.
    billing_branch: textBlock(
      formatBranchLabel({ branchType: d.branchType, branchCode: d.branchCode, legacyBranch: d.branch })
    ),
    billing_address: textBlock(quotationAddress),
    billing_notes: textBlock(d.message),
  };
}

/**
 * Onsite or Online — THOSE ARE NOW THE ONLY TWO.
 *
 * The 'flexible' card is gone from the form and the schema requires an explicit
 * choice, so the fallback below CANNOT FIRE for a new submission. It is kept
 * anyway, deliberately: this function is also reachable from a re-send of a
 * historical enquiry, where `trainingFormat` really is 'flexible'. Deleting the
 * default would make that case render the literal string 'undefined' in the
 * customer's mail. It is a fail-safe for old data, not a live branch.
 */
function trainingFormatLabel(trainingFormat) {
  if (trainingFormat === 'onsite') return 'Onsite';
  if (trainingFormat === 'online') return 'Online';
  return 'ยังไม่ระบุ — ทีมขายจะช่วยแนะนำ';
}

/**
 * One sentence describing when they want it.
 *
 * A MONTH, AND NOTHING ELSE. The three-way scheduleMode selector (month /
 * dateRange / notSure) is gone and `preferredMonth` is unconditionally
 * required, so there is no mode to branch on any more. The `|| 'ตามที่ทีมขาย
 * แนะนำ'` survives for the same reason as the format fallback above: a
 * historical enquiry saved under 'dateRange' or 'notSure' has no month at all,
 * and 'เดือนที่สนใจ: ' with nothing after the colon reads as a bug.
 */
function scheduleLabel(d) {
  return `เดือนที่สนใจ: ${d.preferredMonth || 'ตามที่ทีมขายแนะนำ'}`;
}

/**
 * Where the training happens — ONSITE ONLY.
 *
 * `false` for 'online', because there is no venue to state. Gating on the
 * FORMAT rather than on "is the venue non-empty" matters, since the schema lets
 * an online enquiry carry a stale `onsiteVenue` from a customer who changed
 * their mind mid-form — and printing that back as the venue is the same class
 * of error as showing the billing address here.
 *
 * Flattened with a plain join, matching the billing address the route hands in
 * as `quotationAddress`. It is deliberately NOT run through
 * formatBillingAddress: that formatter is scoped to the public-registration
 * flow (three tests pin the in-house sites out of it), and a venue is not a
 * billing address.
 */
function trainingVenue(d) {
  if (d.trainingFormat !== 'onsite') return false;
  const v = d.onsiteVenue ?? {};
  return textBlock(
    [v.addressLine, v.subDistrict, v.district, v.province, v.postalCode].filter(Boolean).join(' ')
  );
}
