import { z } from 'zod';
import { containsThai, ENGLISH_ONLY_MESSAGE } from '@/lib/registration/englishOnly';

/**
 * Validation schema for /registration/public form submissions.
 * Shared between the client wizard (react-hook-form resolver) and the
 * API route that writes to Mongo. Single source of truth.
 */

const thaiPhoneRegex = /^(0\d{9}|\+\d{10,15})$/;

// ── Address schemas ────────────────────────────────────────────────

export const thaiAddressSchema = z.object({
  addressLine: z.string().trim().min(1, 'กรุณากรอกที่อยู่').max(200),
  subDistrict: z.string().trim().min(1, 'กรุณาเลือกแขวง/ตำบล').max(100),
  district:    z.string().trim().min(1, 'กรุณาเลือกเขต/อำเภอ').max(100),
  province:    z.string().trim().min(1, 'กรุณาเลือกจังหวัด').max(100),
  postalCode:  z.string().trim().regex(/^\d{5}$/, 'รหัสไปรษณีย์ 5 หลัก'),
});

/**
 * 'Other country' is an ENGLISH-ONLY branch. The predicate is shared with
 * register-inhouse.js — see src/lib/registration/englishOnly.js for why it is
 * an exclusion of the Thai block and NOT an A-Z allowlist (an allowlist rejects
 * `Côte d'Ivoire`, `A/S` and `#12-04`).
 */
const noThai = (schema) => schema.refine((v) => !containsThai(v), { message: ENGLISH_ONLY_MESSAGE });
const englishRequired = (msg, max) => noThai(z.string().trim().min(1, msg).max(max));
const englishOptional = (max) => noThai(z.string().trim().max(max)).optional();

export const internationalAddressSchema = z.object({
  line1:      englishRequired('กรุณากรอกที่อยู่', 200),
  line2:      englishOptional(200),
  city:       englishRequired('กรุณากรอกเมือง', 100),
  state:      englishOptional(100),
  postalCode: englishOptional(20),
  country:    englishRequired('กรุณากรอกประเทศ', 100),
});

// ── Party schemas ──────────────────────────────────────────────────

export const coordinatorSchema = z.object({
  firstName:   z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName:    z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  email:       z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:       z.string().trim().regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
  isAttending: z.boolean().default(false),
});

export const attendeeSchema = z.object({
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName:  z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  email:     z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:     z.string().trim().regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
});

// ── Invoice schema ─────────────────────────────────────────────────

export const invoiceSchema = z
  .object({
    type:        z.enum(['individual', 'corporate']),
    country:     z.enum(['TH', 'OTHER']).default('TH'),
    firstName:   z.string().trim().max(100).optional().or(z.literal('')),
    lastName:    z.string().trim().max(100).optional().or(z.literal('')),
    companyName: z.string().trim().max(200).optional().or(z.literal('')),
    /**
     * STRUCTURED, and there is deliberately NO `branch` key here any more.
     *
     * `branch` survives as a legacy read-only path on RegisterPublic's
     * InvoiceSchema so old documents still say what they said, but nothing
     * writes it: zod is in strip mode, so a client that still sends
     * `invoice.branch` has it dropped here, and the admin action's allowlist
     * does not name it either. Writing a derived string alongside the pair is
     * how one value under two names ends up disagreeing with itself — this repo
     * already paid for that lesson as quotation_address / billing_address. The
     * label is computed at read time by src/lib/registration/branchLabel.js.
     *
     * `branchFree` is the 'Other country' counterpart: a Thai Revenue-Department
     * branch number is meaningless abroad, so that branch keeps free text.
     */
    branchType:  z.enum(['head_office', 'branch']).default('head_office'),
    // max(20), NOT max(5): the 5-digit rule is conditional and lives in
    // superRefine, and a field-level max would pre-empt it on a 6-digit value
    // with zod's own English message. This bound just stops an unbounded string.
    branchCode:  z.string().trim().max(20).optional().or(z.literal('')),
    branchFree:  z.string().trim().max(100).optional().or(z.literal('')),
    taxId:       z.string().trim().max(30).optional().or(z.literal('')),
    // Only one of these will be populated depending on invoice.country
    thaiAddress:          thaiAddressSchema.optional().nullable(),
    internationalAddress: internationalAddressSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Identity fields
    if (data.type === 'individual') {
      if (!data.firstName) ctx.addIssue({ path: ['firstName'], code: 'custom', message: 'กรุณากรอกชื่อ' });
      if (!data.lastName)  ctx.addIssue({ path: ['lastName'],  code: 'custom', message: 'กรุณากรอกนามสกุล' });
    } else {
      if (!data.companyName) ctx.addIssue({ path: ['companyName'], code: 'custom', message: 'กรุณากรอกชื่อบริษัท' });
    }

    // Tax ID: required + 13-digit for TH; optional for OTHER
    if (data.country === 'TH') {
      if (!data.taxId || !/^\d{13}$/.test(data.taxId)) {
        ctx.addIssue({ path: ['taxId'], code: 'custom', message: 'เลขประจำตัวผู้เสียภาษี 13 หลัก' });
      }
      // Sub-branch → a 5-digit Revenue-Department branch number. Corporate
      // only, matching where the control renders.
      if (data.type === 'corporate' && data.branchType === 'branch' && !/^\d{5}$/.test(data.branchCode ?? '')) {
        ctx.addIssue({ path: ['branchCode'], code: 'custom', message: 'เลขที่สาขา 5 หลัก' });
      }
    } else if (containsThai(data.branchFree)) {
      ctx.addIssue({ path: ['branchFree'], code: 'custom', message: ENGLISH_ONLY_MESSAGE });
    }

    // Address: require the matching sub-object
    if (data.country === 'TH') {
      if (!data.thaiAddress) {
        ctx.addIssue({ path: ['thaiAddress'], code: 'custom', message: 'กรุณากรอกที่อยู่' });
      }
    } else {
      if (!data.internationalAddress) {
        ctx.addIssue({ path: ['internationalAddress'], code: 'custom', message: 'กรุณากรอกที่อยู่' });
      }
    }
  })
  /**
   * head_office + a leftover code → blank the code, do NOT reject.
   *
   * The code input is HIDDEN when the type is head office, so an error there
   * would be unreachable and unclearable — the user could not see the field
   * they were being asked to fix. Same ruling as the in-house schema; pinned by
   * a test in both.
   */
  .transform((data) =>
    data.branchType === 'head_office' && data.branchCode ? { ...data, branchCode: '' } : data
  );

// ── Consent schema (Omise pre-payment summary) ─────────────────────
export const consentSchema = z.object({
  dataChecked:   z.boolean(),
  noRefund:      z.boolean(),
  changePolicy:  z.boolean(),
  termsAccepted: z.boolean(),
});

// ── Root form schema ───────────────────────────────────────────────

export const publicRegistrationSchema = z
  .object({
    // Course refs
    courseId:       z.string().min(1, 'ข้อมูลคอร์สไม่ครบ'),
    courseCode:     z.string().optional(),
    courseName:     z.string().optional(),
    classId:        z.string().min(1, 'กรุณาเลือกรอบอบรม'),
    classDate:      z.string().optional(),
    // 'hybrid' schedule type requires an explicit choice; classroom-only
    // schedules default to 'classroom' and the field is not shown to the user.
    scheduleType:   z.enum(['classroom', 'hybrid', 'online']).optional(),
    attendanceMode: z.enum(['classroom', 'teams']).optional(),

    // Parties
    coordinator:           coordinatorSchema,
    attendeesCount:        z.number().int().min(1).max(20).default(1),
    attendeesListProvided: z.boolean().default(false),
    attendees:             z.array(attendeeSchema).default([]),

    // Invoice
    requestInvoice: z.boolean().default(false),
    invoice:        invoiceSchema.optional().nullable(),

    // Meta
    notes: z.string().trim().max(500).optional().or(z.literal('')),

    // ── Online payment (Omise) — optional; absent = legacy quote flow
    paymentMethod: z.enum(['quote', 'credit_card', 'promptpay']).optional(),
    // Omise token (card) — only present for credit_card method, created
    // client-side by Omise.js. Never the raw card number.
    omiseToken: z.string().optional(),
    consent: consentSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Hybrid schedules require an explicit attendance mode selection.
    if (data.scheduleType === 'hybrid' && !data.attendanceMode) {
      ctx.addIssue({
        path: ['attendanceMode'],
        code: 'custom',
        message: 'กรุณาเลือกรูปแบบการอบรม (Classroom หรือ MS Teams)',
      });
    }

    if (data.requestInvoice && !data.invoice) {
      ctx.addIssue({
        path: ['invoice'],
        code: 'custom',
        message: 'กรุณากรอกข้อมูลใบเสนอราคา',
      });
    }

    if (data.attendeesListProvided) {
      const expected = data.coordinator.isAttending
        ? Math.max(0, data.attendeesCount - 1)
        : data.attendeesCount;
      if (data.attendees.length < expected) {
        ctx.addIssue({
          path: ['attendees'],
          code: 'custom',
          message: `กรุณากรอกข้อมูลผู้เข้าอบรมให้ครบ ${expected} ท่าน`,
        });
      }
    }

    // Card / QR payments require all 4 consent boxes ticked.
    if (data.paymentMethod === 'credit_card' || data.paymentMethod === 'promptpay') {
      const c = data.consent;
      const allChecked =
        c && c.dataChecked && c.noRefund && c.changePolicy && c.termsAccepted;
      if (!allChecked) {
        ctx.addIssue({
          path: ['consent'],
          code: 'custom',
          message: 'กรุณายอมรับเงื่อนไขให้ครบทุกข้อก่อนชำระเงิน',
        });
      }
    }
    // Credit card must carry an Omise token.
    if (data.paymentMethod === 'credit_card' && !data.omiseToken) {
      ctx.addIssue({
        path: ['omiseToken'],
        code: 'custom',
        message: 'ไม่พบข้อมูลบัตร กรุณาลองใหม่',
      });
    }
  });

// ── Default values ─────────────────────────────────────────────────

export const publicRegistrationDefaults = {
  courseId:   '',
  courseCode: '',
  courseName: '',
  classId:    '',
  classDate:  '',
  scheduleType:   undefined,
  attendanceMode: undefined,
  coordinator: {
    firstName:   '',
    lastName:    '',
    email:       '',
    phone:       '',
    isAttending: false,
    // lineId removed — field no longer in the form
  },
  attendeesCount:        1,
  attendeesListProvided: false,
  attendees:      [],
  requestInvoice: false,
  invoice:        null,
  notes: '',
  paymentMethod: undefined,
  omiseToken: undefined,
  consent: null,
};