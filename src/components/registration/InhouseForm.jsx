'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FileText, Calendar, Phone, Building2, StickyNote,
  CheckCircle2, ArrowRight, Loader2, Monitor,
  Plus, Minus,
} from 'lucide-react';
import { SuccessPulseIcon } from "@/components/ui/SuccessPulseIcon";
import { inhouseRegistrationSchema, inhouseRegistrationDefaults } from '@/lib/schemas/register-inhouse';
import { resolveInitialCourseId, buildInhouseInitialValues } from '@/lib/registration/resolveInitialCourse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ThaiAddressFields } from '@/components/registration/ThaiAddressFields';
import { BranchFields, TaxIdField } from '@/components/registration/BranchFields';
import { formatBranchLabel } from '@/lib/registration/branchLabel';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import { formatThaiAddress } from '@/lib/address/formatThaiAddress';
import { cn } from '@/lib/utils';
import { phoneInputProps } from '@/lib/registration/phoneInputProps';

// ── Storage keys (mirror the Public wizard pattern) ────────────────
const STORAGE_KEY  = 'registration-inhouse-v1';
const FORMDATA_KEY = 'registration-inhouse-formdata-v1';
const RESULT_KEY   = 'registration-inhouse-result-v1';
// The resolved course id the current draft was started from — lets a fresh
// ?course= override a stale draft without clobbering an in-session change.
const SOURCE_COURSE_KEY = 'registration-inhouse-source-course-v1';

// ── Constants ──────────────────────────────────────────────────────

// Both selectors KEEP their section and lose exactly one card: the
// "ยังไม่แน่ใจ / ให้ช่วยแนะนำ" escape hatch, on both. An enquiry that declines
// to say what it wants costs the sales team a phone call before they can quote,
// and the customer is better served by picking the closest option and using the
// free-text note than by a card that means "ask me later".
const CONTENT_MODES = [
  { value: 'standard', label: 'ใช้ Outline มาตรฐาน',  desc: 'อบรมตามหลักสูตรของ 9Expert',      icon: FileText },
  { value: 'custom',   label: 'ปรับเนื้อหาบางส่วน',   desc: 'มีค่าบริการเพิ่มเติมสำหรับการ Customize หลักสูตร',  icon: StickyNote },
];

const TRAINING_FORMATS = [
  { value: 'onsite',   label: 'Onsite',       desc: 'ลูกค้าเป็นผู้จัดเตรียมสถานที่ด้วยตนเอง',      icon: Building2 },
  { value: 'online',   label: 'Online',       desc: 'อบรมสดผ่าน Microsoft Teams',             icon: Monitor },
];

const EMPTY_THAI_ADDRESS = { addressLine: '', subDistrict: '', district: '', province: '', postalCode: '' };

/**
 * In-house training is sold in rounds of 15, so 15 is a FLOOR and not a
 * suggestion. The same number is declared in three other places and all four
 * have to agree or the form looks fixed while something still writes 3:
 *   · src/lib/schemas/register-inhouse.js — the zod rule AND the default
 *   · src/models/RegisterInhouse.js       — the Mongoose min
 * A seam guard (test/fs/inhouseParticipantFloor.test.mjs) reads the number out
 * of all four files and asserts they are the same integer.
 */
const MIN_PARTICIPANTS = 15;
const MAX_PARTICIPANTS = 999;

/** Keep the stepper inside [MIN, MAX] from EITHER direction — see the note below. */
const clampParticipants = (n) => Math.min(MAX_PARTICIPANTS, Math.max(MIN_PARTICIPANTS, n));

const THAI_MONTHS = Array.from({ length: 12 }, (_, i) => {
  const now = new Date();
  const d   = new Date(now.getFullYear(), now.getMonth() + i, 1);
  return {
    value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    label: d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }),
  };
});

const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? value;

// ── Wizard (top-level orchestration) ───────────────────────────────

export function InhouseWizard({
  courses = [],
  preselectedCourse = null,
  step = 1,
  basePath = '/registration/in-house',
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentStep, setCurrentStep] = useState(step);
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Build a step URL that preserves the ?course= query param so the path
  // stays shareable and survives a refresh.
  const stepHref = (n) => {
    const params = new URLSearchParams(searchParams.toString());
    const q = params.toString();
    return `${basePath}/step-${n}${q ? `?${q}` : ''}`;
  };

  // Keep the rendered step in sync with the URL-derived prop.
  useEffect(() => {
    setCurrentStep(step);
  }, [step]);

  // On mount, rehydrate from sessionStorage. Because each step is its own
  // route, navigating between steps remounts this component and clears
  // in-memory state — the draft, the confirmed payload, and the success
  // result all live in storage.
  useEffect(() => {
    // Restore live draft (field-by-field typing)
    let draft = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.formType === 'inhouse') {
          draft = parsed;
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setRestoredFromStorage(draft);

    // Restore confirmed formData (written when user clicks ถัดไป). This makes
    // "แก้ไข" (back from step 2) restore ALL fields exactly as entered.
    try {
      const raw2 = sessionStorage.getItem(FORMDATA_KEY);
      if (raw2) {
        const parsed2 = JSON.parse(raw2);
        if (parsed2?.formType === 'inhouse') {
          setFormData(parsed2);
        } else {
          sessionStorage.removeItem(FORMDATA_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }

    if (step === 3) {
      // Thank-you screen needs the API result + the email it was sent to.
      try {
        const rawRes = sessionStorage.getItem(RESULT_KEY);
        if (rawRes) {
          const saved = JSON.parse(rawRes);
          if (saved?.result) {
            setResult(saved.result);
            if (saved.formData) setFormData(saved.formData);
          }
        }
      } catch {
        // ignore corrupted storage
      }
    } else if (step === 1) {
      // Fresh start on step 1 — drop any stale success result.
      try { sessionStorage.removeItem(RESULT_KEY); } catch {}
    }

    setHydrated(true);
  }, [step]);

  // If the user refreshes or deep-links a later step without the data that
  // step needs, silently send them back to step 1 — keeping query params.
  useEffect(() => {
    if (!hydrated) return;
    if (currentStep === 2 && !formData) {
      router.replace(stepHref(1));
    } else if (currentStep === 3 && !result) {
      router.replace(stepHref(1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, currentStep, formData, result]);

  const handleFormSubmit = (data) => {
    // Tag the payload so storage restores only apply to the In-house flow.
    const withType = { ...data, formType: 'inhouse' };
    setFormData(withType);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(withType)); } catch {}
    try { sessionStorage.setItem(FORMDATA_KEY, JSON.stringify(withType)); } catch {}
    setCurrentStep(2);
    router.push(stepHref(2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setSubmitError(null);
    setCurrentStep(1);
    router.push(stepHref(1));
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/registration/inhouse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(body?.message || 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่');
        setSubmitting(false);
        return;
      }
      // Draft + confirmed payload are consumed; persist the result so the
      // step-3 route can render it.
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { sessionStorage.removeItem(FORMDATA_KEY); } catch {}
      try { sessionStorage.removeItem(SOURCE_COURSE_KEY); } catch {}
      try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify({ result: body, formData }));
      } catch {}
      setResult(body);
      setCurrentStep(3);
      router.push(stepHref(3));
      // Keep the loading overlay up through the navigation — the fresh
      // step-3 mount resets `submitting`, so we don't clear it here.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
      setSubmitting(false);
    }
  };

  return (
    <div>
      <InhouseStepper currentStep={currentStep} />

      {currentStep === 1 && hydrated && (
        <InhouseStepForm
          courses={courses}
          preselectedCourse={preselectedCourse}
          initialValues={formData ?? restoredFromStorage}
          onSubmit={handleFormSubmit}
        />
      )}

      {currentStep === 2 && formData && (
        <InhouseStepPreview
          data={formData}
          courses={courses}
          onBack={handleBack}
          onConfirm={() => setShowConfirm(true)}
          submitting={submitting}
          error={submitError}
          showConfirm={showConfirm}
          onConfirmCancel={() => setShowConfirm(false)}
          onConfirmProceed={() => {
            setShowConfirm(false);
            handleConfirm();
          }}
        />
      )}

      {currentStep === 3 && result && (
        <InhouseStepComplete
          referenceNumber={result.referenceNumber}
          email={formData?.contactEmail}
        />
      )}
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────

function InhouseStepper({ currentStep }) {
  const steps = [
    { n: 1, label: 'กรอกข้อมูล' },
    { n: 2, label: 'ตรวจสอบ' },
    { n: 3, label: 'สำเร็จ' },
  ];
  return (
    <ol className="mb-8 flex items-center justify-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
              currentStep === s.n
                ? 'border-9e-brand bg-9e-brand text-9e-ice'
                : currentStep > s.n
                  ? 'border-9e-brand bg-9e-brand/10 text-9e-action'
                  : 'border-[var(--surface-border)] text-[var(--text-muted)]'
            )}
          >
            {currentStep > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
          </span>
          <span
            className={cn(
              'font-medium',
              currentStep >= s.n
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]'
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

// ── Step 1: Form ───────────────────────────────────────────────────

// EXPORTED for the render tier only — InhouseWizard gates step 1 behind a
// `hydrated` flag set in an effect, and renderToStaticMarkup never runs
// effects, so the wizard renders nothing at all. Same reason RegisterWizard
// exports StepForm.
export function InhouseStepForm({ courses = [], preselectedCourse = null, initialValues, onSubmit }) {
  // Group courses by program for optgroup
  const coursesByProgram = courses.reduce((acc, c) => {
    const prog = c.program || 'อื่นๆ';
    if (!acc[prog]) acc[prog] = [];
    acc[prog].push(c);
    return acc;
  }, {});

  // Resolve the initial course id. An explicit, resolvable ?course= wins over a
  // STALE draft (a leftover from a different course) but must not clobber an
  // in-progress choice while moving between wizard steps for the SAME course.
  // The "source course" marker distinguishes the two — see resolveInitialCourseId.
  const restoredCourseId = initialValues?.coursesInterested?.[0] ?? '';
  const preselectedId = preselectedCourse
    ? (courses.find((c) => c.id.toUpperCase() === preselectedCourse.toUpperCase())?.id ?? null)
    : null;

  const [initialCourseId] = useState(() => {
    let sourceCourse = null;
    try { sourceCourse = sessionStorage.getItem(SOURCE_COURSE_KEY); } catch {}
    return resolveInitialCourseId({ preselectedId, restoredCourseId, sourceCourse });
  });

  // Mark this draft as belonging to the URL's course, so a later remount (moving
  // between steps) recognises the session and won't re-override the user's
  // selection. Writes only on a genuine change (a fresh arrival at a new course).
  useEffect(() => {
    if (!preselectedId) return;
    try {
      if (sessionStorage.getItem(SOURCE_COURSE_KEY) !== preselectedId) {
        sessionStorage.setItem(SOURCE_COURSE_KEY, preselectedId);
      }
    } catch {
      // storage disabled — the fallback (draft wins) is still safe
    }
  }, [preselectedId]);

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(inhouseRegistrationSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: buildInhouseInitialValues({
      defaults: inhouseRegistrationDefaults,
      restored: initialValues,
      initialCourseId,
    }),
  });

  const watched = watch();

  // Persist draft to sessionStorage on every change.
  // Guard: skip the very first render (when watched still equals defaultValues)
  // so we don't overwrite a restored draft with an empty skeleton.
  const isFirstDraftWrite = useRef(true);
  useEffect(() => {
    if (isFirstDraftWrite.current) {
      isFirstDraftWrite.current = false;
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...watched, formType: 'inhouse' }));
    } catch {
      // storage full / disabled — ignore
    }
  }, [watched]);

  const selectedCourseId   = watch('coursesInterested')?.[0] ?? '';
  const contentMode        = watch('contentMode');
  const trainingFormat     = watch('trainingFormat');
  const quotationCountry   = watch('quotationCountry');
  const participantsCount  = watch('participantsCount') ?? 15;
  const isTH               = quotationCountry === 'TH';
  const isOnsite           = trainingFormat === 'onsite';
  const isOnline           = trainingFormat === 'online';

  const handleCountryChange = (val) => {
    setValue('quotationCountry', val);
    setValue('thaiAddress',          val === 'TH'    ? { ...EMPTY_THAI_ADDRESS } : null);
    setValue('internationalAddress', val === 'OTHER' ? { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' } : null);
  };

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit(onSubmit, () => {
        // Scroll to the first invalid field so the user can see what to fix.
        setTimeout(() => {
          const first = document.querySelector('[aria-invalid="true"], [data-error="true"]');
          if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus?.(); }
        }, 50);
      })}
      noValidate
    >
      {/* ── Section 1: Course & Requirement ── */}
      <FormSection icon={<FileText className="h-5 w-5" />} title="หลักสูตร & Training Requirement">

        {/* Course dropdown */}
        <FieldGroup label="หลักสูตรที่สนใจ" required error={errors.coursesInterested?.message}>
          <select
            value={selectedCourseId}
            onChange={(e) => setValue('coursesInterested', e.target.value ? [e.target.value] : [], { shouldValidate: true })}
            className={cn(selectCls(), errors.coursesInterested ? 'border-red-500' : '')}
            aria-invalid={!!errors.coursesInterested}
          >
            <option value="">— เลือกหลักสูตร —</option>
            {Object.entries(coursesByProgram)
              .sort(([a], [b]) => a.localeCompare(b, 'th'))
              .map(([program, list]) => (
                <optgroup key={program} label={program}>
                  {list
                    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </optgroup>
              ))}
          </select>
          <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
            หากต้องการหลักสูตร custom หรือหลายหลักสูตร กรุณาระบุในหมายเหตุด้านล่าง
          </p>
        </FieldGroup>

        {/* Participant count */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="mb-2 block">
              จำนวนผู้เข้าอบรม (โดยประมาณ) <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center overflow-hidden rounded-9e-md border border-[var(--surface-border)] w-fit">
              <button type="button"
                onClick={() => setValue('participantsCount', clampParticipants(participantsCount - 1))}
                /**
                 * DISABLED at the floor rather than left to no-op. A button that
                 * accepts the click and changes nothing reads as a broken
                 * control, and the user's next move is to click it harder rather
                 * than to notice that 15 is the minimum.
                 */
                disabled={participantsCount <= MIN_PARTICIPANTS}
                aria-label="ลดจำนวนผู้เข้าอบรม"
                className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex h-10 min-w-[52px] items-center justify-center border-x border-[var(--surface-border)] px-3 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                {participantsCount}
              </div>
              <button type="button"
                /**
                 * clamp, not `Math.min(MAX, n + 1)`. A sessionStorage draft
                 * written before the floor existed can hold 3: the display stays
                 * honest (it really is 3, and the schema will say so), minus is
                 * dead, and ONE press of plus lands on 15 instead of walking
                 * 3→4→5 through values the schema rejects.
                 */
                onClick={() => setValue('participantsCount', clampParticipants(participantsCount + 1))}
                aria-label="เพิ่มจำนวนผู้เข้าอบรม"
                className="flex h-10 w-10 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* REWORDED: "เริ่มต้น 15" reads as a starting point — a default you
                may move away from. It is a minimum, so it says so. */}
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">In-house ขั้นต่ำ 15 ท่านต่อรุ่น</p>
          </div>
        </div>

        {/* Content mode */}
        <div>
          <Label className="mb-2 block">รูปแบบเนื้อหาที่ต้องการ</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTENT_MODES.map(({ value, label, desc, icon: Icon }) => {
              const active = contentMode === value;
              return (
                <button key={value} type="button" onClick={() => setValue('contentMode', value)}
                  className={cn('flex flex-col gap-2 rounded-9e-lg border p-4 text-left transition-all',
                    active ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/20' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-9e-md',
                    active ? 'bg-9e-brand text-9e-ice' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {contentMode !== 'standard' && (
          <FieldGroup label="รายละเอียดเนื้อหาที่ต้องการเพิ่มเติม" error={errors.contentDetails?.message}>
            <Textarea {...register('contentDetails')} rows={3}
              placeholder="ระบุรายละเอียดที่ต้องการปรับ เช่น เพิ่ม/ลดหัวข้อ ปรับลำดับเนื้อหา เพิ่ม Workshop หรือเน้นเนื้อหาสำหรับแผนกของท่าน" />
          </FieldGroup>
        )}
      </FormSection>

      {/* ── Section 2: Schedule & Format ── */}
      <FormSection icon={<Calendar className="h-5 w-5" />} title="ช่วงเดือนที่อบรม & รูปแบบการอบรม">

        {/* Schedule — always visible, no mode selector and no branching. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="เดือนที่สนใจ" required error={errors.preferredMonth?.message}>
            <select {...register('preferredMonth')} className={selectCls()} aria-invalid={!!errors.preferredMonth}>
              <option value="">— เลือกเดือน —</option>
              {THAI_MONTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldGroup>
          <FieldGroup label="หมายเหตุเรื่องวันอบรม" error={errors.scheduleNote?.message}>
            <Input {...register('scheduleNote')} placeholder="เช่น อบรมวันเสาร์อาทิตย์" />
          </FieldGroup>
        </div>

        {/* Training format — NOTHING is preselected, so both the venue block
            and the online block below stay hidden until the customer chooses. */}
        <div>
          <Label className="mb-2 block">
            รูปแบบการอบรม<span className="ml-0.5 text-red-500">*</span>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {TRAINING_FORMATS.map(({ value, label, desc, icon: Icon }) => {
              const active = trainingFormat === value;
              return (
                <button key={value} type="button" onClick={() => setValue('trainingFormat', value)}
                  className={cn('flex flex-col gap-2 rounded-9e-lg border p-4 text-left transition-all',
                    active ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/20' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]')}>
                  <span className={cn('flex h-8 w-8 items-center justify-center rounded-9e-md',
                    active ? 'bg-9e-brand text-9e-ice' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold text-[var(--text-primary)]">{label}</span>
                    <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {errors.trainingFormat && (
            <p className="mt-1.5 text-xs text-red-500">{errors.trainingFormat.message}</p>
          )}
        </div>

        {isOnsite && (
          <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 space-y-5">
            <p className="text-base font-semibold text-[var(--text-primary)]">รายละเอียดสถานที่จัดอบรม</p>
            {/* The same postal-code-first autocomplete as the quotation block.
                Written to `onsiteVenue`, NOT to the legacy `onsiteAddress`
                string path — see the schema for why reusing it would be a cast
                failure on every historical document. */}
            <ThaiAddressFields
              value={watch('onsiteVenue') ?? { ...EMPTY_THAI_ADDRESS }}
              onChange={(next) => setValue('onsiteVenue', next, { shouldValidate: true })}
              errors={errors}
              prefix="onsiteVenue"
            />
          </div>
        )}

        {isOnline && (
          <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldGroup label="ผู้เข้าอบรมอยู่พื้นที่ใดเป็นหลัก" error={errors.onlineRegion?.message}>
                <Input {...register('onlineRegion')} placeholder="เช่น กรุงเทพฯ, ต่างจังหวัด, ต่างประเทศ" />
              </FieldGroup>
              <FieldGroup label="ข้อจำกัดด้านเวลา / Time zone" error={errors.onlineTimezone?.message}>
                <Input {...register('onlineTimezone')} placeholder="เช่น สะดวก 09:00-16:00 เวลาไทย" />
              </FieldGroup>
            </div>
          </div>
        )}
      </FormSection>

      {/* ── Section 3: Contact Person ── */}
      <FormSection icon={<Phone className="h-5 w-5" />} title="ผู้ประสานงาน">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="ชื่อ" required error={errors.contactFirstName?.message}>
            <Input {...register('contactFirstName')} placeholder="กรุณากรอกชื่อ" aria-invalid={!!errors.contactFirstName} />
          </FieldGroup>
          <FieldGroup label="นามสกุล" required error={errors.contactLastName?.message}>
            <Input {...register('contactLastName')} placeholder="กรุณากรอกนามสกุล" aria-invalid={!!errors.contactLastName} />
          </FieldGroup>
          <FieldGroup label="ตำแหน่ง" error={errors.contactRole?.message}>
            <Input {...register('contactRole')} placeholder="เช่น HR Manager" />
          </FieldGroup>
          <FieldGroup label="แผนก" error={errors.contactDepartment?.message}>
            <Input {...register('contactDepartment')} placeholder="เช่น Human Resources" />
          </FieldGroup>
          <FieldGroup label="อีเมล" required error={errors.contactEmail?.message}>
            <Input type="email" {...register('contactEmail')} placeholder="name@company.com" aria-invalid={!!errors.contactEmail} />
          </FieldGroup>
          <FieldGroup label="เบอร์โทรศัพท์" required error={errors.contactPhone?.message}>
            <Input type="tel" {...phoneInputProps(register('contactPhone'))} placeholder="เช่น 0812345678 หรือ 02-219-4304 ต่อ 1234" aria-invalid={!!errors.contactPhone} />
          </FieldGroup>
        </div>
      </FormSection>

      {/* ── Section 4: Quotation (Corporate only) ── */}
      <FormSection icon={<Building2 className="h-5 w-5" />} title="ข้อมูลสำหรับออกใบเสนอราคา">
        {/* <p className="text-xs text-[var(--text-muted)]">
          ข้อมูลนี้ใช้สำหรับออกใบเสนอราคา — ไม่บังคับ ทีมขายจะติดต่อขอเพิ่มเติมหากจำเป็น
        </p> */}

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup label="ประเทศ / Country" required>
            <select
              value={quotationCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={selectCls()}
            >
              <option value="TH">Thailand</option>
              <option value="OTHER">Other country</option>
            </select>
          </FieldGroup>
          <FieldGroup label={isTH ? 'ชื่อบริษัทสำหรับออกใบเสนอราคา' : 'Company name for quotation'} required error={errors.quotationCompany?.message}>
            <Input {...register('quotationCompany')} placeholder={isTH ? 'บริษัท ตัวอย่าง จำกัด' : 'Company Inc.'} aria-invalid={!!errors.quotationCompany} />
          </FieldGroup>
        </div>

        {isTH ? (
          /* Thailand — every field is required, and the two tax controls are
             the SAME components the public wizard uses (BranchFields.jsx) so
             the two flows cannot drift apart. */
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TaxIdField register={register} errors={errors} />
            </div>
            <BranchFields register={register} watch={watch} setValue={setValue} errors={errors} />
            <ThaiAddressFields
              value={watch('thaiAddress') ?? { ...EMPTY_THAI_ADDRESS }}
              onChange={(next) => setValue('thaiAddress', next, { shouldValidate: true })}
              errors={errors}
              prefix="thaiAddress"
            />
          </div>
        ) : (
          /* Other country — the public flow's corporate field set, and English
             only: a foreign quotation is typeset by someone who cannot read
             Thai, so Thai characters here reach the customer as boxes. No
             branch control: สำนักงานใหญ่ / สาขาที่ NNNNN are Thai Revenue
             Department concepts and mean nothing on a foreign invoice. */
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Tax ID / VAT ID (optional)" error={errors.taxId?.message} className="sm:col-span-2">
              <Input {...register('taxId')} placeholder="Optional for international" aria-invalid={!!errors.taxId} />
            </FieldGroup>
            <FieldGroup label="Address line 1" required error={errors.internationalAddress?.line1?.message} className="sm:col-span-2">
              <Input {...register('internationalAddress.line1')} placeholder="Street address" aria-invalid={!!errors.internationalAddress?.line1} />
            </FieldGroup>
            <FieldGroup label="Address line 2 (optional)" error={errors.internationalAddress?.line2?.message} className="sm:col-span-2">
              <Input {...register('internationalAddress.line2')} placeholder="Apartment, suite, building, floor, etc." />
            </FieldGroup>
            <FieldGroup label="City" required error={errors.internationalAddress?.city?.message}>
              <Input {...register('internationalAddress.city')} placeholder="City" aria-invalid={!!errors.internationalAddress?.city} />
            </FieldGroup>
            <FieldGroup label="State / Province / Region (optional)" error={errors.internationalAddress?.state?.message}>
              <Input {...register('internationalAddress.state')} placeholder="State or region" />
            </FieldGroup>
            <FieldGroup label="Postal code (optional)" error={errors.internationalAddress?.postalCode?.message}>
              <Input {...register('internationalAddress.postalCode')} placeholder="Postal code" />
            </FieldGroup>
            <FieldGroup label="Country" required error={errors.internationalAddress?.country?.message}>
              <Input {...register('internationalAddress.country')} placeholder="e.g. Singapore" aria-invalid={!!errors.internationalAddress?.country} />
            </FieldGroup>
          </div>
        )}
      </FormSection>

      {/* ── Section 5: Notes ── */}
      <FormSection icon={<StickyNote className="h-5 w-5" />} title="หมายเหตุเพิ่มเติม">
        <Textarea
          {...register('message')}
          rows={4}
          placeholder="ระบุข้อมูลเพิ่มเติม"
        />
      </FormSection>

      {/* Friendly error summary (Thai messages, no field paths) */}
      {Object.keys(errors).length > 0 && (() => {
        const msgs = [...collectMessages(errors)];
        return msgs.length > 0 ? (
          <div className="rounded-9e-md border border-red-300 bg-red-50 p-4 text-sm text-red-600 space-y-1">
            <p className="font-semibold">กรุณาตรวจสอบข้อมูลต่อไปนี้:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {msgs.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null;
      })()}

      <div className="flex items-center justify-between gap-4 pt-2">
        <Link
          href="/training-course"
          className="text-sm font-medium text-[var(--text-secondary)] hover:text-9e-action"
        >
          ← กลับไปดูหลักสูตร
        </Link>
        <Button type="submit" variant="cta">
          ถัดไป
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

// ── Step 2: Preview ────────────────────────────────────────────────

function InhouseStepPreview({
  data,
  courses = [],
  onBack,
  onConfirm,
  submitting,
  error,
  showConfirm,
  onConfirmCancel,
  onConfirmProceed,
}) {
  const courseName = (() => {
    const id = data.coursesInterested?.[0];
    if (!id) return '';
    return courses.find((c) => c.id === id)?.name ?? id;
  })();

  const contactName = `${data.contactFirstName ?? ''} ${data.contactLastName ?? ''}`.trim();

  // ONE address, not two. `thaiAddr` and `intlAddr` were separate consts picked
  // apart again at the row below by re-testing `quotationCountry` — which is
  // the branch formatBillingAddress already owns, so the review step was
  // duplicating both the branch AND the field lists.
  //
  // Adapted at the call site: in-house holds `quotationCountry` where an
  // invoice holds `country`, and the two address sub-objects are identical in
  // shape. See the same adapter in src/app/api/registration/inhouse/route.js —
  // this screen must show the customer exactly the string the mail will carry.
  const quotationAddr = formatBillingAddress({
    country: data.quotationCountry,
    thaiAddress: data.thaiAddress,
    internationalAddress: data.internationalAddress,
  });

  // The VENUE is a DIFFERENT address and goes through the prefix primitive
  // directly, never through "billing" — see the note on training_venue in
  // src/lib/email/models/inhouseRegistrationModel.js.
  const venueAddr = formatThaiAddress(data.onsiteVenue);

  const branchLabel = formatBranchLabel({
    branchType:   data.branchType,
    branchCode:   data.branchCode,
    legacyBranch: data.branch,
  });

  return (
    <>
      <div className="space-y-6">
        <Section title="หลักสูตร & Requirement">
          <ReadOnlyRow label="หลักสูตรที่สนใจ" value={courseName} />
          <ReadOnlyRow label="จำนวนผู้เข้าอบรม" value={data.participantsCount ? `${data.participantsCount} ท่าน` : ''} />
          <ReadOnlyRow label="รูปแบบเนื้อหา" value={labelOf(CONTENT_MODES, data.contentMode)} />
          {data.contentMode !== 'standard' && (
            <ReadOnlyRow label="รายละเอียดเนื้อหา" value={data.contentDetails} />
          )}
        </Section>

        <Section title="ช่วงเดือนที่อบรม & รูปแบบการอบรม">
          <ReadOnlyRow label="เดือนที่สนใจ" value={labelOf(THAI_MONTHS, data.preferredMonth)} />
          <ReadOnlyRow label="หมายเหตุเรื่องวัน" value={data.scheduleNote} />
          <ReadOnlyRow label="รูปแบบการอบรม" value={labelOf(TRAINING_FORMATS, data.trainingFormat)} />
          {data.trainingFormat === 'onsite' && (
            <ReadOnlyRow label="สถานที่จัดอบรม" value={venueAddr} />
          )}
          {data.trainingFormat === 'online' && (
            <>
              <ReadOnlyRow label="พื้นที่ผู้เข้าอบรม" value={data.onlineRegion} />
              <ReadOnlyRow label="ข้อจำกัดด้านเวลา" value={data.onlineTimezone} />
            </>
          )}
        </Section>

        <Section title="ผู้ประสานงาน">
          <ReadOnlyRow label="ชื่อ-นามสกุล" value={contactName} />
          <ReadOnlyRow label="ตำแหน่ง" value={data.contactRole} />
          <ReadOnlyRow label="แผนก" value={data.contactDepartment} />
          <ReadOnlyRow label="อีเมล" value={data.contactEmail} />
          <ReadOnlyRow label="เบอร์โทรศัพท์" value={data.contactPhone} />
        </Section>

        <Section title="ข้อมูลใบเสนอราคา">
          <ReadOnlyRow label="ประเทศ" value={data.quotationCountry === 'TH' ? 'Thailand' : 'Other country'} />
          <ReadOnlyRow label="ชื่อบริษัท (ใบเสนอราคา)" value={data.quotationCompany} />
          <ReadOnlyRow label="เลขผู้เสียภาษี" value={data.taxId} />
          {data.quotationCountry === 'TH' && (
            <ReadOnlyRow label="สาขา" value={branchLabel} />
          )}
          <ReadOnlyRow label="ที่อยู่" value={quotationAddr} />
        </Section>

        {data.message && (
          <Section title="หมายเหตุเพิ่มเติม">
            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{data.message}</p>
          </Section>
        )}

        {error && (
          <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
            แก้ไข
          </Button>
          <Button type="button" variant="cta" onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังส่ง...
              </>
            ) : (
              'ยืนยันการส่งคำขอ'
            )}
          </Button>
        </div>
      </div>

      {/* Phase A — confirm dialog before submitting */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-9e-lg">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              ยืนยันการส่งข้อมูล
            </h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              คุณต้องการส่งข้อมูลนี้ใช่หรือไม่?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button type="button" variant="outline" onClick={onConfirmCancel}>
                ยกเลิก
              </Button>
              <Button type="button" variant="cta" onClick={onConfirmProceed}>
                ยืนยัน
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase B — fullscreen loading overlay while submitting */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md dark:bg-[var(--surface)]/80">
          <Loader2 className="h-12 w-12 animate-spin text-9e-brand" />
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            กำลังส่งข้อมูล...
          </p>
        </div>
      )}
    </>
  );
}

// ── Step 3: Thank-you ──────────────────────────────────────────────

function InhouseStepComplete({ referenceNumber, email }) {
  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
      {/* <CheckCircle2 className="mx-auto h-16 w-16 text-9e-brand" strokeWidth={1.5} /> */}
      <SuccessPulseIcon className="mx-auto" />
      <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
        ส่งคำขอเรียบร้อยแล้ว
      </h2>
      {/* <p className="mt-3 text-sm text-[var(--text-secondary)]">
        เลขอ้างอิง:{' '}
        <span className="font-mono text-base font-bold text-9e-action">
          {referenceNumber}
        </span>
      </p> */}
      {email && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          ทาง 9Expert ได้ส่งอีเมลยืนยันไปที่{' '}
          <span className="font-semibold text-[var(--text-primary)]">{email}</span>{' '}
          เรียบร้อย
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        ทั้งนี้ ทางบริษัทจะดำเนินการจัดส่งใบเสนอราคาเป็นเอกสาร PDF ให้ท่านทางอีเมลภายใน 3 วันทำการ <br />
หากไม่พบกรุณาตรวจสอบใน Junk Mail, Spam Mail อีกครั้ง
      </p>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>
        </Button>
      </div>
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

function FormSection({ icon, title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 space-y-5">
      <div className="flex items-center gap-3 border-b border-[var(--surface-border)] pb-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-9e-md bg-9e-brand/10 text-9e-action">
          {icon}
        </span>
        <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldGroup({ label, error, required, children, className }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function selectCls() {
  return cn(
    'h-10 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand',
    'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:ring-red-500'
  );
}

// ── Preview atoms (read-only summary) ──────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ReadOnlyRow({ label, value }) {
  // Skip empty values so the preview only shows what the user actually filled.
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-48 sm:flex-none">
        {label}
      </div>
      <div className="text-sm text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

/**
 * Walks the react-hook-form errors tree and collects only the user-facing
 * `.message` strings, deduplicated — so the summary box shows friendly Thai
 * messages instead of developer-facing field paths.
 */
function collectMessages(errors, messages = new Set()) {
  for (const val of Object.values(errors)) {
    if (!val) continue;
    if (typeof val.message === 'string' && val.message) {
      messages.add(val.message);
    } else if (typeof val === 'object') {
      collectMessages(val, messages);
    }
  }
  return messages;
}
