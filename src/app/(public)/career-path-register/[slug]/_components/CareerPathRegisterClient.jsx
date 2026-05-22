'use client';

/**
 * CareerPathRegisterClient — 3-step registration wizard.
 *
 *   Step 1  Course selection — curriculum-driven, with prerequisite
 *           enforcement based on group ORDER + cross-group date gates.
 *   Step 2  Coordinator / attendees / tax / note (react-hook-form + zod)
 *   Step 3  Read-only preview + submit
 *   Done    Thank-you panel
 *
 * Curriculum drives the form: each group is rendered in order, and a
 * later group is locked until all its predecessors are "complete":
 *   - Fixed group → every item has a selected schedule
 *   - Choice group → ≥ chooseMin selections in that group
 *
 * On top of that, every schedule the user picks in a later group must
 * start AFTER the latest training day across all selections in earlier
 * groups (rounds violating this are individually disabled).
 *
 * The Phase-1 `localCourses` field is no longer read; live MSDB
 * schedules come in via `schedulesByCourse[courseCode]`.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Loader2, Lock,
} from 'lucide-react';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { createCareerPathRegistration } from '@/lib/actions/career-path-registrations';
import { cn } from '@/lib/utils';

// ── Constants ───────────────────────────────────────────────────

const TYPE_BADGE = {
  classroom: 'bg-blue-100 text-blue-700 border-blue-200',
  hybrid:    'bg-purple-100 text-purple-700 border-purple-200',
  online:    'bg-green-100 text-green-700 border-green-200',
};

const TYPE_LABEL = {
  classroom: 'Classroom',
  hybrid:    'Hybrid',
  online:    'Online',
};

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const inputClass =
  'w-full rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 text-sm text-9e-navy placeholder:text-9e-slate-dp-50 focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:bg-[#0D1B2A] dark:text-white';

// ── Date helpers ────────────────────────────────────────────────

function sortedDates(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return [];
  return [...dates].filter(Boolean).sort();
}

function minDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[0] : null;
}

function maxDateOf(dates) {
  const s = sortedDates(dates);
  return s.length ? s[s.length - 1] : null;
}

// ISO `YYYY-MM-DD` strings sort lexicographically — same order as time,
// so `'2026-05-23' > '2026-05-22'` does the right thing.
function isAfter(a, b) {
  if (!a || !b) return false;
  return a > b;
}

function formatThaiRange(dates) {
  const s = sortedDates(dates);
  if (s.length === 0) return '—';
  const start = new Date(s[0]);
  const end   = new Date(s[s.length - 1]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const buddhistYear = start.getFullYear() + 543;
  if (s.length === 1) {
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} ${buddhistYear}`;
  }
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${THAI_MONTHS[start.getMonth()]} ${buddhistYear}`;
  }
  return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} – ${end.getDate()} ${THAI_MONTHS[end.getMonth()]} ${buddhistYear}`;
}

// Resolved hybrid picks have a type like "Hybrid (Classroom)" that
// isn't in TYPE_BADGE/TYPE_LABEL. These helpers fall back to the base
// hybrid styling while still rendering the full label string.
function badgeForType(type) {
  const lower = String(type ?? '').toLowerCase();
  if (TYPE_BADGE[lower]) return TYPE_BADGE[lower];
  if (lower.startsWith('hybrid')) return TYPE_BADGE.hybrid;
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function displayType(type) {
  const lower = String(type ?? '').toLowerCase();
  return TYPE_LABEL[lower] ?? type ?? '—';
}

// ── Validation helpers ─────────────────────────────────────────

function isValidContactPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const prefix = digits.substring(0, 2);
  if (['06', '08', '09'].includes(prefix)) return /^\d{10}$/.test(digits);
  if (['01', '02', '03', '04', '05', '07'].includes(prefix)) {
    return /^\d{9}(\d{1,5})?$/.test(digits);
  }
  return false;
}

// Invoice shape mirrors what `InvoiceFields` reads/writes via RHF.
// Address sub-objects can be `null` (the inactive branch when country
// flips) — InvoiceFields' internal `handleCountryChange` does that to
// stop zod from validating the inactive side.
const thaiAddressShape = z.object({
  addressLine: z.string().default(''),
  subDistrict: z.string().default(''),
  district:    z.string().default(''),
  province:    z.string().default(''),
  postalCode:  z.string().default(''),
});

const intlAddressShape = z.object({
  line1:      z.string().default(''),
  line2:      z.string().default(''),
  city:       z.string().default(''),
  state:      z.string().default(''),
  postalCode: z.string().default(''),
  country:    z.string().default(''),
});

const invoiceShape = z.object({
  type:        z.enum(['individual', 'corporate']).default('individual'),
  country:     z.enum(['TH', 'OTHER']).default('TH'),
  firstName:   z.string().default(''),
  lastName:    z.string().default(''),
  companyName: z.string().default(''),
  branch:      z.string().default(''),
  taxId:       z.string().default(''),
  thaiAddress:          thaiAddressShape.nullable().optional(),
  internationalAddress: intlAddressShape.nullable().optional(),
});

const baseSchema = z.object({
  contactFirstName: z.string().trim().min(1, 'กรุณากรอกชื่อ'),
  contactLastName:  z.string().trim().min(1, 'กรุณากรอกนามสกุล'),
  contactEmail:     z.string().trim().email('อีเมลไม่ถูกต้อง'),
  contactPhone:     z.string().refine(isValidContactPhone, 'รูปแบบเบอร์โทรไม่ถูกต้อง'),
  isCoordinator:    z.boolean().default(false),
  attendeeCount:    z.coerce.number().int().min(1).default(1),
  skipAttendee:     z.boolean().default(false),
  attendees: z.array(
    z.object({
      firstName: z.string().default(''),
      lastName:  z.string().default(''),
      email:     z.string().default(''),
      phone:     z.string().default(''),
    })
  ).default([]),

  invoice: invoiceShape,

  note: z.string().default(''),
}).superRefine((val, ctx) => {
  const inv = val.invoice ?? {};
  if (inv.type === 'individual') {
    if (!inv.firstName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['invoice', 'firstName'], message: 'กรุณากรอกชื่อ' });
    }
    if (!inv.lastName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['invoice', 'lastName'], message: 'กรุณากรอกนามสกุล' });
    }
  } else if (inv.type === 'corporate') {
    if (!inv.companyName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['invoice', 'companyName'], message: 'กรุณากรอกชื่อบริษัท' });
    }
    // Thai 13-digit tax ID enforced only for TH; international is free-text + optional.
    if (inv.country === 'TH') {
      const digits = String(inv.taxId ?? '').replace(/\D/g, '');
      if (!/^\d{13}$/.test(digits)) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoice', 'taxId'],
          message: 'เลขประจำตัวผู้เสียภาษี 13 หลัก',
        });
      }
    }
  }

  if (val.skipAttendee) return;
  const need = val.isCoordinator
    ? Math.max(0, val.attendeeCount - 1)
    : val.attendeeCount;
  for (let i = 0; i < need; i++) {
    const a = val.attendees[i] ?? {};
    if (!a.firstName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['attendees', i, 'firstName'], message: 'กรุณากรอกชื่อ' });
    }
    if (!a.lastName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['attendees', i, 'lastName'], message: 'กรุณากรอกนามสกุล' });
    }
  }
});

const EMPTY_THAI_ADDRESS = {
  addressLine: '', subDistrict: '', district: '', province: '', postalCode: '',
};

const EMPTY_INVOICE = {
  type: 'individual',
  country: 'TH',
  firstName: '',
  lastName: '',
  companyName: '',
  branch: '',
  taxId: '',
  thaiAddress: EMPTY_THAI_ADDRESS,
  internationalAddress: null,
};

// ── Curriculum helpers ──────────────────────────────────────────

function itemCode(item) {
  return String(item?.snap?.code ?? item?.course_id ?? '');
}

function itemName(item) {
  return String(item?.snap?.name ?? item?.externalName ?? itemCode(item) ?? '');
}

function isChoiceGroup(group) {
  return String(group?.kind ?? '').toLowerCase() === 'choice';
}

function groupItems(group) {
  return Array.isArray(group?.items) ? group.items : [];
}

// Total required count across all groups — what the bottom counter
// divides by. Fixed = items.length; Choice = chooseMin (defaults to 1).
function totalRequired(curriculum) {
  let n = 0;
  for (const g of curriculum) {
    const items = groupItems(g);
    if (isChoiceGroup(g)) n += Math.max(1, Number(g?.chooseMin) || 1);
    else n += items.length;
  }
  return n;
}

// Hybrid picks are stored with `type: 'hybrid'` until the user resolves
// them to Classroom or MS Teams (at which point `type` becomes
// "Hybrid (Classroom)" / "Hybrid (MS Teams)"). Unresolved picks must
// not count toward group completion.
function isPickResolved(sel) {
  return Boolean(sel) && String(sel?.type ?? '').toLowerCase() !== 'hybrid';
}

// A group is "satisfied" when its own selection threshold is met. Used
// to decide whether the NEXT group's overlay should unlock.
function isGroupSatisfied(group, selected) {
  const items = groupItems(group);
  if (items.length === 0) return true; // nothing to pick, treat as done
  const picks = items.filter((it) => isPickResolved(selected[itemCode(it)])).length;
  if (isChoiceGroup(group)) {
    return picks >= Math.max(1, Number(group?.chooseMin) || 1);
  }
  return picks === items.length;
}

// `eligible`        — prior groups all satisfied
// `latestPriorDate` — max(end-date) across all selections in prior groups
function computeGroupEligibility(curriculum, selected) {
  const out = [];
  let priorOk = true;
  let latestPriorDate = null;

  for (let i = 0; i < curriculum.length; i++) {
    out.push({ eligible: priorOk, latestPriorDate });

    // Update for the next iteration: collect this group's dates and
    // whether it's complete.
    const g = curriculum[i];
    for (const item of groupItems(g)) {
      const sel = selected[itemCode(item)];
      if (!sel) continue;
      const endStr = maxDateOf(sel.dates);
      if (endStr && (!latestPriorDate || endStr > latestPriorDate)) {
        latestPriorDate = endStr;
      }
    }
    priorOk = priorOk && isGroupSatisfied(g, selected);
  }
  return out;
}

// Build a `{ courseCode → name }` lookup once so item-level prereq
// messages can render readable course names instead of bare codes.
function buildCodeToName(curriculum) {
  const map = {};
  for (const g of curriculum) {
    for (const it of groupItems(g)) {
      const code = itemCode(it);
      if (code) map[code] = itemName(it);
    }
  }
  return map;
}

// Manual item-level prerequisites (admin-configured on each curriculum
// item). Independent of the group-order rule — a course in group 1 can
// require another course in group 1.
//
// Returns: { [courseCode]: { locked: bool, reason: string | null,
//                            missing: string[] } }
function computeItemEligibility(curriculum, selected, codeToName) {
  const out = {};
  for (const g of curriculum) {
    for (const it of groupItems(g)) {
      const code = itemCode(it);
      if (!code) continue;
      const prereqs = Array.isArray(it?.prerequisites)
        ? it.prerequisites.map(String)
        : [];
      if (prereqs.length === 0) {
        out[code] = { locked: false, reason: null, missing: [] };
        continue;
      }
      const missing = prereqs.filter((c) => !selected[c]);
      if (missing.length === 0) {
        out[code] = { locked: false, reason: null, missing: [] };
      } else {
        const names = missing.map((c) => codeToName[c] ?? c);
        out[code] = {
          locked: true,
          reason: `กรุณาเลือก ${names.join(', ')} ก่อน`,
          missing,
        };
      }
    }
  }
  return out;
}

// ── Main component ─────────────────────────────────────────────

export function CareerPathRegisterClient({ careerPath }) {
  const curriculum = useMemo(
    () => (Array.isArray(careerPath?.curriculum) ? careerPath.curriculum : []),
    [careerPath]
  );
  const schedulesByCourse = careerPath?.schedulesByCourse ?? {};

  // selected: { [courseCode]: { courseName, courseCode, scheduleId,
  //                             dates, type, startDate, endDate, round } }
  // `type` starts as 'hybrid' for hybrid picks; once the user resolves
  // the sub-mode it flips to "Hybrid (Classroom)" or "Hybrid (MS Teams)".
  const [selected, setSelected] = useState({});
  // hybridChoice: { [scheduleId]: 'Classroom' | 'MS Teams' }
  // Drives the radio buttons under hybrid rounds. Lives separately from
  // `selected` so re-clicking a hybrid round preserves whichever sub-
  // mode the user already chose.
  const [hybridChoice, setHybridChoice] = useState({});
  // step values:
  //   0 — course selection (pre-step, no number)
  //   1 — personal info
  //   2 — preview / confirm
  //   3 — thank-you (handled by `result` panel)
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);

  const codeToName = useMemo(() => buildCodeToName(curriculum), [curriculum]);

  // Prune hybridChoice when its schedule is no longer referenced by any
  // `selected` entry — covers toggle-off, switching rounds, and the
  // cascading drops the stale-dependent loop performs after any pick.
  useEffect(() => {
    const activeIds = new Set();
    for (const sel of Object.values(selected)) {
      if (sel?.scheduleId) activeIds.add(sel.scheduleId);
    }
    setHybridChoice((cur) => {
      let changed = false;
      const pruned = {};
      for (const [sid, val] of Object.entries(cur)) {
        if (activeIds.has(sid)) pruned[sid] = val;
        else changed = true;
      }
      return changed ? pruned : cur;
    });
  }, [selected]);

  // User clicked Classroom or MS Teams under a selected hybrid round.
  // Updates both:
  //   • hybridChoice[scheduleId] for the radio UI
  //   • selected[code].type → "Hybrid (Classroom)" / "Hybrid (MS Teams)"
  //     so isPickResolved() returns true and the group counts as
  //     satisfied.
  function handleHybridChoice(code, scheduleId, choice) {
    setHybridChoice((cur) => ({ ...cur, [scheduleId]: choice }));
    setSelected((cur) => {
      const sel = cur[code];
      if (!sel || sel.scheduleId !== scheduleId) return cur;
      return {
        ...cur,
        [code]: { ...sel, type: `Hybrid (${choice})` },
      };
    });
  }

  const eligibility = useMemo(
    () => computeGroupEligibility(curriculum, selected),
    [curriculum, selected]
  );

  const itemEligibility = useMemo(
    () => computeItemEligibility(curriculum, selected, codeToName),
    [curriculum, selected, codeToName]
  );

  // ── selection mutation ──────────────────────────────────────

  function pickSchedule(group, item, schedule) {
    const code = itemCode(item);
    const dates = schedule.dates ?? [];
    const startDate = minDateOf(dates);
    const endDate   = maxDateOf(dates);
    const type      = String(schedule.type ?? '').toLowerCase();

    const entry = {
      courseName: itemName(item),
      courseCode: code,
      scheduleId: String(schedule._id ?? ''),
      dates,
      type,
      startDate: startDate ?? '',
      endDate:   endDate   ?? '',
      round:     formatThaiRange(dates),
    };

    setSelected((cur) => {
      const next = { ...cur };

      // Toggle off if same round clicked again.
      if (next[code]?.scheduleId === entry.scheduleId) {
        delete next[code];
      } else {
        // Choice group with chooseMax=1 → exclusive: clear other items
        // in this group before adding.
        if (isChoiceGroup(group)) {
          const max = Math.max(1, Number(group?.chooseMax) || 1);
          if (max === 1) {
            for (const sibling of groupItems(group)) {
              const sCode = itemCode(sibling);
              if (sCode !== code) delete next[sCode];
            }
          } else {
            // chooseMax > 1: refuse if already at max and we're adding
            // a NEW course (re-picking a different round on an existing
            // course is fine — it's a swap, not an addition).
            const isReplacing = Boolean(next[code]);
            const cur = groupItems(group).filter((it) => next[itemCode(it)]).length;
            if (!isReplacing && cur >= max) {
              return cur; // no-op — caller already disables; defensive guard
            }
          }
        }
        next[code] = entry;
      }

      // Drop downstream selections that are now invalid (their prior
      // group is no longer satisfied, OR their start date is now <=
      // the new latest prior date). Loop until stable.
      let changed = true;
      while (changed) {
        changed = false;
        const elig = computeGroupEligibility(curriculum, next);
        for (let gi = 0; gi < curriculum.length; gi++) {
          const { eligible, latestPriorDate } = elig[gi];
          for (const item2 of groupItems(curriculum[gi])) {
            const c2 = itemCode(item2);
            const sel = next[c2];
            if (!sel) continue;
            if (!eligible) {
              delete next[c2];
              changed = true;
              continue;
            }
            if (latestPriorDate && !isAfter(sel.startDate, latestPriorDate)) {
              delete next[c2];
              changed = true;
              continue;
            }
            // Item-level prereqs: drop if any required course is no
            // longer selected. (Same loop iteration so cascading drops
            // converge before we exit.)
            const itemPrereqs = Array.isArray(item2?.prerequisites)
              ? item2.prerequisites.map(String)
              : [];
            if (itemPrereqs.some((p) => !next[p])) {
              delete next[c2];
              changed = true;
            }
          }
        }
      }

      return next;
    });
  }

  // ── progress ───────────────────────────────────────────────

  const total = useMemo(() => totalRequired(curriculum), [curriculum]);
  const selectedCount = useMemo(() => {
    // For Choice groups with chooseMin, cap counted picks at chooseMin
    // so the X/Y counter measures "completeness" not raw selections.
    // Unresolved hybrid picks don't count.
    let n = 0;
    for (const g of curriculum) {
      const items = groupItems(g);
      const picks = items.filter((it) => isPickResolved(selected[itemCode(it)])).length;
      if (isChoiceGroup(g)) {
        n += Math.min(picks, Math.max(1, Number(g?.chooseMin) || 1));
      } else {
        n += picks;
      }
    }
    return n;
  }, [curriculum, selected]);

  const canProceed = curriculum.length > 0 && curriculum.every((g) => isGroupSatisfied(g, selected));

  // ── step transitions ───────────────────────────────────────

  function handleStep1Next() {
    if (!canProceed) return;
    setStep(1);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleStep2Next(data) {
    setFormData(data);
    setStep(2);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const selectedCourses = [];
      for (const g of curriculum) {
        for (const item of groupItems(g)) {
          const sel = selected[itemCode(item)];
          if (!sel) continue;
          selectedCourses.push({
            courseName: sel.courseName,
            courseCode: sel.courseCode,
            round:      sel.round,
            startDate:  sel.startDate,
            endDate:    sel.endDate,
            type:       sel.type,
            scheduleId: sel.scheduleId,
          });
        }
      }

      const careerSlug = (careerPath.api_slug ?? '').replace(/-career-path$/, '');

      // Map the nested `invoice` form shape (produced by InvoiceFields)
      // back to the flat tax columns the CareerPathRegistration model
      // expects. International addresses get squashed into the same
      // five flat fields: line1+line2 → taxAddress, state → province,
      // city → subdistrict, postalCode passes through.
      const inv = formData.invoice ?? {};
      const isThai = inv.country === 'TH';
      const intl = inv.internationalAddress ?? {};
      const taxPayload = {
        taxType:       inv.type === 'corporate' ? 'company' : 'personal',
        taxFirstName:  inv.firstName    ?? '',
        taxLastName:   inv.lastName     ?? '',
        companyName:   inv.companyName  ?? '',
        companyBranch: inv.branch       ?? '',
        companyTaxId:  inv.type === 'corporate' ? (inv.taxId ?? '') : '',
        personalTaxId: inv.type === 'individual' ? (inv.taxId ?? '') : '',
        taxAddress: isThai
          ? (inv.thaiAddress?.addressLine ?? '')
          : `${intl.line1 ?? ''} ${intl.line2 ?? ''}`.trim(),
        province:    isThai ? (inv.thaiAddress?.province    ?? '') : (intl.state      ?? ''),
        district:    isThai ? (inv.thaiAddress?.district    ?? '') : '',
        subdistrict: isThai ? (inv.thaiAddress?.subDistrict ?? '') : (intl.city       ?? ''),
        zipcode:     isThai ? (inv.thaiAddress?.postalCode  ?? '') : (intl.postalCode ?? ''),
      };

      const payload = {
        careerPathId:    careerPath.career_path_id ?? String(careerPath._id ?? ''),
        careerName:      careerPath.title ?? '',
        careerSlug,
        selectedCourses,
        contactFirstName: formData.contactFirstName,
        contactLastName:  formData.contactLastName,
        contactEmail:     formData.contactEmail,
        contactPhone:     formData.contactPhone,
        isCoordinator:    formData.isCoordinator,
        attendeeCount:    formData.attendeeCount,
        skipAttendee:     formData.skipAttendee,
        attendees:        formData.skipAttendee ? [] : formData.attendees ?? [],
        ...taxPayload,
        note: formData.note,
      };

      const res = await createCareerPathRegistration(payload);
      if (res?.ok) {
        setResult({ id: res.id });
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setSubmitError(res?.error || 'ส่งข้อมูลไม่สำเร็จ');
      }
    } catch (err) {
      setSubmitError(err?.message ?? 'ส่งข้อมูลไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  // ── render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
      {/* Banner is the first thing the visitor sees. When the admin
          hasn't uploaded one, fall back to a plain title so the page
          still has a recognisable header. */}
      {careerPath.registerBannerUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <div className="mb-6 w-full overflow-hidden rounded-2xl">
          <img
            src={careerPath.registerBannerUrl}
            alt={careerPath.title ?? 'Career Path banner'}
            className="h-auto w-full object-cover"
          />
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-9e-action">
            สมัคร Career Path
          </p>
          <h1 className="text-2xl font-bold text-9e-navy dark:text-white">
            {careerPath.title}
          </h1>
        </div>
      )}

      {result ? (
        <CompletePanel id={result.id} email={formData?.contactEmail} />
      ) : (
        <>
          {/* Step indicator only after the user leaves the course-
              selection screen — that screen is a "pre-step" without
              a numbered position. */}
          {step > 0 && <Stepper step={step} />}

          {step === 0 && (
            <Step1Courses
              curriculum={curriculum}
              schedulesByCourse={schedulesByCourse}
              selected={selected}
              eligibility={eligibility}
              itemEligibility={itemEligibility}
              hybridChoice={hybridChoice}
              onHybridChoice={handleHybridChoice}
              onPick={pickSchedule}
              total={total}
              selectedCount={selectedCount}
              canProceed={canProceed}
              onNext={handleStep1Next}
            />
          )}

          {step === 1 && (
            <Step2Form
              defaultValues={formData}
              selected={selected}
              curriculum={curriculum}
              onBack={() => setStep(0)}
              onSubmit={handleStep2Next}
            />
          )}

          {step === 2 && formData && (
            <Step3Preview
              curriculum={curriculum}
              selected={selected}
              data={formData}
              onBack={() => setStep(1)}
              onConfirm={handleConfirm}
              submitting={submitting}
              error={submitError}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Stepper ─────────────────────────────────────────────────────

function Stepper({ step }) {
  // 3 numbered steps. Course selection (step=0) is a pre-step and
  // doesn't appear here — the caller hides the whole Stepper for it.
  const steps = [
    { n: 1, label: 'กรอกข้อมูล' },
    { n: 2, label: 'ยืนยันข้อมูล' },
    { n: 3, label: 'เสร็จสิ้น' },
  ];
  return (
    <ol className="my-6 flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
              step === s.n
                ? 'border-9e-action bg-9e-action text-white'
                : step > s.n
                  ? 'border-9e-action bg-9e-action/10 text-9e-action'
                  : 'border-[var(--surface-border)] text-9e-slate-dp-50'
            )}
          >
            {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
          </span>
          <span
            className={cn(
              'font-medium',
              step >= s.n ? 'text-9e-navy dark:text-white' : 'text-9e-slate-dp-50'
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-2 h-px w-8 bg-[var(--surface-border)]" />
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Step 1: Curriculum-driven course selection ─────────────────

function Step1Courses({
  curriculum, schedulesByCourse, selected, eligibility, itemEligibility,
  hybridChoice, onHybridChoice,
  onPick, total, selectedCount, canProceed, onNext,
}) {
  if (curriculum.length === 0) {
    return (
      <div className="rounded-9e-lg border border-dashed border-[var(--surface-border)] p-10 text-center text-sm text-9e-slate-dp-50">
        ยังไม่มีหลักสูตรที่กำหนดสำหรับ Career Path นี้
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-9e-lg border border-9e-action/30 bg-9e-action/5 px-4 py-3 text-sm text-9e-navy dark:text-white">
        เลือกแล้ว <strong>{selectedCount}</strong> / <strong>{total}</strong> คอร์ส
      </div>

      {curriculum.map((group, gi) => {
        const { eligible, latestPriorDate } = eligibility[gi];
        const isChoice = isChoiceGroup(group);
        const items = groupItems(group);
        const chooseMin = Math.max(1, Number(group?.chooseMin) || 1);
        const chooseMax = Math.max(chooseMin, Number(group?.chooseMax) || chooseMin);
        const picks = items.filter((it) => Boolean(selected[itemCode(it)])).length;

        return (
          <section
            key={gi}
            className="relative rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]"
          >
            <header className="mb-3 flex flex-wrap items-baseline gap-2">
              <h2 className="text-base font-bold text-9e-navy dark:text-white">
                {group.title || `กลุ่มที่ ${gi + 1}`}
              </h2>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  isChoice
                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                    : 'border-green-100 bg-green-50 text-green-700'
                )}
              >
                {isChoice
                  ? `เลือก ${chooseMin}${chooseMax > chooseMin ? `–${chooseMax}` : ''} คอร์สจากกลุ่มนี้`
                  : 'ต้องเลือกทุกคอร์ส'}
              </span>
              {isChoice && (
                <span className="text-xs text-9e-slate-dp-50">
                  เลือกแล้ว {picks}/{chooseMin}
                </span>
              )}
            </header>

            {group.description && (
              <p className="mb-3 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                {group.description}
              </p>
            )}

            <div className="space-y-4">
              {items.map((item, ii) => {
                const code = itemCode(item);
                const name = itemName(item);
                const schedules = Array.isArray(schedulesByCourse[code])
                  ? schedulesByCourse[code]
                  : [];
                const myPick = selected[code]?.scheduleId ?? null;
                const itemLock = itemEligibility?.[code] ?? { locked: false, reason: null };

                // For Choice with max>1: disable adding new items beyond max
                // (re-selecting on an already-picked item is allowed).
                const choiceFull =
                  isChoice && chooseMax > 1 && !selected[code] && picks >= chooseMax;

                return (
                  <div
                    key={`${code}-${ii}`}
                    className="rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/30 p-3 dark:bg-[#0D1B2A]/30"
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-9e-navy dark:text-white">
                        {name}
                      </h3>
                      <span className="font-mono text-[11px] text-9e-action">{code}</span>
                    </div>

                    {itemLock.locked && (
                      <p className="mb-2 inline-flex items-center gap-1 rounded-9e-sm bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-[#0D1B2A] dark:text-amber-400">
                        <Lock className="h-3 w-3" /> {itemLock.reason}
                      </p>
                    )}

                    {schedules.length === 0 ? (
                      <p className="text-xs italic text-9e-slate-dp-50">
                        ยังไม่มีรอบเปิดรับสมัคร
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {schedules.map((sched) => {
                          const isSelected = myPick === sched._id;
                          const start = minDateOf(sched.dates);
                          const dateOk = !latestPriorDate || isAfter(start, latestPriorDate);
                          const isEnabled = eligible && dateOk && !choiceFull && !itemLock.locked;
                          const t = String(sched.type ?? '').toLowerCase();
                          const badge = TYPE_BADGE[t] ?? 'bg-gray-100 text-gray-700 border-gray-200';

                          return (
                            <button
                              key={sched._id}
                              type="button"
                              disabled={!isEnabled && !isSelected}
                              title={
                                itemLock.locked
                                  ? itemLock.reason
                                  : !eligible
                                    ? 'กรุณาเลือกรอบอบรมของกลุ่มก่อนหน้าก่อน'
                                    : !dateOk
                                      ? 'วันอบรมต้องมาหลังจากคอร์สก่อนหน้า'
                                      : choiceFull
                                        ? `เลือกได้สูงสุด ${chooseMax} คอร์สในกลุ่มนี้`
                                        : undefined
                              }
                              onClick={() => onPick(group, item, sched)}
                              className={cn(
                                'inline-flex items-center gap-2 rounded-9e-md border px-3 py-2 text-sm transition-colors',
                                isSelected
                                  ? 'border-9e-action bg-9e-action text-white shadow-sm'
                                  : isEnabled
                                    ? 'border-[var(--surface-border)] bg-white text-9e-navy hover:border-9e-action/50 hover:bg-9e-ice dark:bg-[#0D1B2A] dark:text-white'
                                    : 'cursor-not-allowed border-[var(--surface-border)] bg-gray-50 text-gray-400 dark:bg-[#0D1B2A]/40'
                              )}
                            >
                              <span>{formatThaiRange(sched.dates)}</span>
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                  isSelected
                                    ? 'border-white/40 bg-white/10 text-white'
                                    : badge
                                )}
                              >
                                {TYPE_LABEL[t] ?? sched.type ?? '—'}
                              </span>
                              {sched.status === 'nearly_full' && (
                                <span
                                  className={cn(
                                    'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                    isSelected
                                      ? 'border-white/40 bg-white/10 text-white'
                                      : 'border-orange-200 bg-orange-50 text-orange-700'
                                  )}
                                >
                                  ใกล้เต็ม
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Hybrid sub-selection — shown only when the
                        currently selected round for this course is a
                        hybrid round. Unresolved (no Classroom/MS Teams
                        chosen) means the pick is incomplete and the
                        group stays unsatisfied. */}
                    {(() => {
                      const sel = selected[code];
                      if (!sel) return null;
                      const selSched = schedules.find((x) => x._id === sel.scheduleId);
                      const isHybrid = String(selSched?.type ?? '').toLowerCase() === 'hybrid';
                      if (!isHybrid) return null;
                      const chosen = hybridChoice?.[sel.scheduleId] ?? null;
                      return (
                        <div className="mt-2 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950">
                          <p className="mb-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                            เลือกรูปแบบการอบรม <span className="text-red-500">*</span>
                          </p>
                          <div className="flex flex-col gap-1">
                            {['Classroom', 'MS Teams'].map((opt) => (
                              <label
                                key={opt}
                                className="flex cursor-pointer items-center gap-2 text-sm text-9e-navy dark:text-white"
                              >
                                <input
                                  type="radio"
                                  name={`hybrid-${sel.scheduleId}`}
                                  value={opt}
                                  checked={chosen === opt}
                                  onChange={() => onHybridChoice(code, sel.scheduleId, opt)}
                                  className="accent-purple-600"
                                />
                                {opt}
                              </label>
                            ))}
                          </div>
                          {!chosen && (
                            <p className="mt-2 text-[11px] text-purple-700 dark:text-purple-300">
                              ต้องเลือกรูปแบบการอบรมก่อนจึงจะดำเนินการต่อได้
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {!eligible && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-white/85 backdrop-blur-sm dark:bg-[#111d2c]/85">
                <p className="flex items-center gap-2 text-sm font-medium text-9e-slate-dp-50">
                  <Lock className="h-4 w-4" /> กรุณาเลือกรอบอบรมของกลุ่มก่อนหน้าให้ครบก่อน
                </p>
              </div>
            )}
          </section>
        );
      })}

      <div className="flex justify-end pt-4">
        <button
          type="button"
          disabled={!canProceed}
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          ถัดไป <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Personal info form ──────────────────────────────────

function Step2Form({ defaultValues, selected, curriculum, onBack, onSubmit }) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(baseSchema),
    mode: 'onChange',
    defaultValues: defaultValues ?? {
      contactFirstName: '',
      contactLastName:  '',
      contactEmail:     '',
      contactPhone:     '',
      isCoordinator:    false,
      attendeeCount:    1,
      skipAttendee:     false,
      attendees:        [],
      invoice:          EMPTY_INVOICE,
      note:             '',
    },
  });

  const attendeeCount  = Number(watch('attendeeCount')) || 1;
  const isCoordinator  = watch('isCoordinator');
  const skipAttendee   = watch('skipAttendee');

  const attendeeRows = Math.max(
    0,
    isCoordinator ? attendeeCount - 1 : attendeeCount
  );

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <SelectedCoursesSummary selected={selected} curriculum={curriculum} />
      <Section title="ข้อมูลผู้ประสานงาน">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="ชื่อ" required error={errors.contactFirstName?.message}>
            <input type="text" {...register('contactFirstName')} className={inputClass} />
          </Field>
          <Field label="นามสกุล" required error={errors.contactLastName?.message}>
            <input type="text" {...register('contactLastName')} className={inputClass} />
          </Field>
          <Field label="Email" required error={errors.contactEmail?.message}>
            <input type="email" {...register('contactEmail')} className={inputClass} />
          </Field>
          <Field label="เบอร์ติดต่อ" required error={errors.contactPhone?.message}>
            <input type="tel" {...register('contactPhone')} className={inputClass} placeholder="0xxxxxxxxx" />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-9e-navy dark:text-white">
          <input type="checkbox" {...register('isCoordinator')} />
          ผู้ประสานงานเป็นผู้เข้าอบรม
        </label>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="จำนวนผู้สมัคร" required>
            <input
              type="number"
              min={1}
              {...register('attendeeCount', { valueAsNumber: true })}
              className={inputClass}
            />
          </Field>
          <label className="mt-7 flex items-center gap-2 text-sm text-9e-navy dark:text-white">
            <input type="checkbox" {...register('skipAttendee')} />
            ยังไม่ประสงค์แจ้งรายชื่อ (ทีมขายจะติดต่อกลับภายหลัง)
          </label>
        </div>
      </Section>

      {!skipAttendee && attendeeRows > 0 && (
        <Section title={`ข้อมูลผู้เข้าอบรม (${attendeeRows} ท่าน)`}>
          <div className="space-y-3">
            {Array.from({ length: attendeeRows }).map((_, i) => (
              <div
                key={i}
                className="rounded-9e-md border border-[var(--surface-border)] bg-9e-ice/30 p-3 dark:bg-[#0D1B2A]/30"
              >
                <p className="mb-2 text-xs font-semibold text-9e-navy dark:text-white">
                  ท่านที่ {isCoordinator ? i + 2 : i + 1}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="ชื่อ" error={errors.attendees?.[i]?.firstName?.message}>
                    <input type="text" {...register(`attendees.${i}.firstName`)} className={inputClass} />
                  </Field>
                  <Field label="นามสกุล" error={errors.attendees?.[i]?.lastName?.message}>
                    <input type="text" {...register(`attendees.${i}.lastName`)} className={inputClass} />
                  </Field>
                  <Field label="Email">
                    <input type="email" {...register(`attendees.${i}.email`)} className={inputClass} />
                  </Field>
                  <Field label="เบอร์ติดต่อ">
                    <input type="tel" {...register(`attendees.${i}.phone`)} className={inputClass} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <InvoiceFields
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
      />

      <Section title="หมายเหตุเพิ่มเติม">
        <textarea
          rows={3}
          {...register('note')}
          className={inputClass}
          placeholder="ระบุข้อมูลเพิ่มเติม (ถ้ามี)"
        />
      </Section>

      {Object.keys(errors).length > 0 && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          กรุณาตรวจสอบข้อมูลให้ครบถ้วน
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A]"
        >
          <ArrowLeft className="h-4 w-4" /> แก้ไขคอร์ส
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-1 rounded-9e-md bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          ถัดไป <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

// ── Step 3: Preview + submit ────────────────────────────────────

function Step3Preview({
  curriculum, selected, data, onBack, onConfirm, submitting, error,
}) {
  // Walk curriculum in order so preview matches the form order.
  const selectedList = [];
  for (const g of curriculum) {
    for (const item of groupItems(g)) {
      const sel = selected[itemCode(item)];
      if (sel) selectedList.push(sel);
    }
  }

  return (
    <div className="space-y-6">
      <Section title="คอร์สที่เลือก">
        <ul className="divide-y divide-[var(--surface-border)]">
          {selectedList.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-semibold text-9e-navy dark:text-white">
                  {s.courseName}{' '}
                  <span className="ml-1 font-mono text-[11px] text-9e-action">
                    {s.courseCode}
                  </span>
                </div>
                <div className="text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
                  {s.round}
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  badgeForType(s.type)
                )}
              >
                {displayType(s.type)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="ข้อมูลผู้ประสานงาน">
        <ReadRow label="ชื่อ-นามสกุล" value={`${data.contactFirstName} ${data.contactLastName}`.trim()} />
        <ReadRow label="Email"        value={data.contactEmail} />
        <ReadRow label="เบอร์ติดต่อ"  value={data.contactPhone} />
        <ReadRow label="เป็นผู้เข้าอบรม" value={data.isCoordinator ? 'ใช่' : 'ไม่ใช่'} />
        <ReadRow label="จำนวนผู้สมัคร" value={`${data.attendeeCount} ท่าน`} />
      </Section>

      <Section title="ข้อมูลผู้เข้าอบรม">
        {data.skipAttendee ? (
          <p className="text-sm text-9e-slate-dp-50">ยังไม่ประสงค์แจ้งรายชื่อ — ทีมขายจะติดต่อกลับ</p>
        ) : (
          <ol className="space-y-2">
            {data.isCoordinator && (
              <li className="rounded-9e-md bg-9e-ice/40 p-3 text-sm dark:bg-[#0D1B2A]/40">
                <div className="font-semibold">ท่านที่ 1 · {data.contactFirstName} {data.contactLastName}</div>
                <div className="text-xs text-9e-slate-dp-50">{data.contactEmail} · {data.contactPhone}</div>
              </li>
            )}
            {(data.attendees ?? []).map((a, i) => (
              <li key={i} className="rounded-9e-md border border-[var(--surface-border)] p-3 text-sm">
                <div className="font-semibold">
                  ท่านที่ {data.isCoordinator ? i + 2 : i + 1} · {a.firstName} {a.lastName}
                </div>
                <div className="text-xs text-9e-slate-dp-50">
                  {[a.email, a.phone].filter(Boolean).join(' · ') || '—'}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <InvoicePreview invoice={data.invoice ?? {}} />

      {data.note && (
        <Section title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-sm">{data.note}</p>
        </Section>
      )}

      {error && (
        <div className="rounded-9e-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1 rounded-9e-md border border-[var(--surface-border)] px-4 py-2 text-sm text-9e-navy hover:bg-9e-ice dark:text-white dark:hover:bg-[#0D1B2A] disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" /> แก้ไขข้อมูล
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-9e-md bg-9e-action px-5 py-2 text-sm font-bold text-white hover:bg-9e-brand disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง…
            </>
          ) : (
            'ยืนยันการลงทะเบียน'
          )}
        </button>
      </div>
    </div>
  );
}

// ── Complete panel ──────────────────────────────────────────────

function CompletePanel({ id, email }) {
  return (
    <div className="mt-6 rounded-2xl border border-[var(--surface-border)] bg-white p-10 text-center shadow-sm dark:bg-[#111d2c]">
      <CheckCircle2 className="mx-auto h-16 w-16 text-9e-action" strokeWidth={1.5} />
      <h2 className="mt-6 text-2xl font-bold text-9e-navy dark:text-white">
        ขอบคุณสำหรับการลงทะเบียน
      </h2>
      <p className="mt-3 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
        เลขอ้างอิงการสมัคร:{' '}
        <span className="font-mono text-base font-bold text-9e-action">{id}</span>
      </p>
      {email && (
        <p className="mt-3 text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
          เราได้รับข้อมูลของคุณแล้ว ทีมขายจะติดต่อกลับที่{' '}
          <span className="font-semibold text-9e-navy dark:text-white">{email}</span>{' '}
          ภายใน 1–2 วันทำการ
        </p>
      )}
      <div className="mt-8">
        <Link
          href="/career-path-project"
          className="inline-flex items-center gap-1 rounded-9e-md border border-9e-action px-4 py-2 text-sm font-bold text-9e-action hover:bg-9e-action hover:text-white"
        >
          ดู Career Path อื่น
        </Link>
      </div>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-[var(--surface-border)] bg-white p-5 shadow-sm dark:bg-[#111d2c]">
      <h2 className="mb-3 text-base font-bold text-9e-navy dark:text-white">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, required, hint, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-9e-navy dark:text-white">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-9e-slate-dp-50 dark:text-[#94a3b8]">
          {hint}
        </span>
      )}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
    </label>
  );
}

function ReadRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 py-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-9e-slate-dp-50 sm:w-40 sm:flex-none">
        {label}
      </div>
      <div className="text-sm text-9e-navy dark:text-white">{value || '—'}</div>
    </div>
  );
}

/**
 * Collapsible recap of the Step-1 picks shown at the top of Step 2.
 * Default state is expanded — opens on first render of Step 2 — but
 * the user can collapse it to free up scroll real estate while filling
 * in the form.
 */
function SelectedCoursesSummary({ selected, curriculum }) {
  const [open, setOpen] = useState(true);
  // Walk curriculum so the rows display in the same order as Step 1.
  const rows = [];
  for (const g of Array.isArray(curriculum) ? curriculum : []) {
    for (const item of Array.isArray(g?.items) ? g.items : []) {
      const code = String(item?.snap?.code ?? item?.course_id ?? '');
      const sel = selected?.[code];
      if (sel) rows.push(sel);
    }
  }
  if (rows.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white shadow-sm dark:bg-[#111d2c]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="text-base font-bold text-9e-navy dark:text-white">
          หลักสูตรที่เลือก ({rows.length})
        </span>
        {open
          ? <ChevronUp   className="h-4 w-4 text-9e-slate-dp-50" />
          : <ChevronDown className="h-4 w-4 text-9e-slate-dp-50" />}
      </button>

      {open && (
        <div className="border-t border-[var(--surface-border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-9e-ice/40 text-left text-xs text-9e-slate-dp-50 dark:bg-[#0D1B2A]/40">
                <th className="px-4 py-2 font-semibold">Course</th>
                <th className="px-4 py-2 font-semibold">รอบอบรม</th>
                <th className="px-4 py-2 font-semibold">รูปแบบการอบรม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={`${s.scheduleId}-${i}`} className="border-t border-[var(--surface-border)]">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-9e-navy dark:text-white">
                      {s.courseName}
                    </div>
                    {s.courseCode && (
                      <div className="font-mono text-[11px] text-9e-action">
                        {s.courseCode}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-9e-navy dark:text-white">{s.round || '—'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        badgeForType(s.type)
                      )}
                    >
                      {displayType(s.type)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Read-only preview block for the invoice section in Step 3.
 * Reads from the nested `invoice` shape produced by InvoiceFields and
 * renders TH-vs-international addresses inline.
 */
function InvoicePreview({ invoice }) {
  const isThai = invoice.country !== 'OTHER';
  const isCorp = invoice.type === 'corporate';
  const intl = invoice.internationalAddress ?? {};
  const thai = invoice.thaiAddress ?? {};

  const addrParts = isThai
    ? [thai.addressLine, thai.subDistrict, thai.district, thai.province, thai.postalCode]
    : [intl.line1, intl.line2, intl.city, intl.state, intl.postalCode, intl.country];

  return (
    <Section title="ใบกำกับภาษี / ใบเสนอราคา">
      <ReadRow
        label="ประเภท"
        value={isCorp ? 'นิติบุคคล / บริษัท' : 'บุคคลธรรมดา'}
      />
      <ReadRow label="ประเทศ" value={isThai ? 'Thailand' : 'Other country'} />
      {isCorp ? (
        <>
          <ReadRow label="ชื่อบริษัท" value={invoice.companyName} />
          {invoice.branch && <ReadRow label="สาขา" value={invoice.branch} />}
          {invoice.taxId  && <ReadRow label="เลขผู้เสียภาษี" value={invoice.taxId} />}
        </>
      ) : (
        <>
          <ReadRow
            label="ชื่อ-นามสกุล"
            value={`${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim()}
          />
          {invoice.taxId && (
            <ReadRow label="เลขประจำตัวประชาชน" value={invoice.taxId} />
          )}
        </>
      )}
      <ReadRow
        label="ที่อยู่"
        value={addrParts.filter(Boolean).join(isThai ? ' ' : ', ')}
      />
    </Section>
  );
}
