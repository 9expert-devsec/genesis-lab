import { z } from 'zod';
import {
  attendeeSchema,
  consentSchema,
  coordinatorSchema,
  invoiceContradictsFlag,
  invoiceSchema,
} from '@/lib/schemas/register-public';

/**
 * What a CUSTOMER may send when requesting a quotation for a bundle.
 *
 * ══ IT REUSES THE PUBLIC FORM'S PARTS, FIELD FOR FIELD ══════════════════════
 *
 * `coordinatorSchema`, `attendeeSchema`, `invoiceSchema` and `consentSchema`
 * are IMPORTED, not restated. The round's decision was that a bundle asks for
 * what the ordinary public registration form asks for, so a second spelling of
 * any of them would be a bundle customer held to different rules than a course
 * customer for no reason anyone could state — and those schemas carry real
 * accumulated rulings (the deliberate attendee/coordinator asymmetry, the
 * ENGLISH-ONLY branch, the branchCode `max(20)` that exists so superRefine can
 * own the 5-digit rule, the head_office blank-rather-than-reject transform).
 * Copying them would copy the code and lose the reasons.
 *
 * ══ WHAT IS ABSENT, AND WHY EACH ABSENCE IS DELIBERATE ══════════════════════
 *
 * ── THE ROUND FIELDS ──────────────────────────────────────────────────────
 * No `courseId`, `courseCode`, `courseName`, `classId`, `classDate`,
 * `scheduleType` or `attendanceMode`. A bundle's courses and rounds are chosen
 * by the AUTHOR, on the page, and are derived server-side per leg from the
 * resolved section — see `buildBundleLegs`. Accepting them here would let a
 * client name its own course and round and have them stored under a package's
 * price, which is the whole reason the pair in the URL is treated as a lookup
 * key and nothing else.
 *
 * That is also why there is no `attendanceMode`: there is no round for the
 * customer to choose a mode FOR. A hybrid round in a bundle is refused by
 * `buildBundleLegs` rather than defaulted, because guessing `classroom` for
 * someone who meant Teams sends them to a building on the day.
 *
 * ── THE BUNDLE TAG ────────────────────────────────────────────────────────
 * No `bundle` key. It is concluded by the server from the (pageId, sectionId)
 * pair after `resolveBundleRequest` has resolved it. Zod is in strip mode, so a
 * client that posts one has it dropped here — a registration cannot be filed
 * against a package the customer never opened. The same property is asserted
 * for `publicRegistrationSchema` in test/pure/bundleTag.
 *
 * ── THE PAYMENT KEYS ──────────────────────────────────────────────────────
 * No `paymentMethod`, no `omiseToken`. THIS IS A QUOTATION REQUEST AND OMISE IS
 * NOT INVOLVED — decided for the round. Their absence is what makes that
 * structural rather than a convention: there is no value a client could send
 * that would put a bundle down a charge path.
 *
 * ══ WHAT IS PRESENT AND SHARED ══════════════════════════════════════════════
 *
 * The attendee-completeness rule and the invoice-required rule are the SAME
 * clauses the public schema runs, restated here rather than factored out: both
 * root schemas are a single `z.object().superRefine()` with no seam to share, so
 * extracting them would mean rewriting a schema that is live for real
 * registrations. Two blocks, named rather than silent, and the smaller risk.
 *
 * ── ONE OF THEM IS NOW SHARED AS A FUNCTION, AND THE REASON IS INSTRUCTIVE ─
 * `invoiceContradictsFlag` is IMPORTED, not restated. The paragraph above used
 * to say all of these rules were duplicated because there was no seam — true of
 * the refinement PLUMBING, and it quietly became an argument for duplicating the
 * RULES too. The invoice/flag contradiction is the rule this form actually got
 * wrong in production, so it is the one that must not be able to differ between
 * the two forms: the plumbing stays duplicated, the predicate does not. A rule
 * with a defect behind it earns a shared definition; boilerplate does not.
 */
export const bundleRegistrationSchema = z
  .object({
    // The pair. Present so the SUBMIT re-resolves rather than trusting a
    // session or a hidden field — a round can roll off between opening the
    // form and sending it, and the guard is run again on the way in.
    pageId:    z.string().min(1, 'ข้อมูลแพ็กเกจไม่ครบ'),
    sectionId: z.string().min(1, 'ข้อมูลแพ็กเกจไม่ครบ'),

    coordinator:           coordinatorSchema,
    attendeesCount:        z.number().int().min(1).max(20).default(1),
    attendeesListProvided: z.boolean().default(false),
    attendees:             z.array(attendeeSchema).default([]),

    requestInvoice: z.boolean().default(false),
    invoice:        invoiceSchema.optional().nullable(),

    notes: z.string().trim().max(500).optional().or(z.literal('')),

    consent: consentSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.requestInvoice && !data.invoice) {
      ctx.addIssue({
        path: ['invoice'],
        code: 'custom',
        message: 'กรุณากรอกข้อมูลใบเสนอราคา',
      });
    }

    // …AND THE INVERSE. THIS FORM IS WHERE THAT DEFECT SHIPPED: a real request
    // stored a complete invoice beside `requestInvoice: false`, and every
    // reader gates on the flag, so the billing details reached the database,
    // the mail model, and nobody. The rule is imported rather than restated —
    // see `invoiceContradictsFlag`.
    if (invoiceContradictsFlag(data)) {
      ctx.addIssue({
        path: ['requestInvoice'],
        code: 'custom',
        message: 'มีข้อมูลใบเสนอราคาแต่ไม่ได้ระบุว่าขอใบเสนอราคา',
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

/**
 * Defaults for the form, mirroring `publicRegistrationDefaults` minus the round.
 *
 * ══ `requestInvoice` IS `true` HERE AND `false` THERE. DO NOT "ALIGN" THEM. ══
 *
 * This is the one deliberate divergence from `publicRegistrationDefaults`, and
 * it is written at the default rather than 300 lines away because the distance
 * is what hid the original defect.
 *
 * `publicRegistrationDefaults.requestInvoice` is `false` — and the ordinary
 * wizard then OVERRIDES it to `true` inside its own `useForm({ defaultValues })`
 * (RegisterWizard.jsx, ~line 701), far from the defaults object it is
 * correcting. The bundle form spread these defaults and did not repeat that
 * override, so a real submission stored a complete invoice beside
 * `requestInvoice: false`. Every reader gates on the flag: the admin card
 * rendered ไม่ได้ขอใบเสนอราคา and the confirmation email dropped its entire
 * billing section, while the data sat in the document untouched.
 *
 * (That form was `BundleRegisterForm.jsx` when the defect shipped. It is
 * `BundleWizard.jsx` now — same schema, same defaults, split across three
 * steps — and the name is corrected here so the next reader can open the file
 * this paragraph is actually about.)
 *
 * ── WHY `true` IS THE ONLY LEGITIMATE VALUE FOR THIS FORM ────────────────
 * The bundle form renders `InvoiceFields` UNCONDITIONALLY and has no path that
 * collects a registration without them — there is no opt-in checkbox and no
 * branch that hides the section. So `false` is not a state this form can
 * honestly be in, and defaulting to it was defaulting to a lie about what the
 * customer was asked.
 *
 * The wizard keeps its override rather than being changed to match: it is the
 * live public path, its `false` default is reachable by other consumers of that
 * shared object, and moving it is a separate decision about a form this round
 * did not touch.
 *
 * `invoiceContradictsFlag` in the superRefine above is the backstop for both —
 * a submission that manages to carry invoice data with the flag clear is now
 * REFUSED rather than silently stored.
 */
export const bundleRegistrationDefaults = {
  pageId: '',
  sectionId: '',
  coordinator: {
    firstName:   '',
    lastName:    '',
    email:       '',
    phone:       '',
    isAttending: false,
  },
  attendeesCount:        1,
  attendeesListProvided: false,
  attendees:      [],
  // `true`, unlike publicRegistrationDefaults — see the note above this object.
  requestInvoice: true,
  invoice:        null,
  notes: '',
  consent: null,
};
