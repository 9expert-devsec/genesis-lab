/**
 * ONE LEGACY DRUPAL WEBFORM ROW → ONE GENESIS REGISTRATION DOCUMENT.
 *
 * PURE. No fs, no mongoose, no network, no clock of its own — `now` is passed
 * in. That is what lets the fixtures in test/pure/legacyImportMapping exercise
 * the awkward shapes (a class title with no parentheses, a phone number in the
 * participants box) without a database and without the 2,427-row export, which
 * is PII and is gitignored.
 *
 * ══ THE RULINGS THIS FILE IMPLEMENTS ════════════════════════════════════════
 *
 *  1. `created` IS THE ONLY SOURCE OF createdAt. It is a unix integer in
 *     SECONDS. Several rows carry date-shaped STRINGS in other fields —
 *     `wanthiilngthaebiiyn` on public (162 distinct date strings) and
 *     `register_date` on in-house (149) — and neither is ever parsed. They ride
 *     into `legacy.raw` untouched. A date recovered from a free-text field is a
 *     guess wearing a timestamp's clothes.
 *
 *  2. ABSENT AND '' ARE THE SAME THING. Fields the customer left blank are
 *     simply missing from `data`, so every read goes through `t()` and every
 *     test is "is it non-empty", never "is the key present".
 *
 *  3. NOTHING IS INVENTED TO SATISFY A SCHEMA. `participantsCount` is OMITTED
 *     rather than clamped when the source holds a phone number; `preferredMonth`
 *     is left unset because the legacy month is a bare 1–12 with no year;
 *     `classDate` is the literal text from the title and no year is derived.
 *     Where the source cannot answer, the field is absent and the raw value is
 *     kept so a human can.
 *
 *  4. AN UNRECOGNISED VALUE IS REPORTED, NOT MAPPED. `admin_status` outside the
 *     three known values makes the row a SKIP, not a guess.
 */

/** Trim to a string. `undefined`, `null` and '' all become ''. */
export const t = (v) => String(v ?? '').trim();

/** Non-empty after trimming. */
export const has = (v) => t(v) !== '';

/**
 * ══ THE CLASS DATE, OUT OF THE LAST PAIR OF PARENTHESES ═════════════════════
 *
 * `'Microsoft Excel Advanced (May 18-19)'` → `'May 18-19'`.
 *
 * ── THE LAST PAIR, AND THIS IS THE WHOLE DIFFICULTY ───────────────────────
 * 202 of 1,841 titles contain MORE THAN ONE `(` because the COURSE NAME has
 * parentheses in it: `'Power Automate (Cloud) for Business Automation
 * (May 11-12)'`, `'Data Analysis Expression (DAX) for Power BI (May 25-26)'`.
 * A first-match or a greedy `\((.*)\)` returns `'Cloud'` or
 * `'Cloud) for Business Automation (May 11-12'` — both of which look like dates
 * to nobody and would have been written to 202 documents.
 *
 * `\(([^()]*)\)[^()]*$` anchors to the end and forbids parentheses inside the
 * captured run, so it can only match the final balanced pair.
 *
 * ── THE FOUR MALFORMED SHAPES, ALL MEASURED IN THE EXPORT ─────────────────
 *   1,715  well formed         'Claude AI Agent for Business (Apr 29-30)'
 *      86  leading space       ' Canva AI for Business Accelerator (Apr 2-3)'
 *      39  no space before '(' 'Agentic AI Development…Python(May 28)'
 *       1  en dash U+2013      'Python Programming (Oct 27–29)'
 * plus single-day rounds, '(Jun 24)', which are ordinary for this regex.
 *
 * None of the four needs a special case: the leading space is removed by the
 * trim, the missing space is irrelevant to a regex anchored on `(`, and the en
 * dash is INSIDE the captured text and is deliberately left exactly as it is —
 * this is a LABEL, reproduced as the source wrote it, not a date to normalise.
 *
 * ── NO YEAR IS DERIVED ────────────────────────────────────────────────────
 * The titles carry none. `classDate` on this model is already a label string
 * ('12 - 13 ส.ค. 2569') and nothing parses it, so an invented year would be a
 * fact nobody checked, printed on a page an admin reads.
 *
 * @returns {string|null} null when there is no parenthesised run at all — the
 *          caller REPORTS those rows rather than dropping or guessing them.
 */
const LAST_PARENS = /\(([^()]*)\)[^()]*$/;

export function parseClassDate(classTitle) {
  const m = LAST_PARENS.exec(t(classTitle));
  if (!m) return null;
  const inner = m[1].trim();
  return inner === '' ? null : inner;
}

/**
 * ══ invoice_branch → branchType / branchCode ════════════════════════════════
 *
 *   สำนักงานใหญ่ / 'head office' (any case, any spacing) → head_office, no code
 *   digits only                                          → branch + the digits
 *   anything else                                        → UNMATCHED
 *
 * UNMATCHED leaves the schema defaults alone and hands the raw string back, so
 * the caller can keep it in `legacy.raw.invoiceBranch` and report the distinct
 * values. There are 32 of them on public and 29 on in-house, and they are not a
 * pattern anyone can code against: '-', 'ไม่มี' (none), 'ลำพูน' (a province),
 * 'Technology Center (Branch No. 00001)', 'dog', 'rtyrtytry'. Some encode a real
 * branch number a human could extract; guessing which is a human's decision, and
 * writing branchCode: '00001' from 'Branch No.00001' by regex would silently
 * invent tax data on documents that are used to issue invoices.
 */
const HEAD_OFFICE = /^(?:สำนักงานใหญ่|head\s*office)$/i;
const DIGITS_ONLY = /^\d+$/;

export function classifyBranch(rawBranch) {
  const s = t(rawBranch);
  if (s === '') return { kind: 'empty', raw: '' };
  if (HEAD_OFFICE.test(s)) return { kind: 'head_office', raw: s };
  if (DIGITS_ONLY.test(s)) return { kind: 'branch', code: s, raw: s };
  return { kind: 'unmatched', raw: s };
}

/** The branch fields to spread onto an invoice, given a classification. */
export function branchFields(cls) {
  if (cls.kind === 'head_office') return { branchType: 'head_office', branchCode: '' };
  if (cls.kind === 'branch') return { branchType: 'branch', branchCode: cls.code };
  // empty + unmatched: leave the schema defaults untouched.
  return {};
}

/**
 * ══ THE THREE-WAY STATUS MAP — ONE PER COLLECTION, NOT ONE SHARED ═══════════
 *
 * Public reads `admin_status`, in-house reads `status`, and the legacy
 * vocabulary is the same three words on both forms. THE TARGETS ARE NOT THE
 * SAME, and that is the whole of this block.
 *
 * ── `confirm` → `confirmed` ON PUBLIC, `quoted` ON IN-HOUSE ───────────────
 *
 * The two collections SPELL THE SAME STEP DIFFERENTLY:
 *
 *     RegisterPublic.status   enum  [pending, confirmed, paid, cancelled]
 *     RegisterInhouse.status  enum  [pending, quoted,          cancelled]
 *
 * `RegisterInhouse` HAS NO `confirmed`. Writing one would put the value outside
 * its own collection's vocabulary — invisible on read, because Mongoose reads
 * never validate, and then visible as rows no status chip reaches and no
 * summary card counts, because `storedValuesForFilter` maps the LIVE list.
 *
 * `quoted` is not a substitute chosen for fitting the enum. It is THE SAME
 * STATE. In lib/registrations/statuses.js the public `confirmed` and the
 * in-house `quoted` carry the IDENTICAL label — 'ส่งใบเสนอราคาแล้ว' — with the
 * same accent and the same badge, and that file's own note says so outright:
 * "`confirmed` and `paid` are public only; `quoted` is in-house only… they are
 * the same states." Public's `confirmed` was relabelled in round 1 precisely
 * because what the admin does at that step is SEND THE QUOTATION.
 *
 * So `quoted` PRESERVES the meaning of a legacy `confirm` on the in-house side;
 * `confirmed` would have changed it into a value the screen cannot express.
 * Public is untouched and still maps `confirm → confirmed`.
 *
 * ── ANYTHING ELSE IS A SKIP, NOT A DEFAULT ────────────────────────────────
 * A fourth legacy status returns null, the caller skips the row and reports it.
 * Defaulting to 'pending' would quietly manufacture work in the action queue.
 *
 * `source` is REQUIRED and unknown values throw, rather than defaulting to one
 * of the two: a caller that forgot which collection it was mapping is exactly
 * how a `confirmed` reaches register_inhouse, and a silent default would put
 * that mistake back one refactor later.
 */
const STATUS_BY_SOURCE = Object.freeze({
  public: Object.freeze({ wait: 'pending', confirm: 'confirmed', cancel: 'cancelled' }),
  inhouse: Object.freeze({ wait: 'pending', confirm: 'quoted', cancel: 'cancelled' }),
});

export function mapStatus(raw, source) {
  const table = STATUS_BY_SOURCE[source];
  if (!table) throw new Error(`mapStatus needs a source of 'public' or 'inhouse', got ${JSON.stringify(source)}`);
  return table[t(raw)] ?? null;
}

/**
 * In-house `participants` → a count, or nothing at all.
 *
 * ── OMITTED, NOT CLAMPED, AND NEVER ROUNDED UP TO 15 ──────────────────────
 * The schema declares `min: 15` with `default: 15`. Four rows in the export hold
 * something that is not a participant count: '026893233' and '0819946054' are
 * PHONE NUMBERS typed into the wrong box, '100000000000' and '1200' are beyond
 * any real class. Writing 15 for those would assert a number nobody stated;
 * writing 26,893,233 would be worse. So the field is left off, the SCHEMA
 * DEFAULT applies, and the raw string always goes to `legacy.raw.participants`
 * so the phone number is still there when someone reads the record.
 *
 * `1..500` rather than `15..500`: values below 15 are REAL enquiries — the model
 * header already records that historical rows sit under the floor and must still
 * read, edit and save — so they are carried across as they are.
 *
 * @returns {number|null} null means "do not write the field".
 */
export function parseParticipants(raw) {
  const s = t(raw);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
}

/** data.quantity → attendeesCount, falling back to the folded attendee list. */
export function parseQuantity(raw, attendeesLength) {
  const n = Number.parseInt(t(raw), 10);
  if (Number.isInteger(n) && n >= 1 && n <= 50) return n;
  return attendeesLength || 1;
}

/**
 * a1_* … a9_* folded in order, blanks dropped.
 *
 * ── a10_* IS ASSERTED ABSENT RATHER THAN SPECIAL-CASED ────────────────────
 * The source form had ten name slots. `a10_firstname` appears on ZERO of the
 * 1,841 rows — measured — so this loop stops at 9 and `assertNoA10` below is
 * what makes that a checked fact rather than an assumption. If a row ever
 * carries one, the import says so instead of silently dropping a person.
 *
 * An entry is kept when the first OR last name is non-empty; a slot with
 * neither is a blank the customer skipped. (In this export every kept entry has
 * both, so the `||` never actually rescues a half-filled row — it is the
 * tolerant direction, and the dry run's validateSync pass is what would report
 * it if that ever stopped being true.)
 */
export const ATTENDEE_SLOTS = 9;

export function foldAttendees(data) {
  const out = [];
  for (let i = 1; i <= ATTENDEE_SLOTS; i++) {
    const firstName = t(data[`a${i}_firstname`]);
    const lastName = t(data[`a${i}_lastname`]);
    if (!firstName && !lastName) continue;
    out.push({
      firstName,
      lastName,
      email: t(data[`a${i}_e_mail`]).toLowerCase(),
      phone: t(data[`a${i}_telephone`]),
    });
  }
  return out;
}

/** Any `a10_*` key on this row? Returns the offending keys, [] when clean. */
export function assertNoA10(data) {
  return Object.keys(data ?? {}).filter((k) => /^a10_/.test(k));
}

/**
 * Is attendee slot 1 the coordinator themselves?
 *
 * All four fields must agree. Trimmed on both sides; the email compared
 * case-insensitively because an address is case-insensitive in its domain and
 * customers type both. Anything less than all four is a different person who
 * happens to share a surname.
 */
export function coordinatorIsAttendee(data) {
  const same = (a, b) => t(a) === t(b);
  return (
    same(data.a1_firstname, data.firstname) &&
    same(data.a1_lastname, data.lastname) &&
    t(data.a1_e_mail).toLowerCase() === t(data.e_mail).toLowerCase() &&
    same(data.a1_telephone, data.telephone) &&
    has(data.a1_firstname)
  );
}

/** The `data` keys each mapper consumes. Everything else falls into legacy.raw. */
export const CONSUMED_PUBLIC = new Set([
  't', 'type', 'class', 'course', 'e_mail', 'tax_id', 'lastname', 'not_name',
  'quantity', 'firstname', 'telephone', 'admin_status', 'invoice_address',
  'invoice_branch', 'invoice_company', 'invoice_firstname', 'invoice_lastname',
  'hubrid_type', 'remark',
  ...Array.from({ length: ATTENDEE_SLOTS }, (_, i) => [
    `a${i + 1}_firstname`, `a${i + 1}_lastname`, `a${i + 1}_e_mail`, `a${i + 1}_telephone`,
  ]).flat(),
]);

export const CONSUMED_INHOUSE = new Set([
  'month', 'course', 'e_mail', 'format', 'status', 'tax_id', 'company',
  'lastname', 'firstname', 'telephone', 'participants', 'invoice_address',
  'invoice_company', 'invoice_branch', 'address', 'position', 'department',
  'remark',
]);

/**
 * ══ DEAD FIELDS — PRESENT IN THE SOURCE, DELIBERATELY NOT MAPPED ════════════
 *
 * Named so the dry run can REPORT what each one actually holds rather than
 * leaving the reader to assume they were empty. Three of them are NOT empty and
 * that is the point of listing them:
 *
 *   · wanthiilngthaebiiyn  (public, 1841 rows)  — date strings. Ruling 1: this
 *     is the field a careless import would have taken createdAt from.
 *   · register_date        (in-house, 586 rows) — date strings, same ruling.
 *   · name_not             (public, 1833 rows)  — a Thai sentence meaning
 *     "does not wish to give attendee names yet". `not_name` (different field,
 *     confusingly) is the flag that is actually read.
 *   · a                    (in-house, 574 rows) — the constant '1'.
 *   · contact_attendee / attendee_contact (public) — the constant '0'.
 *
 * None is dropped: every one of them is unconsumed, so it lands in `legacy.raw`
 * verbatim. "Not mapped" here means "no genesis field claims to hold it", not
 * "thrown away".
 */
export const DEAD_FIELDS = Object.freeze([
  'name_not', 'wanthiilngthaebiiyn', 'register_date', 'attendee',
  'attendee_contact', 'contact_attendee', 'a',
  'webform_attachment_gated_download_fid',
]);

/** Everything in `data` that no mapper consumed, for legacy.raw. */
function unconsumed(data, consumed) {
  const out = {};
  for (const [k, v] of Object.entries(data ?? {})) if (!consumed.has(k)) out[k] = v;
  return out;
}

/**
 * ── PUBLIC ROW → register_public DOCUMENT ──────────────────────────────────
 *
 * @returns {{ doc: object|null, skip: string|null, notes: string[] }}
 *   `skip` non-null means the row is NOT imported and the string is the reason.
 *   `notes` are per-row observations for the report; they never block a row.
 */
export function mapPublicRow(row, { courseMap, now }) {
  const data = row.data ?? {};
  const notes = [];

  const status = mapStatus(data.admin_status, 'public');
  if (status === null) {
    return { doc: null, skip: `unrecognised admin_status ${JSON.stringify(t(data.admin_status))}`, notes };
  }

  const strayA10 = assertNoA10(data);
  if (strayA10.length) notes.push(`a10 slot present: ${strayA10.join(',')}`);

  const createdAt = new Date(row.created * 1000);
  const courseNid = t(data.course);
  const classNid = t(data.class);
  const matched = courseMap[courseNid] ?? null;
  if (!matched) notes.push(`course nid ${courseNid} not in the match map`);

  const classDate = parseClassDate(row.class_title);
  if (classDate === null) notes.push(`class_title has no parenthesised date: ${JSON.stringify(t(row.class_title))}`);

  const attendees = foldAttendees(data);
  const attendeesCount = parseQuantity(data.quantity, attendees.length);
  const q = Number.parseInt(t(data.quantity), 10);
  if (Number.isInteger(q) && q !== attendees.length) {
    notes.push(`quantity ${q} vs ${attendees.length} attendee name(s)`);
  }
  if (attendees.length === 0) notes.push('zero attendees');

  const branch = classifyBranch(data.invoice_branch);
  if (branch.kind === 'unmatched') notes.push(`unmatched invoice_branch: ${JSON.stringify(branch.raw)}`);

  const invoiceType = t(data.type) === 'company' ? 'corporate'
    : t(data.type) === 'personal' ? 'individual' : null;
  if (invoiceType === null) notes.push(`unrecognised invoice type ${JSON.stringify(t(data.type))}`);

  const doc = {
    // The upstream code, when the nid resolved. NOT the ObjectId: registrations
    // store `course_id` in both fields — see course-match-map.json's own note.
    courseId: matched ? matched.courseId : null,
    courseCode: matched ? matched.courseCode : null,
    // Falls back to the title the legacy row carried, so an unmatched course is
    // still NAMED on screen rather than showing a bare code or nothing.
    courseName: matched ? matched.courseName : t(row.course_title),

    // THE DRUPAL NODE ID, DELIBERATELY UNRESOLVED. There is no genesis schedule
    // to point at — these rounds are finished — and inventing a classId that
    // resolves to a live round would attach history to the wrong thing.
    classId: classNid,
    classDate,

    scheduleType: t(data.t) === 'hybrid' ? 'hybrid' : 'classroom',
    attendanceMode: t(data.hubrid_type) === 'msteams' ? 'teams' : 'classroom',

    coordinator: {
      firstName: t(data.firstname),
      lastName: t(data.lastname),
      email: t(data.e_mail).toLowerCase(),
      phone: t(data.telephone),
      isAttending: coordinatorIsAttendee(data),
    },

    // '1' is the legacy "I will send the names later" flag, so the list was NOT
    // provided. Read as a string: the source stores '0'/'1', never booleans.
    attendeesListProvided: t(data.not_name) !== '1',
    attendeesCount,
    attendees,

    requestInvoice: true,
    invoice: {
      type: invoiceType ?? 'corporate',
      country: 'TH',
      companyName: t(data.invoice_company),
      firstName: t(data.invoice_firstname),
      lastName: t(data.invoice_lastname),
      taxId: t(data.tax_id),
      ...branchFields(branch),
      // THE LEGACY ADDRESS IS ONE BLOB AND CANNOT BE SPLIT — see
      // legacyInvoiceAddress below and the ruling on the model.
      thaiAddress: null,
      internationalAddress: null,
    },
    legacyInvoiceAddress: t(data.invoice_address),

    notes: t(data.remark),

    // THE LEGACY SYSTEM TOOK NO MONEY. Not an empty payment record — null, which
    // is what the schema means by "this registration has no payment", and what
    // every quote-flow document already holds.
    pricing: null,
    payment: null,
    consent: null,

    status,
    source: 'web',
    ipAddress: t(row.remote_addr) || null,

    createdAt,
    updatedAt: createdAt,

    legacy: {
      sid: row.sid,
      serial: row.serial,
      webformId: t(row.webform_id),
      importedAt: now,
      raw: {
        classTitle: row.class_title ?? null,
        courseNid,
        classNid,
        /**
         * ══ THE ORIGINAL LEGACY STATUS, VERBATIM, EVEN THOUGH THE MAP CONSUMED IT
         *
         * `admin_status` is in CONSUMED_PUBLIC, so it would not have reached
         * `raw` by itself. It is put back deliberately.
         *
         * ── THE .b64 EXPORT IS NOT AN ARCHIVE ────────────────────────────
         * THE LEGACY SERVER IS BEING SWITCHED OFF, and the export is a
         * gitignored working file holding customer PII — it will and should be
         * deleted. So if this reading of `confirm` is ever overturned, the
         * correction has to be derivable FROM THE DATABASE. Storing the source
         * word next to the mapped one makes "which legacy status produced this
         * document?" answerable by a query forever, rather than by finding a
         * file nobody kept.
         *
         * ── AND THE REMEDY WOULD BE A NEW FIELD, NEVER A RE-EXPANDED ENUM ─
         * The status header on models/RegisterInhouse.js rules that directly:
         * round 2 destroyed `contacted` and `closed-won` rather than renaming
         * them, and "if the sales team wants either back the correct shape is a
         * separate field, not a re-expanded enum". A correction here would be
         * the same shape — read `legacy.raw.status`, write a new field — and
         * never widening `status` to admit a fourth value.
         */
        status: data.admin_status ?? null,
        ...(branch.kind === 'unmatched' ? { invoiceBranch: branch.raw } : {}),
        ...unconsumed(data, CONSUMED_PUBLIC),
      },
    },
  };

  return { doc, skip: null, notes };
}

/**
 * ── IN-HOUSE ROW → register_inhouse DOCUMENT ───────────────────────────────
 */
export function mapInhouseRow(row, { courseMap, now }) {
  const data = row.data ?? {};
  const notes = [];

  const status = mapStatus(data.status, 'inhouse');
  if (status === null) {
    return { doc: null, skip: `unrecognised status ${JSON.stringify(t(data.status))}`, notes };
  }

  const createdAt = new Date(row.created * 1000);
  const courseNid = t(data.course);
  const matched = courseMap[courseNid] ?? null;
  if (!matched) notes.push(`course nid ${courseNid} not in the match map — coursesInterested is []`);

  const company = t(data.company);
  if (!company) notes.push('company is empty — the schema requires it');

  const branch = classifyBranch(data.invoice_branch);
  if (branch.kind === 'unmatched') notes.push(`unmatched invoice_branch: ${JSON.stringify(branch.raw)}`);

  const participants = parseParticipants(data.participants);
  if (participants === null && has(data.participants)) {
    notes.push(`participants ${JSON.stringify(t(data.participants))} is not 1..500 — field omitted, default applies`);
  }

  const postcode = t(row.invoice_province_postcode);

  const doc = {
    // [] when the nid has no genesis course. nid 8 and nid 2256 are the two
    // Drupal nodes that no longer exist — one row each, expected, reported.
    coursesInterested: matched ? [matched.courseId] : [],

    contactFirstName: t(data.firstname),
    contactLastName: t(data.lastname),
    contactRole: t(data.position),
    contactDepartment: t(data.department),
    companyName: company,
    contactEmail: t(data.e_mail).toLowerCase(),
    contactPhone: t(data.telephone),

    // 'msteam' — singular, and that is how the source spells it. Do not "fix"
    // it to 'msteams' (which is the PUBLIC form's spelling for a different
    // field); they are two vocabularies from two forms.
    trainingFormat: t(data.format) === 'msteam' ? 'online'
      : t(data.format) === 'onsite' ? 'onsite' : undefined,

    // preferredMonth IS DELIBERATELY UNSET. `data.month` is a bare 1–12 with no
    // year; this field renders as a month LABEL and deriving a year would be a
    // guess shown to an admin as a fact. The raw value is kept in legacy.raw.

    quotationCountry: 'TH',
    quotationCompany: t(data.invoice_company),
    taxId: t(data.tax_id),
    ...branchFields(branch),

    /**
     * ── THE POSTCODE, AND THE FIELD IT IS NOT WRITTEN INTO ─────────────────
     * `invoice_province_postcode` is the RESOLVED NAME of the legacy taxonomy
     * term, and that name is a postcode ('10200'), not a province. `data.province`
     * / `data.invoice_province` hold the term IDs ('10242', '6946') — neither is
     * a province name, and writing either into `thaiAddress.province` would put
     * a number where an admin reads จังหวัด. Only 20 of 586 rows have one.
     */
    thaiAddress: postcode ? { postalCode: postcode } : null,
    internationalAddress: null,
    legacyInvoiceAddress: t(data.invoice_address),

    message: t(data.remark),

    status,
    source: 'web',
    ipAddress: t(row.remote_addr) || null,

    createdAt,
    updatedAt: createdAt,

    legacy: {
      sid: row.sid,
      serial: row.serial,
      webformId: t(row.webform_id),
      importedAt: now,
      raw: {
        courseNid,
        /**
         * ══ THE ORIGINAL LEGACY STATUS, VERBATIM — AND HERE IT IS THE RECEIPT
         *
         * `status` is in CONSUMED_INHOUSE and is put back deliberately. On this
         * collection it matters more than on public, because this is the arm
         * where the mapping is a JUDGEMENT: legacy `confirm` becomes `quoted`,
         * on the reading that public's `confirmed` and in-house's `quoted` are
         * one step under two spellings (identical label, same badge — see
         * lib/registrations/statuses.js).
         *
         * ── THE .b64 EXPORT IS NOT AN ARCHIVE ────────────────────────────
         * THE LEGACY SERVER IS BEING SWITCHED OFF, and the export is a
         * gitignored working file full of customer PII that will and should be
         * deleted. So if that reading is ever overturned, the correction must be
         * derivable FROM THE DATABASE — `{'legacy.raw.status': 'confirm'}` finds
         * every affected document forever, with no file to go looking for.
         *
         * ── AND THE REMEDY WOULD BE A NEW FIELD, NEVER A RE-EXPANDED ENUM ─
         * Per the status header on models/RegisterInhouse.js: round 2 destroyed
         * `contacted` and `closed-won` rather than renaming them, and "if the
         * sales team wants either back the correct shape is a separate field,
         * not a re-expanded enum". Re-admitting `confirmed` to this enum to
         * undo this decision would be the exact move that header forbids.
         */
        status: data.status ?? null,
        month: t(data.month),
        participants: t(data.participants),
        address: t(data.address),
        provincePostcode: row.province_postcode ?? null,
        invoiceProvincePostcode: row.invoice_province_postcode ?? null,
        ...(branch.kind === 'unmatched' ? { invoiceBranch: branch.raw } : {}),
        ...unconsumed(data, CONSUMED_INHOUSE),
      },
    },
  };

  if (participants !== null) doc.participantsCount = participants;
  if (doc.trainingFormat === undefined) {
    delete doc.trainingFormat;
    notes.push(`unrecognised format ${JSON.stringify(t(data.format))} — trainingFormat omitted`);
  }

  return { doc, skip: null, notes };
}
