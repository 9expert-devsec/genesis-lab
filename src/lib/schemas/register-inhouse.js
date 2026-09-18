import { z } from 'zod';
import { containsThai, ENGLISH_ONLY_MESSAGE } from '@/lib/registration/englishOnly';
import { thaiPhone, THAI_PHONE_ERROR_MESSAGE } from '@/lib/registration/thaiPhone';

// ── Address schemas ────────────────────────────────────────────────
//
// DELIBERATELY A SECOND DECLARATION of the shapes in register-public.js rather
// than an import across the two schema files. The two flows are versioned and
// approved separately, and an import would mean a message change approved for
// the public wizard silently shipping in the in-house quotation. What is NOT
// acceptable is the two drifting by accident, so the messages below are the
// same strings, on purpose, and a test asserts the pairs stay equal.

export const thaiAddressSchema = z.object({
  addressLine: z.string().trim().min(1, 'กรุณากรอกที่อยู่').max(200),
  subDistrict: z.string().trim().min(1, 'กรุณาเลือกแขวง/ตำบล').max(100),
  district:    z.string().trim().min(1, 'กรุณาเลือกเขต/อำเภอ').max(100),
  province:    z.string().trim().min(1, 'กรุณาเลือกจังหวัด').max(100),
  postalCode:  z.string().trim().regex(/^\d{5}$/, 'รหัสไปรษณีย์ 5 หลัก'),
});

/**
 * 'Other country' is an ENGLISH-ONLY branch — see src/lib/registration/englishOnly.js
 * for why the rule is stated as an exclusion and not as an A-Z allowlist.
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

/**
 * The onsite VENUE, in the same five-field shape as the quotation address so it
 * can use the same postal-code-first autocomplete.
 *
 * LOOSE HERE, STRICT IN superRefine. The venue only exists for an onsite
 * enquiry, so requiring the five fields at this level would make every online
 * submission fail on an address it was never asked for. The strict pass runs
 * conditionally below, reusing `thaiAddressSchema` so the messages cannot drift
 * from the quotation block's.
 *
 * NOT NAMED `onsiteAddress`. That path is a String on RegisterInhouse and
 * existing documents hold strings in it; turning it into a subdocument is a
 * cast failure on READ, with no migration and no error until someone opens an
 * old enquiry. The three legacy string paths stay on the Mongoose schema,
 * written by nothing.
 */
const onsiteVenueSchema = z.object({
  addressLine: z.string().trim().max(200).optional().or(z.literal('')),
  subDistrict: z.string().trim().max(100).optional().or(z.literal('')),
  district:    z.string().trim().max(100).optional().or(z.literal('')),
  province:    z.string().trim().max(100).optional().or(z.literal('')),
  postalCode:  z.string().trim().max(10).optional().or(z.literal('')),
});

// ── Main schema ────────────────────────────────────────────────────

export const inhouseRegistrationSchema = z
  .object({
    // Training requirement
    coursesInterested: z.array(z.string()).min(1, 'กรุณาเลือกหลักสูตรอย่างน้อย 1 หลักสูตร'),
    /**
     * A FLOOR OF 15, not a default of 15. In-house is sold in rounds of 15.
     *
     * The stepper is not the only way in — `participantsCount` is in
     * `updateRegistration`'s in-house allowlist, and a hand-crafted POST reaches
     * this schema directly — so the disabled minus button is the affordance and
     * this line is the rule. The number is repeated in the defaults below, in
     * InhouseForm's MIN_PARTICIPANTS and in RegisterInhouse's `min`; a seam
     * guard asserts all four agree.
     */
    participantsCount: z.number().int().min(15, 'จำนวนผู้เข้าอบรมขั้นต่ำ 15 ท่าน').default(15),
    contentMode:       z.enum(['standard', 'custom']).default('standard'),
    contentDetails:    z.string().trim().max(2000).optional().or(z.literal('')),

    // Schedule — one month plus a free-text note. No mode selector: the three
    // ways of saying "when" collapsed into the only one anybody used.
    preferredMonth:    z.string().trim().min(1, 'กรุณาเลือกเดือนที่สนใจ'),
    scheduleNote:      z.string().trim().max(500).optional().or(z.literal('')),

    /**
     * NO DEFAULT, and required. The old default was 'flexible', which no longer
     * exists as an option; defaulting to 'onsite' instead would put a venue
     * form in front of every customer including the online ones and record a
     * preference nobody expressed. So the customer picks, and both the venue
     * block and the online block stay hidden until they do.
     */
    trainingFormat:  z.enum(['onsite', 'online'], {
      errorMap: () => ({ message: 'กรุณาเลือกรูปแบบการอบรม' }),
    }),
    onsiteVenue:     onsiteVenueSchema.optional().nullable(),
    onlineRegion:    z.string().trim().max(200).optional().or(z.literal('')),
    onlineTimezone:  z.string().trim().max(100).optional().or(z.literal('')),

    // Contact
    contactFirstName:     z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
    contactLastName:      z.string().trim().min(1, 'กรุณากรอกนามสกุล').max(100),
    contactRole:          z.string().trim().max(100).optional().or(z.literal('')),
    contactDepartment:    z.string().trim().max(100).optional().or(z.literal('')),
    contactEmail:         z.string().email('รูปแบบอีเมลไม่ถูกต้อง'),
    contactPhone:         thaiPhone(z.string().trim(), THAI_PHONE_ERROR_MESSAGE),
    contactLine:          z.string().trim().max(50).optional().or(z.literal('')),
    preferredContact:     z.enum(['phone', 'email', 'line']).default('email'),
    preferredContactTime: z.enum(['morning', 'afternoon', 'business']).default('business'),

    // Quotation. `companyName` is NOT here: the contact section no longer asks
    // for a company twice. The API route mirrors this field onto the legacy
    // `companyName` path — one call site, see the route.
    quotationCountry:    z.enum(['TH', 'OTHER']).default('TH'),
    quotationCompany:    z.string().trim().min(1, 'กรุณากรอกชื่อบริษัท').max(200),
    taxId:               z.string().trim().max(30).optional().or(z.literal('')),
    /**
     * STRUCTURED, and no derived `branch` string alongside it. See
     * src/lib/registration/branchLabel.js — the label is computed at every read
     * site instead, because one value under two names is how the wrong one ends
     * up in a template.
     */
    branchType:          z.enum(['head_office', 'branch']).default('head_office'),
    // max(20), NOT max(5): the 5-digit rule lives in superRefine so it can be
    // conditional, and a field-level max would fire FIRST on a 6-digit value
    // with zod's own English message instead of 'เลขที่สาขา 5 หลัก'. This bound
    // is only here to stop an unbounded string reaching Mongo.
    branchCode:          z.string().trim().max(20).optional().or(z.literal('')),
    thaiAddress:          thaiAddressSchema.optional().nullable(),
    internationalAddress: internationalAddressSchema.optional().nullable(),

    // Notes
    message: z.string().trim().max(2000).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    // ── Onsite: the venue is the quotation address shape, required in full ──
    if (data.trainingFormat === 'onsite') {
      if (!data.onsiteVenue) {
        ctx.addIssue({ path: ['onsiteVenue'], code: 'custom', message: 'กรุณาระบุสถานที่จัดอบรม' });
      } else {
        // Re-run the STRICT address schema so the venue's messages are the same
        // strings as the quotation block's, by construction rather than by
        // copy-paste.
        const strict = thaiAddressSchema.safeParse(data.onsiteVenue);
        if (!strict.success) {
          for (const issue of strict.error.issues) {
            ctx.addIssue({ path: ['onsiteVenue', ...issue.path], code: 'custom', message: issue.message });
          }
        }
      }
    }

    // ── Quotation, Thailand: everything is required ──
    if (data.quotationCountry === 'TH') {
      if (!data.taxId || !/^\d{13}$/.test(data.taxId)) {
        ctx.addIssue({ path: ['taxId'], code: 'custom', message: 'เลขประจำตัวผู้เสียภาษี 13 หลัก' });
      }
      if (data.branchType === 'branch' && !/^\d{5}$/.test(data.branchCode ?? '')) {
        ctx.addIssue({ path: ['branchCode'], code: 'custom', message: 'เลขที่สาขา 5 หลัก' });
      }
      if (!data.thaiAddress) {
        ctx.addIssue({ path: ['thaiAddress'], code: 'custom', message: 'กรุณากรอกที่อยู่' });
      }
    } else {
      // ── Quotation, elsewhere: English only, and the address is required ──
      if (containsThai(data.quotationCompany)) {
        ctx.addIssue({ path: ['quotationCompany'], code: 'custom', message: ENGLISH_ONLY_MESSAGE });
      }
      if (containsThai(data.taxId)) {
        ctx.addIssue({ path: ['taxId'], code: 'custom', message: ENGLISH_ONLY_MESSAGE });
      }
      if (!data.internationalAddress) {
        ctx.addIssue({ path: ['internationalAddress'], code: 'custom', message: 'กรุณากรอกที่อยู่' });
      }
    }
  })
  /**
   * THE head_office + code RULING: normalise, do not reject.
   *
   * The code input is hidden whenever branchType is 'head_office', so a stale
   * value there would raise an error the user can neither see nor clear — a
   * dead-ended form. Blanking it is the only outcome that is both consistent in
   * the database and escapable in the UI. Pinned by a test.
   */
  .transform((data) =>
    data.branchType === 'head_office' && data.branchCode ? { ...data, branchCode: '' } : data
  );

// ── Defaults ───────────────────────────────────────────────────────

export const inhouseRegistrationDefaults = {
  coursesInterested:    [],
  participantsCount:    15,
  contentMode:          'standard',
  contentDetails:       '',
  preferredMonth:       '',
  scheduleNote:         '',
  // '' rather than a format: nothing is preselected — see the schema note.
  trainingFormat:       '',
  onsiteVenue:          { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' },
  onlineRegion:         '',
  onlineTimezone:       '',
  contactFirstName:     '',
  contactLastName:      '',
  contactRole:          '',
  contactDepartment:    '',
  contactEmail:         '',
  contactPhone:         '',
  contactLine:          '',
  preferredContact:     'email',
  preferredContactTime: 'business',
  quotationCountry:     'TH',
  quotationCompany:     '',
  taxId:                '',
  branchType:           'head_office',
  branchCode:           '',
  thaiAddress:          { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' },
  internationalAddress: null,
  message:              '',
};

// ── Legacy exports (backward compat for API route) ─────────────────
// The API route (src/app/api/registration/inhouse/route.js) may still import
// registerInhouseSchema. Keep this alias so it doesn't break.
export const registerInhouseSchema   = inhouseRegistrationSchema;
export const registerInhouseDefaults = inhouseRegistrationDefaults;
