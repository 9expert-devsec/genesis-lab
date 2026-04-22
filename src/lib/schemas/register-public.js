import { z } from 'zod';

/**
 * Validation schema for /registration/public form submissions.
 * Shared between the client form (react-hook-form resolver) and the
 * Server Action that writes to Mongo.
 */

// Thai phone: 10 digits, commonly starts with 0; allow spaces/dashes input
const phoneRegex = /^[0-9+()\-\s]{9,20}$/;

export const registerPublicSchema = z.object({
  // Course / class reference — filled by query string, hidden to user
  courseId:   z.string().min(1, 'courseId is required'),
  courseCode: z.string().optional().default(''),
  courseName: z.string().optional().default(''),
  classId:    z.string().min(1, 'classId is required'),
  classDate:  z.string().optional().default(''),

  // Attendee
  firstName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  lastName:  z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
  email:     z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  phone:     z.string().trim().regex(phoneRegex, 'เบอร์โทรไม่ถูกต้อง'),
  lineId:    z.string().trim().max(100).optional().default(''),

  // Billing (optional block)
  companyName: z.string().trim().max(200).optional().default(''),
  taxId:       z.string().trim().max(20).optional().default(''),
  address:     z.string().trim().max(500).optional().default(''),

  // Consent
  consentPdpa: z.literal(true, {
    errorMap: () => ({ message: 'กรุณายอมรับเงื่อนไข PDPA' }),
  }),
});

export const registerPublicDefaults = {
  courseId:    '',
  courseCode:  '',
  courseName:  '',
  classId:     '',
  classDate:   '',
  firstName:   '',
  lastName:    '',
  email:       '',
  phone:       '',
  lineId:      '',
  companyName: '',
  taxId:       '',
  address:     '',
  consentPdpa: false,
};
