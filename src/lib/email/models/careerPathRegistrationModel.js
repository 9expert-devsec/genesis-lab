import { textBlock } from './labels';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatInvoiceBranchLabel } from '@/lib/registration/branchLabel';
import { orNotSpecified } from '@/lib/orNotSpecified';

/**
 * TemplateModel for POSTMARK_TEMPLATE_ALIAS_REG_CAREERPATH — the confirmation a
 * customer receives after applying to a Career Path.
 *
 * ══ ITS OWN ALIAS, AND NO PRICE ANYWHERE ═══════════════════════════════════
 *
 * It reuses neither the public nor the bundle template. The bundle mail is ABOUT
 * a package price and carries `package_price`; a Career Path application is a
 * request for a quotation the sales team prepares by hand, and there is no
 * number on this document that could be quoted without inventing it. So there is
 * no price key of any kind here, no `package_price`, and no builder argument
 * that could grow into one — the same move `bundleRegistrationModel` makes in
 * the other direction for `discount`.
 *
 * There is no `ref_no` either. The other three flows mint one with `refNo(_id)`;
 * this flow's success screen shows the raw `_id` and its admin screen shows
 * none, so a reference number in the mail would be a fourth spelling of an
 * identifier the customer has already been given differently.
 *
 * ══ PURE ═══════════════════════════════════════════════════════════════════
 *
 * No env, no db, no network, no clock. Every value derives from the arguments.
 *
 * `coverImage` is read by the CALLER and passed in — this builder never touches
 * `CareerPath`, exactly as the bundle and course models state for their own
 * images. It is the one value this mail needs that the registration document
 * does not carry.
 *
 * THE ONE `new Date(…)` IN THIS FILE IS NOT A CLOCK READ. `isoDaysToDates`
 * constructs a calendar value out of digits taken from an argument. It never
 * calls `new Date()` with no arguments and never reads `Date.now()`, so there is
 * no run in which this builder returns two different answers for one document.
 *
 * @param {object} p
 * @param {object} p.registration the CareerPathRegistration document
 * @param {string} [p.coverImage]  CareerPath.registerBannerUrl, resolved by the
 *   caller. '' or absent is a supported state — the key is then OMITTED.
 * @returns {object} the Postmark TemplateModel
 */
export function buildCareerPathRegistrationModel({ registration, coverImage = '' }) {
  const reg = registration ?? {};

  const coordinatorName = `${reg.contactFirstName ?? ''} ${reg.contactLastName ?? ''}`.trim();

  const rows = Array.isArray(reg.selectedCourses) ? reg.selectedCourses : [];
  const attendees = assembleAttendees(reg);

  /**
   * THE LEGACY `companyBranch` IS DELIBERATELY NOT PASSED.
   *
   * `formatInvoiceBranchLabel` accepts a `branch` key for pre-split documents,
   * and on this collection it is dead in both directions: the column is the
   * empty string on every career-path registration ever written, and the TH path
   * never consults it anyway because `branchType` carries a schema default, so
   * `formatBranchLabel` answers from the structured pair every time.
   *
   * Passing it would also make this file a false offender in the repo-wide
   * "nothing writes `branch`" sweep (test/fs/branchLegacyReadOnly), which cannot
   * tell `branch: <expr>` in a READ argument from the same three characters in a
   * write — and that sweep is worth more than a defensive read of a column that
   * is provably empty.
   */
  const branchLabel = formatInvoiceBranchLabel({
    country:    reg.invoiceCountry,
    branchType: reg.branchType,
    branchCode: reg.branchCode,
    branchFree: reg.branchFree,
  });

  const isCompany = reg.taxType === 'company';
  const sharedBilling = {
    ...maybe('billing_tax_id', textBlock(isCompany ? reg.companyTaxId : reg.personalTaxId)),
    ...maybe('billing_branch', textBlock(branchLabel)),
    ...maybe('billing_address', textBlock(formatBillingAddress(billingAddressAdapter(reg)))),
  };

  return {
    career_path_name: reg.careerName ?? '',

    /**
     * OMITTED when there is no cover, not `''` and not `false`.
     *
     * The template reads it as `{{.}}` inside its own block, so the key's
     * ABSENCE is what hides the <img>. An empty string would render
     * `src=""` — a broken-image icon at the top of the mail — and `false`
     * would render the word `false` if the block were ever written as a
     * plain substitution.
     */
    ...maybe('course_image', coverImage || undefined),

    /**
     * ONE ROW PER COURSE+ROUND. `{ items }` — no `count`, unlike the bundle
     * model's `{ count, items }`: this template's heading does not state a
     * number, and emitting a key nothing reads is how a model and a template
     * drift.
     */
    courses: {
      items: rows.map((c) => ({
        course_name: c?.courseName ?? '',
        course_date: courseDateLabel(c),
        training_type_label: careerPathTrainingTypeLabel(c?.type),
      })),
    },

    coordinator_name: coordinatorName,
    coordinator_email: reg.contactEmail ?? '',
    coordinator_phone: reg.contactPhone ?? '',

    /**
     * `attendeeCount`, NEVER `attendees.length`.
     *
     * The stored array excludes the coordinator (see `assembleAttendees`) and is
     * empty outright when the customer deferred the names, so its length answers
     * a different question from "how many people are coming". `attendeeCount` is
     * the headcount authority on this document — the form's review step, the
     * admin detail row and this mail all read it, and they agree because they
     * read the same field.
     */
    total_participants: reg.attendeeCount ?? 1,

    ...maybe('attendee_list', attendees.length ? { items: attendees } : undefined),

    /**
     * `{ show: true }` or `false` — NEVER the boolean `true`. Mustachio iterates
     * a section, and a bare `true` gives it no context to enter with, so the
     * block does not render and the "we will collect the names later" note is
     * silently missing on exactly the registrations that need it.
     */
    attendee_later: reg.skipAttendee ? { show: true } : false,

    /**
     * MUTUALLY EXCLUSIVE, from `taxType` alone, and `false` rather than null —
     * Mustachio renders a null section as an empty one, so a bug that blanks a
     * live block looks identical to a correctly hidden one.
     *
     * There is no `document_requested` flag here and there does not need to be:
     * this form has no "do you want an invoice" checkbox. `taxType` is a schema
     * enum with a default, so exactly one of these two is always an object and
     * the heading can never stand over nothing.
     */
    billing_personal: isCompany
      ? false
      : {
          billing_name: `${reg.taxFirstName ?? ''} ${reg.taxLastName ?? ''}`.trim(),
          ...sharedBilling,
        },
    billing_company: isCompany
      ? {
          billing_company_name: reg.companyName ?? '',
          ...sharedBilling,
        }
      : false,

    ...maybe('billing_notes', textBlock(reg.note)),
  };
}

/**
 * `{ [key]: value }` when `value` is defined, `{}` when it is not — so a spread
 * of it either adds the key or leaves no trace.
 *
 * This is how "OMIT the key" is spelled. It is not the same as `false` and not
 * the same as `''`: the four `{ text }` blocks and `course_image` must be ABSENT
 * when they have nothing to say, because an empty string is a value Mustachio
 * will happily render into the middle of a sentence.
 */
function maybe(key, value) {
  return value === undefined || value === false ? {} : { [key]: value };
}

/**
 * The attendee table, with the coordinator RECONSTRUCTED at index 1.
 *
 * ── WHY RECONSTRUCTED AND NOT READ ─────────────────────────────────────────
 * `attendees` on the document excludes the coordinator, on every document, old
 * and new — that is the decided shape and the form does not prepend at submit.
 * So the roster the customer sees on screen is `isCoordinator` + `contact*`
 * followed by the stored rows, and this builds the same thing the same way, so
 * the mail and the two screens cannot disagree about who is attending.
 *
 * The result's length therefore equals `attendeeCount`, which is what makes the
 * table and `total_participants` agree.
 *
 * Blank email/phone become the shared NOT_SPECIFIED marker rather than an empty
 * cell — attendee contact details are optional at intake, and a blank cell reads
 * as a rendering fault rather than as a fact about the record.
 */
function assembleAttendees(reg) {
  if (reg?.skipAttendee) return [];

  const stored = Array.isArray(reg?.attendees) ? reg.attendees : [];
  const people = reg?.isCoordinator
    ? [
        {
          firstName: reg.contactFirstName,
          lastName: reg.contactLastName,
          email: reg.contactEmail,
          phone: reg.contactPhone,
        },
        ...stored,
      ]
    : stored;

  return people.map((a, i) => ({
    index: i + 1,
    name: `${a?.firstName ?? ''} ${a?.lastName ?? ''}`.trim(),
    email: orNotSpecified(a?.email),
    phone: orNotSpecified(a?.phone),
  }));
}

/**
 * ประเภทการอบรม — a CAREER-PATH-SPECIFIC map, and it has to be.
 *
 * ── WHY NOT `scheduleTypeLabel` ────────────────────────────────────────────
 * That function tests `=== 'online'` and `=== 'hybrid'` and treats everything
 * else as Classroom. This flow does not store `'hybrid'`: the form refuses to
 * submit an unresolved hybrid pick and rewrites the value to the literal
 * "Hybrid (Classroom)" or "Hybrid (MS Teams)" the moment the customer chooses.
 * Neither string matches either test, so `scheduleTypeLabel` would return
 * Classroom for BOTH — telling a customer who explicitly chose MS Teams to come
 * to the training room. Silently, on a mail nobody re-reads.
 *
 * ── THE LABEL IS THE MODE, NOT THE WORD "HYBRID" ───────────────────────────
 * The customer has already made the choice; repeating the offer back to them
 * ("Hybrid — เลือกได้ 1 รูปแบบ") answers a question they have finished
 * answering. What they need is where to be.
 *
 * ── AN UNRECOGNISED VALUE IS REPORTED, NOT GUESSED AT ──────────────────────
 * The raw value is returned, which is the rule src/lib/schedule/trainingTypeLabel
 * already states and argues for the same reason: relabelling an unknown mode as
 * Classroom tells a customer something false about how their training will run,
 * whereas showing the stored value is visibly wrong and therefore reportable. It
 * does not cost the customer the whole mail either, which throwing would.
 *
 * Case-insensitive because the stored vocabulary is genuinely mixed — the form
 * lower-cases the schedule type but writes the two hybrid strings in title case.
 */
export const CAREERPATH_MODE_LABEL = {
  'classroom': 'Classroom',
  'online': 'Online ผ่าน Microsoft Teams',
  'hybrid (classroom)': 'Classroom',
  'hybrid (ms teams)': 'Online ผ่าน Microsoft Teams',
};

export function careerPathTrainingTypeLabel(type) {
  const raw = String(type ?? '');
  return CAREERPATH_MODE_LABEL[raw.trim().toLowerCase()] ?? raw;
}

/**
 * The round's days, from the day list when it exists and from the stored label
 * when it does not.
 *
 * ── THE DAY LIST IS THE TRUTH, `round` IS A FALLBACK ───────────────────────
 * `round` was formatted in the visitor's browser as first-day-to-last-day, so a
 * round on 8, 10 and 12 reads "8–12" there and advertises two days that do not
 * exist. `formatRoundDays` prints maximal consecutive runs and lists the rest,
 * so the same round becomes `8, 10, 12 ต.ค. 69`.
 *
 * Documents written before the day list was persisted have `dates: []` and
 * nothing better than `round` to offer. They keep the old label — the days are
 * not recoverable from it — rather than being silently re-rendered as something
 * equally wrong.
 */
function courseDateLabel(course) {
  const days = isoDaysToDates(course?.dates);
  if (days.length > 0) {
    // `showYear: true` rather than `'auto'`: `'auto'` needs the current year and
    // this builder does not read the clock. A mail is also read later and kept,
    // so the year is worth stating outright.
    return formatRoundDays(days, { showMonth: true, showYear: true });
  }
  return course?.round || 'ตามรอบที่กำหนด';
}

/**
 * ISO day strings → local-midnight `Date`s, BY SPLITTING THE STRING.
 *
 * ── WHY NOT `new Date('2026-10-08')` ───────────────────────────────────────
 * That parses as UTC midnight, and every calendar getter that follows is LOCAL.
 * On a runtime behind UTC it is 19:00 on the 7th, and the whole label moves back
 * a day. This repo has shipped a seven-hour date error before, and a mail is the
 * one surface where nobody notices for a week.
 *
 * `new Date(y, m - 1, d)` is local midnight on the day named, in every zone, and
 * `formatRoundDays` re-reads exactly those three fields — so the value
 * round-trips unchanged whatever TZ the process is in. Passing `Date` objects
 * rather than strings is also what keeps the string out of that module's own
 * `new Date(d)` branch.
 *
 * Anything that is not a leading `YYYY-MM-DD` is dropped rather than coerced: a
 * null in a Mongo array is ordinary, and `new Date(null)` is the epoch, not an
 * invalid date — it would render as a training day in 1970.
 */
function isoDaysToDates(dates) {
  const out = [];
  for (const raw of Array.isArray(dates) ? dates : []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? ''));
    if (!m) continue;
    out.push(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  return out;
}

/**
 * The five flat columns, shaped into the `invoice` object `formatBillingAddress`
 * accepts.
 *
 * ── AN ADAPTER, NOT A SECOND FORMATTER ─────────────────────────────────────
 * `formatBillingAddress` owns the branch selection, the Thai แขวง/เขต vs
 * ตำบล/อำเภอ prefix rule and the international `', '` join, and its byte-shape
 * is pinned by controls. Writing a second address formatter here would be the
 * fifth spelling of a Thai address in this repo; editing that one is not
 * permitted and is not necessary.
 *
 * The career-path form squashes BOTH address shapes into one set of columns
 * (line1+line2 → taxAddress, state → province, city → subdistrict), so this maps
 * back out along `invoiceCountry`. `line2` is `''` because the squash is lossy
 * in that direction and inventing a split would be worse than an empty part the
 * `filter(Boolean)` drops.
 *
 * `countryName` becomes `internationalAddress.country`, which
 * `formatBillingAddress` places LAST in its comma-joined line — after the postal
 * code. That is the only place the country appears, and it is why the column is
 * stored at all.
 */
function billingAddressAdapter(reg) {
  if (reg?.invoiceCountry === 'OTHER') {
    return {
      country: 'OTHER',
      internationalAddress: {
        line1: reg.taxAddress ?? '',
        line2: '',
        city: reg.subdistrict ?? '',
        state: reg.province ?? '',
        postalCode: reg.zipcode ?? '',
        country: reg.countryName ?? '',
      },
    };
  }

  return {
    country: 'TH',
    thaiAddress: {
      addressLine: reg?.taxAddress ?? '',
      subDistrict: reg?.subdistrict ?? '',
      district: reg?.district ?? '',
      province: reg?.province ?? '',
      postalCode: reg?.zipcode ?? '',
    },
  };
}
