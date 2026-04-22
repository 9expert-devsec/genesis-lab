import { z } from 'zod';

const phoneRegex = /^[0-9+()\-\s]{9,20}$/;

export const registerInhouseSchema = z.object({
  contactName:  z.string().trim().min(1, 'กรุณากรอกชื่อผู้ติดต่อ').max(200),
  contactEmail: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  contactPhone: z.string().trim().regex(phoneRegex, 'เบอร์โทรไม่ถูกต้อง'),
  contactRole:  z.string().trim().max(200).optional().default(''),

  companyName:    z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท').max(200),
  companyAddress: z.string().trim().max(500).optional().default(''),
  companySize:    z.string().trim().max(50).optional().default(''),

  coursesInterested: z.array(z.string().trim()).default([]),
  participantsCount: z.coerce.number().int().min(1, 'จำนวนผู้เข้าอบรมอย่างน้อย 1 คน').optional(),
  preferredDates:    z.string().trim().max(500).optional().default(''),
  preferredLocation: z
    .enum(['on-site', 'at-9expert', 'online', 'flexible'])
    .default('flexible'),
  budget:  z.string().trim().max(100).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),

  consentPdpa: z.literal(true, {
    errorMap: () => ({ message: 'กรุณายอมรับเงื่อนไข PDPA' }),
  }),
});

export const registerInhouseDefaults = {
  contactName:       '',
  contactEmail:      '',
  contactPhone:      '',
  contactRole:       '',
  companyName:       '',
  companyAddress:    '',
  companySize:       '',
  coursesInterested: [],
  participantsCount: undefined,
  preferredDates:    '',
  preferredLocation: 'flexible',
  budget:            '',
  message:           '',
  consentPdpa:       false,
};
