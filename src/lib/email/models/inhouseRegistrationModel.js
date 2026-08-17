import { contentModeLabel, textBlock } from './labels';
import { formatBranchLabel } from '@/lib/registration/branchLabel';
import { monthLongLabel } from '@/lib/schedule/monthWindow';
import { formatThaiAddress } from '@/lib/address/formatThaiAddress';

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
 * ── FIVE KEYS THAT USED TO BE "NOT MAPPED" AND NOW ARE ──────────────────────
 * `contentMode`, `contentDetails`, `scheduleNote`, `onlineRegion` and
 * `onlineTimezone` were excluded on the reasoning that
 * registration-inhouse-admin.js was their only renderer, that template is
 * deleted, and this is the customer's mail. THE APPROVED POSTMARK TEMPLATE
 * REVERSES THAT: it has rows for all five, so they are emitted here as
 * content_mode_label, content_details, schedule_note, online_region and
 * online_timezone.
 *
 * The old reasoning was about who READS the mail. It undercounted: the BCC copy
 * of this same mail is the only notification anyone internal receives, so every
 * field left out was a detail the sales team had to open the dashboard to find.
 * Echoing them back also lets the customer check what was recorded, which is
 * the point of an acknowledgement.
 *
 * `preferredContact*` STAYS OFF, and for the original reason: the approved
 * template has no row for it.
 *
 * ── NOT MAPPED, AND WHY ─────────────────────────────────────────────────────
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

    // รูปแบบเนื้อหา — a plain string, never a block: the schema defaults
    // `contentMode`, so there is no absent case and no row to hide.
    content_mode_label: contentModeLabel(d.contentMode),
    content_details: contentDetails(d),

    training_format_label: trainingFormatLabel(d.trainingFormat),
    schedule_label: scheduleLabel(d),
    schedule_note: textBlock(d.scheduleNote),
    training_venue: trainingVenue(d),
    online_region: onlineField(d, d.onlineRegion),
    online_timezone: onlineField(d, d.onlineTimezone),

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
 * The extra content the customer asked for — CUSTOM MODE ONLY.
 *
 * Gated on `contentMode !== 'standard'`, which is the SAME PREDICATE the form
 * uses to show the field (InhouseForm.jsx:517, and again on the review step at
 * :803). Not on the string being non-empty: `contentDetails` is
 * `.optional()` on the schema with no cross-field rule clearing it, so a
 * customer who typed a paragraph, changed their mind and switched back to
 * 'ใช้ Outline มาตรฐาน' submits a STALE value the form has already stopped
 * showing them. Echoing that back tells them we recorded a customisation they
 * cancelled.
 *
 * Exactly the class of error `trainingVenue()` below already exists to prevent,
 * and gated the same way for the same reason: read the MODE, not the leftover.
 */
function contentDetails(d) {
  if (d.contentMode === 'standard') return false;
  return textBlock(d.contentDetails);
}

/**
 * An online-only detail — region, or time-zone constraint.
 *
 * `false` for anything but 'online', mirroring `trainingVenue()` below, which
 * is the same shape for the same reason: both input pairs sit inside a block
 * the form renders only for their format (`isOnline`, InhouseForm.jsx:587-596),
 * and the schema keeps them `.optional()` with no rule that clears them when
 * the customer switches. So an onsite enquiry can carry a stale region typed
 * before the switch, and printing it back invents a constraint nobody asked
 * for. Gate on the FORMAT, never on "is the value non-empty".
 *
 * Takes the value rather than a key so the two call sites read as one rule
 * applied twice, not two rules that happen to agree.
 */
function onlineField(d, value) {
  if (d.trainingFormat !== 'online') return false;
  return textBlock(value);
}

/**
 * Onsite or Online — THOSE ARE NOW THE ONLY TWO.
 *
 * ── THE FALLBACK IS UNREACHABLE TODAY ───────────────────────────────────────
 * `src/lib/schemas/register-inhouse.js:96` is
 * `trainingFormat: z.enum(['onsite', 'online'], …)` — two values, NO `.default()`
 * and no `.optional()`, so parsing rejects anything else before this function
 * is reached. The 'flexible' card is gone from the form.
 *
 * The prose here used to justify the fallback as a fail-safe for "a re-send of
 * a historical enquiry". THERE IS NO SUCH PATH. `buildInhouseRegistrationModel`
 * has exactly one production caller — `sendInhouseRegistrationEmails`
 * (src/lib/email/template-senders/inhouse-registration.js:58) — which itself
 * has exactly one caller: the POST route
 * (src/app/api/registration/inhouse/route.js:113), with freshly-parsed zod
 * data. Nothing loads a stored document and re-renders it.
 *
 * WHAT WOULD MAKE IT REACHABLE: an admin "re-send this confirmation" action
 * reading a RegisterInhouse document (the Mongoose path still accepts the old
 * values), or widening the enum. Either one, and this branch starts firing —
 * which is why it is KEPT rather than deleted. Deleting it would make that day
 * render the literal 'undefined' in a customer's mail.
 *
 * A docstring asserting a path that does not exist is its own defect: it tells
 * the next reader the branch is covered by a real scenario, so nobody tests it
 * and nobody notices when the scenario is imaginary.
 */
function trainingFormatLabel(trainingFormat) {
  if (trainingFormat === 'onsite') return 'Onsite';
  if (trainingFormat === 'online') return 'Online';
  return 'ยังไม่ระบุ — ทีมขายจะช่วยแนะนำ';
}

/**
 * When they want it — THE FORMATTED MONTH, BARE.
 *
 * ── NO PREFIX ───────────────────────────────────────────────────────────────
 * This used to return `เดือนที่สนใจ: <value>`. The approved template's row is
 * already headed "เดือนที่สนใจอบรม", so the mail asked the question twice and
 * answered it once. The heading belongs to the template; the value belongs
 * here.
 *
 * ── AND THE VALUE IS FORMATTED, BECAUSE IT IS A MACHINE KEY ─────────────────
 * `preferredMonth` is NOT prose. The form's month `<select>`
 * (InhouseForm.jsx:531) is built from `THAI_MONTHS` (:67-74), whose options
 * carry a Thai `label` but submit a `YYYY-MM` `value` — so what arrives here is
 * the string '2026-09'. The form converts it back for its own review step via
 * `labelOf(THAI_MONTHS, …)` at :809, and nothing else did, so the customer
 * approved 'กันยายน 2569' on screen and was then sent '2026-09'.
 *
 * `monthLongLabel` is the shared decoder for that vocabulary and lives beside
 * the other `YYYY-MM` formatters in src/lib/schedule/monthWindow.js, where the
 * repo-wide `+ 543` ban is actually enforced. It returns the raw key unchanged
 * if it cannot parse one, so a value from some future producer degrades to
 * today's output rather than to a blank.
 *
 * ── THE `||` FALLBACK IS UNREACHABLE TODAY ──────────────────────────────────
 * `src/lib/schemas/register-inhouse.js:86` is
 * `preferredMonth: z.string().trim().min(1, …)` — required, non-empty, no
 * default. The three-way scheduleMode selector (month / dateRange / notSure)
 * is gone, so there is no mode that omits a month. Parsing rejects a
 * submission without one before this function runs.
 *
 * As with `trainingFormatLabel` above, the old prose called this a fail-safe
 * for a re-send of a historical enquiry. NO RE-SEND PATH EXISTS — one caller,
 * the POST route, always with freshly-parsed data. See that docstring for the
 * caller chain.
 *
 * WHAT WOULD MAKE IT REACHABLE: an admin re-send reading a stored
 * RegisterInhouse document, where a pre-change enquiry really does hold
 * `preferredDateFrom`/`preferredDateTo` and no month at all — the admin detail
 * view still reads exactly that shape. KEPT for that day, because a bare ''
 * where the month goes reads as a broken template rather than as an absent
 * answer.
 */
function scheduleLabel(d) {
  return d.preferredMonth ? monthLongLabel(d.preferredMonth) : 'ตามที่ทีมขายแนะนำ';
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
 * ── FORMATTED, AND THROUGH THE ADDRESS PRIMITIVE — NOT THROUGH "BILLING" ────
 * This used to be a plain join, on the reasoning that the shared formatter was
 * scoped to the public-registration flow and a venue is not a billing address.
 * The first half is no longer true: the prefix rule has been extracted to
 * `formatThaiAddress`, so a caller can have ตำบล/อำเภอ/จังหวัด — or แขวง/เขต
 * for Bangkok — without describing its data as an invoice. The plain join
 * emitted a venue with no prefixes at all, which is exactly as unreadable here
 * as it was in the quotation address.
 *
 * The second half still holds and is why this calls `formatThaiAddress`
 * DIRECTLY and never `formatBillingAddress`. Round 3 shipped a bug where the
 * billing address rendered under a สถานที่จัดอบรม heading; the fix was to keep
 * the two concepts apart by name, and routing a venue through a function called
 * "billing" would put that naming straight back — the string would be right and
 * the next reader would be wrong. The shared thing is the prefix rule, not the
 * invoice.
 */
function trainingVenue(d) {
  if (d.trainingFormat !== 'onsite') return false;
  return textBlock(formatThaiAddress(d.onsiteVenue));
}
