import { z } from 'zod';

const thaiPhoneRegex = /^(0\d{9}|\+\d{10,15})$/;

// ── Address schemas ────────────────────────────────────────────────

export const thaiAddressSchema = z.object({
  addressLine: z.string().trim().optional().or(z.literal('')),
  subDistrict: z.string().trim().optional().or(z.literal('')),
  district:    z.string().trim().optional().or(z.literal('')),
  province:    z.string().trim().optional().or(z.literal('')),
  postalCode:  z.string().trim().optional().or(z.literal('')),
});

export const internationalAddressSchema = z.object({
  line1:      z.string().trim().optional().or(z.literal('')),
  line2:      z.string().trim().optional().or(z.literal('')),
  city:       z.string().trim().optional().or(z.literal('')),
  state:      z.string().trim().optional().or(z.literal('')),
  postalCode: z.string().trim().optional().or(z.literal('')),
  country:    z.string().trim().optional().or(z.literal('')),
});

// ── Main schema ────────────────────────────────────────────────────

export const inhouseRegistrationSchema = z
  .object({
    // Training requirement
    coursesInterested: z.array(z.string()).min(1, 'กรุณาเลือกหลักสูตรอย่างน้อย 1 หลักสูตร'),
    participantsCount: z.number().int().min(1, 'กรุณาระบุจำนวนผู้เข้าอบรม').default(15),
    skillLevel:        z.enum(['beginner', 'intermediate', 'advanced', 'mixed']).default('mixed'),
    objective:         z.string().trim().min(1, 'กรุณาระบุวัตถุประสงค์').max(2000),
    contentMode:       z.enum(['standard', 'custom', 'consult']).default('standard'),
    contentDetails:    z.string().trim().max(2000).optional().or(z.literal('')),

    // Schedule
    scheduleMode:      z.enum(['month', 'dateRange', 'notSure']).default('notSure'),
    preferredMonth:    z.string().trim().optional().or(z.literal('')),
    preferredDateFrom: z.string().trim().optional().or(z.literal('')),
    preferredDateTo:   z.string().trim().optional().or(z.literal('')),
    scheduleNote:      z.string().trim().max(500).optional().or(z.literal('')),

    // Training format
    trainingFormat:  z.enum(['onsite', 'online', 'flexible']).default('flexible'),
    onsiteAddress:   z.string().trim().max(300).optional().or(z.literal('')),
    onsiteProvince:  z.string().trim().max(100).optional().or(z.literal('')),
    onsiteDistrict:  z.string().trim().max(100).optional().or(z.literal('')),
    onsiteEquipment: z.array(z.string()).optional().default([]),
    onlineRegion:    z.string().trim().max(200).optional().or(z.literal('')),
    onlineTimezone:  z.string().trim().max(100).optional().or(z.literal('')),

    // Contact
    contactFirstName:     z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
    contactLastName:      z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
    contactRole:          z.string().trim().max(100).optional().or(z.literal('')),
    contactDepartment:    z.string().trim().max(100).optional().or(z.literal('')),
    companyName:          z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท').max(200),
    contactEmail:         z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
    contactPhone:         z.string().trim().regex(thaiPhoneRegex, 'รูปแบบเบอร์โทรไม่ถูกต้อง (10 หลัก หรือ +ประเทศ)'),
    contactLine:          z.string().trim().max(50).optional().or(z.literal('')),
    preferredContact:     z.enum(['phone', 'email', 'line']).default('email'),
    preferredContactTime: z.enum(['morning', 'afternoon', 'business']).default('business'),

    // Quotation
    quotationCountry:    z.enum(['TH', 'OTHER']).default('TH'),
    quotationCompany:    z.string().trim().max(200).optional().or(z.literal('')),
    taxId:               z.string().trim().max(30).optional().or(z.literal('')),
    branch:              z.string().trim().max(100).optional().or(z.literal('')),
    thaiAddress:          thaiAddressSchema.optional().nullable(),
    internationalAddress: internationalAddressSchema.optional().nullable(),

    // Notes
    message: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // Onsite requires address
    if (data.trainingFormat === 'onsite' && !data.onsiteAddress?.trim()) {
      ctx.addIssue({ path: ['onsiteAddress'], code: 'custom', message: 'กรุณาระบุสถานที่จัดอบรม' });
    }
    // Month mode requires month selection
    if (data.scheduleMode === 'month' && !data.preferredMonth?.trim()) {
      ctx.addIssue({ path: ['preferredMonth'], code: 'custom', message: 'กรุณาเลือกเดือนที่สนใจ' });
    }
    // Date range requires start date
    if (data.scheduleMode === 'dateRange' && !data.preferredDateFrom?.trim()) {
      ctx.addIssue({ path: ['preferredDateFrom'], code: 'custom', message: 'กรุณาระบุวันเริ่มต้น' });
    }
  });

// ── Defaults ───────────────────────────────────────────────────────

export const inhouseRegistrationDefaults = {
  coursesInterested:    [],
  participantsCount:    15,
  skillLevel:           'mixed',
  objective:            '',
  contentMode:          'standard',
  contentDetails:       '',
  scheduleMode:         'notSure',
  preferredMonth:       '',
  preferredDateFrom:    '',
  preferredDateTo:      '',
  scheduleNote:         '',
  trainingFormat:       'flexible',
  onsiteAddress:        '',
  onsiteProvince:       '',
  onsiteDistrict:       '',
  onsiteEquipment:      [],
  onlineRegion:         '',
  onlineTimezone:       '',
  contactFirstName:     '',
  contactLastName:      '',
  contactRole:          '',
  contactDepartment:    '',
  companyName:          '',
  contactEmail:         '',
  contactPhone:         '',
  contactLine:          '',
  preferredContact:     'email',
  preferredContactTime: 'business',
  quotationCountry:     'TH',
  quotationCompany:     '',
  taxId:                '',
  branch:               '',
  thaiAddress:          null,
  internationalAddress: null,
  message:              '',
};

// ── Legacy exports (backward compat for API route) ─────────────────
// The API route (src/app/api/registration/inhouse/route.js) may still import
// registerInhouseSchema. Keep this alias so it doesn't break.
export const registerInhouseSchema   = inhouseRegistrationSchema;
export const registerInhouseDefaults = inhouseRegistrationDefaults;