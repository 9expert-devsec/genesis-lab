import { z } from 'zod';

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

export const internationalAddressSchema = z.object({
  line1:      z.string().trim().min(1, 'กรุณากรอกที่อยู่').max(200),
  line2:      z.string().trim().max(200).optional().or(z.literal('')),
  city:       z.string().trim().min(1, 'กรุณากรอกเมือง').max(100),
  state:      z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
  country:    z.string().trim().min(1, 'กรุณากรอกประเทศ').max(100),
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
    branch:      z.string().trim().max(100).optional().or(z.literal('')),
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
};