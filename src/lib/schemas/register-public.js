import { z } from 'zod';

/**
 * Validation schema for /registration/public form submissions.
 * Shared between the client form (react-hook-form resolver) and the
 * API route that writes to Mongo. Single source of truth per
 * Manifesto §4.6.
 */

const thaiPhoneRegex = /^(0\d{9}|\+\d{10,15})$/;
const taxIdRegex = /^\d{13}$/;

export const publicRegistrationSchema = z
  .object({
    // Course refs (from URL params)
    courseId: z.string().min(1, 'ข้อมูลคอร์สไม่ครบ'),
    courseCode: z.string().optional(),
    courseName: z.string().optional(),
    classId: z.string().min(1, 'ข้อมูลรอบอบรมไม่ครบ'),
    classDate: z.string().optional(),

    // Attendee
    firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
    lastName: z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
    email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
    phone: z
      .string()
      .trim()
      .regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
    lineId: z.string().trim().max(50).optional().or(z.literal('')),

    // Invoice — all-or-nothing group, toggled by requestInvoice
    requestInvoice: z.boolean().default(false),
    companyName: z.string().trim().max(200).optional().or(z.literal('')),
    taxId: z.string().trim().optional().or(z.literal('')),
    address: z.string().trim().max(500).optional().or(z.literal('')),

    // Meta
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.requestInvoice) {
      if (!data.companyName) {
        ctx.addIssue({
          path: ['companyName'],
          code: 'custom',
          message: 'กรุณากรอกชื่อบริษัท',
        });
      }
      if (!data.taxId || !taxIdRegex.test(data.taxId)) {
        ctx.addIssue({
          path: ['taxId'],
          code: 'custom',
          message: 'เลขประจำตัวผู้เสียภาษี 13 หลัก',
        });
      }
      if (!data.address) {
        ctx.addIssue({
          path: ['address'],
          code: 'custom',
          message: 'กรุณากรอกที่อยู่',
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
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  lineId: '',
  requestInvoice: false,
  companyName: '',
  taxId: '',
  address: '',
  notes: '',
};
