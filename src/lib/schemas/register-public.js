import { z } from 'zod';

/**
 * Validation schema for /registration/public form submissions.
 * Shared between the client wizard (react-hook-form resolver) and the
 * API route that writes to Mongo. Single source of truth per
 * Manifesto §4.6.
 */

const thaiPhoneRegex = /^(0\d{9}|\+\d{10,15})$/;
const taxIdRegex = /^\d{13}$/;
const postalCodeRegex = /^\d{5}$/;

export const coordinatorSchema = z.object({
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName:  z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  email:     z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:     z
    .string()
    .trim()
    .regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
  lineId:    z.string().trim().max(50).optional().or(z.literal('')),
  isAttending: z.boolean().default(false),
});

export const attendeeSchema = z.object({
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName:  z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  email:     z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
  phone:     z
    .string()
    .trim()
    .regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
});

export const thaiAddressSchema = z.object({
  addressLine: z.string().trim().min(1, 'กรุณากรอกที่อยู่').max(200),
  subDistrict: z.string().trim().min(1, 'กรุณาเลือกแขวง/ตำบล').max(100),
  district:    z.string().trim().min(1, 'กรุณาเลือกเขต/อำเภอ').max(100),
  province:    z.string().trim().min(1, 'กรุณาเลือกจังหวัด').max(100),
  postalCode:  z.string().trim().regex(postalCodeRegex, 'รหัสไปรษณีย์ 5 หลัก'),
});

export const invoiceSchema = z
  .object({
    type: z.enum(['individual', 'corporate']),
    firstName:   z.string().trim().max(100).optional().or(z.literal('')),
    lastName:    z.string().trim().max(100).optional().or(z.literal('')),
    companyName: z.string().trim().max(200).optional().or(z.literal('')),
    branch:      z.string().trim().max(100).optional().or(z.literal('')),
    taxId:   z.string().trim().regex(taxIdRegex, 'เลขประจำตัวผู้เสียภาษี 13 หลัก'),
    address: thaiAddressSchema,
  })
  .superRefine((data, ctx) => {
    if (data.type === 'individual') {
      if (!data.firstName) {
        ctx.addIssue({ path: ['firstName'], code: 'custom', message: 'กรุณากรอกชื่อ' });
      }
      if (!data.lastName) {
        ctx.addIssue({ path: ['lastName'], code: 'custom', message: 'กรุณากรอกนามสกุล' });
      }
    } else {
      if (!data.companyName) {
        ctx.addIssue({
          path: ['companyName'],
          code: 'custom',
          message: 'กรุณากรอกชื่อบริษัท',
        });
      }
    }
  });

export const publicRegistrationSchema = z
  .object({
    // Course refs
    courseId:   z.string().min(1, 'ข้อมูลคอร์สไม่ครบ'),
    courseCode: z.string().optional(),
    courseName: z.string().optional(),
    classId:    z.string().min(1, 'กรุณาเลือกรอบอบรม'),
    classDate:  z.string().optional(),

    // Parties
    coordinator:           coordinatorSchema,
    attendeesCount:        z.number().int().min(1).max(20).default(1),
    attendeesListProvided: z.boolean().default(true),
    attendees:             z.array(attendeeSchema).default([]),

    // Invoice (structured form collected in sub-phase 2.5a-2)
    requestInvoice: z.boolean().default(false),
    invoice:        invoiceSchema.optional().nullable(),

    // Meta
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.requestInvoice && !data.invoice) {
      ctx.addIssue({
        path: ['invoice'],
        code: 'custom',
        message: 'กรุณากรอกข้อมูลใบกำกับภาษี',
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

export const publicRegistrationDefaults = {
  courseId: '',
  courseCode: '',
  courseName: '',
  classId: '',
  classDate: '',
  coordinator: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    lineId: '',
    isAttending: false,
  },
  attendeesCount: 1,
  attendeesListProvided: true,
  attendees: [],
  requestInvoice: false,
  invoice: null,
  notes: '',
};
