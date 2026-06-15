'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  Monitor,
  CreditCard,
  QrCode,
  Lock,
} from 'lucide-react';
import {
  publicRegistrationSchema,
  publicRegistrationDefaults,
} from '@/lib/schemas/register-public';
import { computePricing, formatTHB } from '@/lib/pricing';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';
import { CoordinatorFields } from '@/components/registration/CoordinatorFields';
import { AttendeesList } from '@/components/registration/AttendeesList';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'registration-public-v3';
const RESULT_KEY = 'registration-public-result-v3';
const FORMDATA_KEY = 'registration-public-formdata-v1';

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatClassDates(dates) {
  if (!dates?.length) return '';
  const sorted = [...dates].sort();
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  const year = start.getFullYear() + 543;
  if (sorted.length === 1) {
    return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${THAI_MONTHS[start.getMonth()]} ${year}`;
  }
  return `${start.getDate()} ${THAI_MONTHS[start.getMonth()]} - ${end.getDate()} ${THAI_MONTHS[end.getMonth()]} ${year}`;
}

export function RegisterWizard({
  course,
  schedules,
  initialClassId,
  earlyBirdScheduleId = null,
  step = 1,
  basePath = '/registration/public',
  omisePaymentEnabled = false,
  coursePrice = null,
  priceByScheduleId = {},
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

  // Build a step URL that preserves the course/class query params so the
  // path stays shareable and survives a refresh.
  const stepHref = useCallback(
    (n) => {
      const params = new URLSearchParams(searchParams.toString());
      const q = params.toString();
      return `${basePath}/step-${n}${q ? `?${q}` : ''}`;
    },
    [basePath, searchParams]
  );

  // Display-only pricing for the selected round. The server recomputes
  // authoritatively on charge — this is purely for the summary screen.
  const pricing = useMemo(() => {
    if (!formData) return null;
    const raw = priceByScheduleId[formData.classId] ?? coursePrice ?? null;
    const perSeat = raw == null ? null : Number(raw);
    if (perSeat == null || !Number.isFinite(perSeat) || perSeat <= 0) return null;
    try {
      return computePricing(perSeat, formData.attendeesCount ?? 1);
    } catch {
      return null;
    }
  }, [formData, priceByScheduleId, coursePrice]);

  // Keep the rendered step in sync with the URL-derived prop. Each step is
  // its own route, so this normally just confirms the value on mount.
  useEffect(() => {
    setCurrentStep(step);
  }, [step]);

  // On mount, rehydrate from sessionStorage. Because each step is its own
  // route, navigating between steps remounts this component and clears
  // in-memory state — the draft (and the success result) live in storage.
  useEffect(() => {
    // Clear any stale drafts from previous schema versions
    try { sessionStorage.removeItem('registration-public-v1'); } catch {}
    try { sessionStorage.removeItem('registration-public-v2'); } catch {}

    let draft = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.courseId === course.course_id) {
          draft = parsed;
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setRestoredFromStorage(draft);

    // Rehydrate the confirmed Step-1 payload. "แก้ไข" (back) and a refresh
    // both remount this component, wiping React state — restoring formData
    // from its own key is what keeps every field the user entered intact on
    // step 2 and on the way back to step 1.
    try {
      const rawForm = sessionStorage.getItem(FORMDATA_KEY);
      if (rawForm) {
        const parsed = JSON.parse(rawForm);
        if (parsed?.courseId === course.course_id) {
          setFormData(parsed);
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
      // Fresh start on step 1 — drop any stale success result. The unified
      // step-2 page is stateless across remounts on purpose (a refresh
      // returns a fresh page and never auto-creates a charge).
      try { sessionStorage.removeItem(RESULT_KEY); } catch {}
    }

    setHydrated(true);
  }, [course.course_id, step]);

  // If the user refreshes or deep-links a later step without the data that
  // step needs (formData lost on remount, no draft in storage), silently
  // send them back to step 1 — keeping the query params.
  useEffect(() => {
    if (!hydrated) return;
    if (currentStep === 2 && !formData) {
      router.replace(stepHref(1));
    } else if (currentStep === 3 && !result) {
      router.replace(stepHref(1));
    }
  }, [hydrated, currentStep, formData, result, router, stepHref]);

  const handleFormSubmit = (data) => {
    setFormData(data);
    // Persist the validated payload so the remounted step-2 route — and a
    // later "แก้ไข" back to step 1 — can restore every field the user entered.
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    try { sessionStorage.setItem(FORMDATA_KEY, JSON.stringify(data)); } catch {}
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
      const res = await fetch('/api/registration/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          body?.message ||
            (body?.error === 'validation'
              ? 'ข้อมูลไม่ถูกต้อง กรุณากลับไปตรวจสอบ'
              : 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
        );
        setSubmitting(false);
        return;
      }
      // Draft + confirmed payload are consumed; persist the result so the
      // step-3 route can render it.
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
      try { sessionStorage.removeItem(FORMDATA_KEY); } catch {}
      const quoteResult = { ...body, kind: 'quote' };
      try {
        sessionStorage.setItem(
          RESULT_KEY,
          JSON.stringify({ result: quoteResult, formData })
        );
      } catch {}
      setResult(quoteResult);
      setCurrentStep(3);
      router.push(stepHref(3));
      // Keep the loading overlay up through the navigation — the fresh
      // step-3 mount resets `submitting`, so we don't clear it here.
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
      setSubmitting(false);
    }
  };

  // Shared success path for card + PromptPay — persist a 'paid' result
  // and advance to the step-3 receipt screen.
  const handlePaid = useCallback((paid) => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    try { sessionStorage.removeItem(FORMDATA_KEY); } catch {}
    const paidResult = { kind: 'paid', ...paid };
    try {
      sessionStorage.setItem(
        RESULT_KEY,
        JSON.stringify({ result: paidResult, formData })
      );
    } catch {}
    setResult(paidResult);
    setCurrentStep(3);
    router.push(stepHref(3));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [formData, router, stepHref]);

  return (
    <div>
      <Stepper currentStep={currentStep} omisePaymentEnabled={omisePaymentEnabled} />

      {currentStep === 1 && hydrated && (
        <StepForm
          course={course}
          schedules={schedules}
          initialClassId={initialClassId}
          initialValues={formData ?? restoredFromStorage}
          onSubmit={handleFormSubmit}
          earlyBirdScheduleId={earlyBirdScheduleId}
        />
      )}

      {/* Toggle OFF — unchanged quote preview. */}
      {currentStep === 2 && formData && !omisePaymentEnabled && (
        <StepPreview
          data={formData}
          onBack={handleBack}
          onConfirm={handleConfirm}
          submitting={submitting}
          error={submitError}
        />
      )}

      {/* Toggle ON — single unified preview + payment page. */}
      {currentStep === 2 && formData && omisePaymentEnabled && (
        <UnifiedPaymentStep
          data={formData}
          pricing={pricing}
          onBack={handleBack}
          onQuoteConfirm={handleConfirm}
          onPaid={handlePaid}
          submitting={submitting}
          error={submitError}
        />
      )}

      {currentStep === 3 && result && (
        <StepComplete
          result={result}
          email={formData?.coordinator?.email}
        />
      )}
    </div>
  );
}

function Stepper({ currentStep, omisePaymentEnabled = false }) {
  const steps = [
    { n: 1, label: 'กรอกข้อมูล' },
    { n: 2, label: omisePaymentEnabled ? 'ชำระเงิน' : 'ตรวจสอบ' },
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

// ── Step 1: Form ─────────────────────────────────────────────────

function StepForm({ course, schedules, initialClassId, initialValues, onSubmit, earlyBirdScheduleId = null }) {
  const restoredClassId = initialValues?.classId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedScheduleId, setSelectedScheduleId] = useState(
    restoredClassId || initialClassId || ''
  );

  // Sync URL when the user picks a different round so the link is shareable
  // and survives a refresh. `replace` (not `push`) keeps the back button
  // clean; `scroll: false` prevents the page from jumping to the top.
  const handleSelectSchedule = useCallback((id) => {
    setSelectedScheduleId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('class', id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  // If the user arrives with draft data, the form was already revealed
  // previously — auto-open it. Otherwise require an explicit confirm.
  const [formRevealed, setFormRevealed] = useState(Boolean(initialValues));
  const coordinatorRef = useRef(null);
  // Tracks the very first run of the schedule-sync effect so we don't
  // overwrite a restored attendanceMode (e.g. after clicking "แก้ไข" back
  // from step 2 on a hybrid schedule) before the user ever sees it.
  const isFirstScheduleSync = useRef(true);

  const scheduleById = useMemo(() => {
    const map = new Map();
    (schedules ?? []).forEach((s) => map.set(s._id, s));
    return map;
  }, [schedules]);

  const activeSchedule = scheduleById.get(selectedScheduleId) ?? null;
  const activeDateLabel = activeSchedule ? formatClassDates(activeSchedule.dates) : '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(publicRegistrationSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      ...publicRegistrationDefaults,
      courseId: course.course_id,
      courseCode: course.course_id,
      courseName: course.course_name,
      classId: selectedScheduleId || '',
      classDate: activeDateLabel,
      scheduleType: activeSchedule?.type || undefined,
      attendanceMode: activeSchedule?.type !== 'hybrid' ? 'classroom' : undefined,
      attendeesListProvided: false,
      requestInvoice: true,
      ...(initialValues ?? {}),
    },
  });

  const watched = watch();

  // Sync hidden class fields when the user picks a different schedule
  useEffect(() => {
    const sch = scheduleById.get(selectedScheduleId);
    setValue('classId', sch?._id || '');
    setValue('classDate', sch ? formatClassDates(sch.dates) : '');
    // Track schedule type so the server + schema know if hybrid validation applies.
    setValue('scheduleType', sch?.type || undefined);
    // On the very first run (initial mount), keep any restored attendanceMode
    // intact — only reset it when the schedule actually changes afterwards.
    if (isFirstScheduleSync.current) {
      isFirstScheduleSync.current = false;
      return;
    }
    // Non-hybrid schedules default silently to classroom; hybrid requires a choice.
    if (sch?.type !== 'hybrid') {
      setValue('attendanceMode', 'classroom');
    } else {
      setValue('attendanceMode', undefined);
    }
  }, [selectedScheduleId, scheduleById, setValue]);

  // When the form is first revealed, scroll the user straight to the
  // first field they need to interact with: the attendance-mode picker
  // on hybrid schedules, or the coordinator section otherwise.
  useEffect(() => {
    if (!formRevealed) return;
    const timer = setTimeout(() => {
      const target = activeSchedule?.type === 'hybrid'
        ? document.querySelector('[data-section="attendance-mode"]')
        : coordinatorRef.current;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(timer);
  }, [formRevealed, activeSchedule?.type]);

  // Always initialise the invoice skeleton on mount — invoice section is always visible.
  useEffect(() => {
    if (!watch('invoice')) {
      setValue('invoice', {
        type: 'individual',
        country: 'TH',
        firstName: '',
        lastName: '',
        companyName: '',
        branch: '',
        taxId: '',
        thaiAddress: {
          addressLine: '',
          subDistrict: '',
          district: '',
          province: '',
          postalCode: '',
        },
        internationalAddress: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
    } catch {
      // storage full / disabled — ignore
    }
  }, [watched]);

  const handleReveal = () => {
    if (!selectedScheduleId) return;
    setFormRevealed(true);
  };

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit(onSubmit, () => {
        // Scroll to the first invalid field so the user can see what needs fixing
        setTimeout(() => {
          const firstError = document.querySelector(
            '[aria-invalid="true"], [data-error="true"]'
          );
          if (firstError) {
            firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstError.focus?.();
          }
        }, 50);
      })}
      noValidate
    >
      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
          เลือกรอบการอบรม
        </h2>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          {course.course_name}
        </p>

        <ScheduleCarousel
          schedules={schedules}
          selectedId={selectedScheduleId}
          onSelect={handleSelectSchedule}
          earlyBirdScheduleId={earlyBirdScheduleId}
        />

        {activeSchedule && (
          <div className="mt-4 flex items-center justify-between rounded-9e-md bg-9e-brand/5 p-3 text-sm">
            <div>
              <div className="font-semibold text-[var(--text-primary)]">
                {activeDateLabel}
              </div>
              <div className="text-xs text-[var(--text-secondary)]">
                {activeSchedule.type === 'hybrid'
                  ? 'Hybrid (Classroom + MS Teams)'
                  : 'Classroom'}
              </div>
            </div>
            {!formRevealed && (
              <Button
                type="button"
                variant="cta"
                size="sm"
                onClick={handleReveal}
              >
                ยืนยันรอบอบรม
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {errors.classId && (
          <p className="mt-2 text-xs text-red-500">{errors.classId.message}</p>
        )}
      </section>

      {formRevealed && (
        <>
          {activeSchedule?.type === 'hybrid' && (
            <AttendanceModeSelector
              value={watch('attendanceMode')}
              onChange={(mode) => setValue('attendanceMode', mode, { shouldValidate: true })}
              error={errors.attendanceMode?.message}
            />
          )}

          <div ref={coordinatorRef}>
            <CoordinatorFields register={register} errors={errors} />
          </div>

          <AttendeesList
            control={control}
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />

          <InvoiceFields
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />

          <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
              หมายเหตุเพิ่มเติม
            </h2>
            <Label className="sr-only" htmlFor="notes">
              หมายเหตุ
            </Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="เช่น อาหาร/แพ้อาหาร คำถามเกี่ยวกับหลักสูตร ฯลฯ (ไม่เกิน 500 ตัวอักษร)"
              maxLength={500}
              {...register('notes')}
            />
            {errors.notes?.message && (
              <p className="mt-1 text-xs text-red-500">{errors.notes.message}</p>
            )}
          </section>

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
        </>
      )}
    </form>
  );
}

// ── Attendance Mode Selector (Hybrid only) ────────────────────────

function AttendanceModeSelector({ value, onChange, error }) {
  const modes = [
    {
      id: 'classroom',
      title: 'Classroom',
      description: 'เรียนสดที่สถาบัน 9Expert Training เหมาะกับผู้ที่ต้องการบรรยากาศห้องเรียน',
      Icon: MapPin,
    },
    {
      id: 'teams',
      title: 'Online via Microsoft Teams',
      description: 'เรียนสดออนไลน์ผ่าน Microsoft Teams เหมาะกับผู้เรียนต่างจังหวัดหรือต่างประเทศ',
      Icon: Monitor,
    },
  ];

  return (
    <section
      data-section="attendance-mode"
      data-error={!!error || undefined}
      className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6"
    >
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        เลือกรูปแบบการอบรม
      </h2>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        รอบนี้เป็น Hybrid — สามารถเลือกเรียนที่สถาบันหรือออนไลน์ได้
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {modes.map(({ id, title, description, Icon: ModeIcon }) => {
          const active = value === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-pressed={active}
              className={cn(
                'flex min-h-[92px] w-full gap-3 rounded-9e-lg border p-4 text-left transition-all',
                active
                  ? 'border-9e-brand bg-9e-brand/5 shadow-9e-sm ring-4 ring-9e-brand/10'
                  : 'border-[var(--surface-border)] bg-[var(--surface)] hover:border-9e-brand/40 hover:bg-9e-brand/5'
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-9e-md transition-colors',
                  active
                    ? 'bg-9e-brand text-9e-ice'
                    : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]'
                )}
              >
                <ModeIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  {title}
                  {active && <CheckCircle2 className="h-4 w-4 text-9e-brand" />}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}
    </section>
  );
}

// ── Step 2: Preview ──────────────────────────────────────────────

function StepPreview({ data, onBack, onConfirm, submitting, error }) {
  const coord = data.coordinator ?? {};
  const [showConfirm, setShowConfirm] = useState(false);
  return (
    <>
    <div className="space-y-8">
      <Section title="ข้อมูลคอร์ส">
        <ReadOnlyRow label="หลักสูตร" value={data.courseName} />
        <ReadOnlyRow label="รหัสคอร์ส" value={data.courseCode || data.courseId} />
        <ReadOnlyRow label="รอบอบรม" value={data.classDate || '—'} />
        {data.scheduleType === 'hybrid' && (
          <ReadOnlyRow
            label="รูปแบบการอบรม"
            value={data.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom'}
          />
        )}
      </Section>

      <Section title="ข้อมูลผู้ประสานงาน">
        <ReadOnlyRow
          label="ชื่อ-นามสกุล"
          value={`${coord.firstName ?? ''} ${coord.lastName ?? ''}`.trim()}
        />
        <ReadOnlyRow label="อีเมล" value={coord.email} />
        <ReadOnlyRow label="เบอร์โทร" value={coord.phone} />
        {coord.lineId && <ReadOnlyRow label="LINE ID" value={coord.lineId} />}
        <ReadOnlyRow
          label="ผู้ประสานงานเข้าอบรม"
          value={coord.isAttending ? 'ใช่' : 'ไม่'}
        />
      </Section>

      <Section title={`ข้อมูลผู้เข้าอบรม (${data.attendeesCount} ท่าน)`}>
        <AttendeeListView data={data} />
      </Section>

      {data.invoice && (
        <Section title="ใบเสนอราคา / ใบกำกับภาษี">
          <InvoiceView invoice={data.invoice} />
        </Section>
      )}

      {data.notes && (
        <Section title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
            {data.notes}
          </p>
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
        <Button
          type="button"
          variant="cta"
          onClick={() => setShowConfirm(true)}
          disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังส่ง...
            </>
          ) : (
            'ยืนยันการสมัคร'
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirm(false)}
              >
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant="cta"
                onClick={() => {
                  setShowConfirm(false);
                  onConfirm();
                }}
              >
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

// ── Step 3: Thank-you ────────────────────────────────────────────

function StepComplete({ result, email }) {
  const referenceNumber = result?.referenceNumber;

  // ── Paid variant (card / PromptPay) ──────────────────────────────
  if (result?.kind === 'paid') {
    const methodLabel =
      result.method === 'promptpay' ? 'QR PromptPay' : 'บัตรเครดิต/เดบิต';
    return (
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
        <CheckCircle2 className="mx-auto h-16 w-16 text-9e-brand" strokeWidth={1.5} />
        <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
          ชำระเงินสำเร็จ
        </h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          เลขอ้างอิง:{' '}
          <span className="font-mono text-base font-bold text-9e-action">
            {referenceNumber}
          </span>
        </p>
        {result.amount != null && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            ยอดชำระ:{' '}
            <span className="text-base font-bold text-[var(--text-primary)]">
              {formatTHB(result.amount)} บาท
            </span>
          </p>
        )}
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          ช่องทางชำระเงิน:{' '}
          <span className="font-semibold text-[var(--text-primary)]">{methodLabel}</span>
        </p>
        {email && (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            เราได้ส่งใบเสร็จและอีเมลยืนยันไปที่{' '}
            <span className="font-semibold text-[var(--text-primary)]">{email}</span>{' '}
            แล้ว
          </p>
        )}
        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Quote variant (unchanged) ────────────────────────────────────
  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
      <CheckCircle2 className="mx-auto h-16 w-16 text-9e-brand" strokeWidth={1.5} />
      <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
        ขอบคุณสำหรับการลงทะเบียน
      </h2>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        เลขอ้างอิง:{' '}
        <span className="font-mono text-base font-bold text-9e-action">
          {referenceNumber}
        </span>
      </p>
      {email && (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          เราได้ส่งอีเมลยืนยันไปที่{' '}
          <span className="font-semibold text-[var(--text-primary)]">{email}</span>{' '}
          แล้ว
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        ทีมขายจะติดต่อกลับภายใน 1-2 วันทำการ
      </p>
      <div className="mt-8">
        <Button asChild variant="outline">
          <Link href="/training-course">ดูคอร์สอื่นเพิ่มเติม</Link>
        </Button>
      </div>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-40 sm:flex-none">
        {label}
      </div>
      <div className="text-sm text-[var(--text-primary)]">{value || '—'}</div>
    </div>
  );
}

/**
 * Walks the react-hook-form errors tree and collects only the user-facing
 * `.message` strings, deduplicated. Field paths (e.g.
 * `invoice.thaiAddress.addressLine`) are intentionally dropped so the summary
 * box shows friendly Thai messages instead of developer-facing paths.
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

// ── Read-only attendee + invoice views (shared by preview/summary) ──

function AttendeeListView({ data }) {
  const coord = data.coordinator ?? {};
  const attendees = data.attendees ?? [];
  if (!data.attendeesListProvided) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        ยังไม่ระบุรายชื่อผู้เข้าอบรม — ทีมขายจะติดต่อภายหลัง
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {coord.isAttending && (
        <li className="rounded-9e-md bg-9e-brand/5 p-3 text-sm">
          <div className="font-semibold">
            ท่านที่ 1 · {coord.firstName} {coord.lastName}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {coord.email} · {coord.phone}
          </div>
        </li>
      )}
      {attendees.map((a, i) => (
        <li
          key={i}
          className="rounded-9e-md border border-[var(--surface-border)] p-3 text-sm"
        >
          <div className="font-semibold">
            ท่านที่ {coord.isAttending ? i + 2 : i + 1} · {a.firstName}{' '}
            {a.lastName}
          </div>
          <div className="text-xs text-[var(--text-secondary)]">
            {a.email} · {a.phone}
          </div>
        </li>
      ))}
    </ol>
  );
}

function InvoiceView({ invoice }) {
  if (!invoice) return null;
  return (
    <>
      <ReadOnlyRow
        label="ประเภทลูกค้า"
        value={invoice.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'}
      />
      <ReadOnlyRow
        label="ประเทศ"
        value={invoice.country === 'TH' ? 'Thailand' : 'Other country'}
      />
      {invoice.type === 'individual' ? (
        <ReadOnlyRow
          label="ชื่อ-นามสกุล"
          value={`${invoice.firstName ?? ''} ${invoice.lastName ?? ''}`.trim()}
        />
      ) : (
        <>
          <ReadOnlyRow label="ชื่อบริษัท" value={invoice.companyName} />
          {invoice.branch && <ReadOnlyRow label="สาขา" value={invoice.branch} />}
        </>
      )}
      {invoice.taxId && (
        <ReadOnlyRow label="เลขประจำตัวผู้เสียภาษี" value={invoice.taxId} />
      )}
      {invoice.country === 'TH' && invoice.thaiAddress && (
        <ReadOnlyRow
          label="ที่อยู่"
          value={[
            invoice.thaiAddress.addressLine,
            invoice.thaiAddress.subDistrict,
            invoice.thaiAddress.district,
            invoice.thaiAddress.province,
            invoice.thaiAddress.postalCode,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      )}
      {invoice.country === 'OTHER' && invoice.internationalAddress && (
        <ReadOnlyRow
          label="ที่อยู่"
          value={[
            invoice.internationalAddress.line1,
            invoice.internationalAddress.line2,
            invoice.internationalAddress.city,
            invoice.internationalAddress.state,
            invoice.internationalAddress.postalCode,
            invoice.internationalAddress.country,
          ]
            .filter(Boolean)
            .join(', ')}
        />
      )}
    </>
  );
}

// ── Omise: consent checkbox ─────────────────────────────────────

function ConsentCheckbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--text-primary)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-9e-brand"
      />
      <span className="leading-5">{label}</span>
    </label>
  );
}

// ── Step 2 (Omise): unified preview + payment page ──────────────

const CONSENT_ITEMS = [
  { key: 'dataChecked', label: 'ข้าพเจ้าตรวจสอบข้อมูลการลงทะเบียนทั้งหมดเรียบร้อยแล้ว' },
  { key: 'noRefund', label: 'ข้าพเจ้ารับทราบว่าหลังชำระเงินแล้ว จะไม่สามารถขอคืนเงินได้' },
  {
    key: 'changePolicy',
    label:
      'ข้าพเจ้ารับทราบว่าการเปลี่ยนแปลงผู้เข้าอบรม การเลื่อนรอบ หรือยกเลิก เป็นไปตามเงื่อนไขที่บริษัทกำหนด',
  },
  { key: 'termsAccepted', label: 'ข้าพเจ้ายินยอมและรับทราบเงื่อนไขการอบรมทั้งหมด' },
];

/** Left column — read-only preview of everything the customer entered. */
function PreviewSections({ data }) {
  const coord = data.coordinator ?? {};
  return (
    <div className="space-y-6">
      <Section title="ข้อมูลคอร์ส">
        <ReadOnlyRow label="หลักสูตร" value={data.courseName} />
        <ReadOnlyRow label="รหัสคอร์ส" value={data.courseCode || data.courseId} />
        <ReadOnlyRow label="รอบอบรม" value={data.classDate || '—'} />
        {data.scheduleType === 'hybrid' && (
          <ReadOnlyRow
            label="รูปแบบการอบรม"
            value={data.attendanceMode === 'teams' ? 'Online via Microsoft Teams' : 'Classroom'}
          />
        )}
      </Section>

      <Section title="ข้อมูลผู้ประสานงาน">
        <ReadOnlyRow
          label="ชื่อ-นามสกุล"
          value={`${coord.firstName ?? ''} ${coord.lastName ?? ''}`.trim()}
        />
        <ReadOnlyRow label="อีเมล" value={coord.email} />
        <ReadOnlyRow label="เบอร์โทร" value={coord.phone} />
        {coord.lineId && <ReadOnlyRow label="LINE ID" value={coord.lineId} />}
        <ReadOnlyRow
          label="ผู้ประสานงานเข้าอบรม"
          value={coord.isAttending ? 'ใช่' : 'ไม่'}
        />
      </Section>

      <Section title={`ข้อมูลผู้เข้าอบรม (${data.attendeesCount} ท่าน)`}>
        <AttendeeListView data={data} />
      </Section>

      {data.invoice && (
        <Section title="ใบเสนอราคา / ใบกำกับภาษี">
          <InvoiceView invoice={data.invoice} />
        </Section>
      )}

      {data.notes && (
        <Section title="หมายเหตุ">
          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
            {data.notes}
          </p>
        </Section>
      )}
    </div>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

function MethodRadio({ selected, disabled, onClick, title, subtitle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-9e-lg border p-3 text-left transition-all',
        disabled
          ? 'cursor-not-allowed border-[var(--surface-border)] opacity-50'
          : selected
            ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15'
            : 'border-[var(--surface-border)] hover:border-9e-brand/40'
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-9e-brand' : 'border-[var(--surface-border)]'
        )}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-9e-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function ChannelCard({ selected, onClick, Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center gap-2 rounded-9e-lg border p-3 text-center transition-all',
        selected
          ? 'border-9e-brand bg-9e-brand/5 ring-2 ring-9e-brand/15'
          : 'border-[var(--surface-border)] hover:border-9e-brand/40'
      )}
    >
      <Icon className={cn('h-6 w-6', selected ? 'text-9e-brand' : 'text-[var(--text-secondary)]')} />
      <span className="text-xs font-semibold text-[var(--text-primary)]">{label}</span>
    </button>
  );
}

// ── Card input helpers (brand detection / formatting / validation) ──

function detectCardBrand(num) {
  const n = (num || '').replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^35/.test(n)) return 'jcb';
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(n)) return 'mastercard';
  return 'unknown';
}
function formatCardNumber(value, brand) {
  const max = brand === 'amex' ? 15 : 16;
  const digits = (value || '').replace(/\D/g, '').slice(0, max);
  if (brand === 'amex') {
    return digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(' ')
    );
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}
function formatExpiry(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : d.slice(0, 2) + '/' + d.slice(2);
}
function expiryValid(mmYY) {
  const m = (mmYY || '').match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const mm = Number(m[1]);
  const yy = 2000 + Number(m[2]);
  if (mm < 1 || mm > 12) return false;
  return new Date(yy, mm, 0, 23, 59, 59) >= new Date();
}
function cvcMax(brand) { return brand === 'amex' ? 4 : 3; }
function cardNumberValid(num, brand) {
  const n = (num || '').replace(/\D/g, '');
  return brand === 'amex' ? n.length === 15 : n.length >= 16;
}

const CARD_BRAND_LABEL = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  jcb: 'JCB',
  unknown: 'บัตร',
};

function CardFields({ card, setCard }) {
  const brand = detectCardBrand(card.number);
  const numDigits = card.number.replace(/\D/g, '');
  const numError = numDigits.length > 0 && !cardNumberValid(card.number, brand);
  const expError = card.expiry.length > 0 && !expiryValid(card.expiry);
  const cvcError = card.cvc.length > 0 && card.cvc.length !== cvcMax(brand);
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label htmlFor="card-number">หมายเลขบัตร</Label>
          {numDigits.length > 0 && (
            <span className="text-xs font-semibold text-9e-action">
              {CARD_BRAND_LABEL[brand]}
            </span>
          )}
        </div>
        <Input
          id="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4242 4242 4242 4242"
          value={card.number}
          onChange={(e) =>
            setCard((c) => ({
              ...c,
              number: formatCardNumber(e.target.value, detectCardBrand(e.target.value)),
            }))
          }
        />
        {numError && <p className="mt-1 text-xs text-red-500">หมายเลขบัตรไม่ถูกต้อง</p>}
      </div>
      <div>
        <Label htmlFor="card-name">ชื่อบนบัตร</Label>
        <Input id="card-name" autoComplete="cc-name" placeholder="NAME SURNAME"
          value={card.name}
          onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="card-expiry">วันหมดอายุ (MM/YY)</Label>
          <Input
            id="card-expiry"
            inputMode="numeric"
            autoComplete="cc-exp"
            maxLength={5}
            placeholder="MM/YY"
            value={card.expiry}
            onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
          />
          {expError && <p className="mt-1 text-xs text-red-500">วันหมดอายุไม่ถูกต้อง</p>}
        </div>
        <div>
          <Label htmlFor="card-cvc">CVC</Label>
          <Input
            id="card-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder={brand === 'amex' ? '1234' : '123'}
            value={card.cvc}
            onChange={(e) =>
              setCard((c) => ({
                ...c,
                cvc: e.target.value.replace(/\D/g, '').slice(0, cvcMax(detectCardBrand(card.number))),
              }))
            }
          />
          {cvcError && <p className="mt-1 text-xs text-red-500">CVC ไม่ถูกต้อง</p>}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
        <Lock className="h-3.5 w-3.5" />
        ข้อมูลบัตรถูกเข้ารหัสและส่งตรงไปยัง Omise — เราไม่เก็บเลขบัตรของคุณ
      </p>
    </div>
  );
}

function QrDisplay({ charge, pricing, expired, secondsLeft }) {
  const mmss = `${String(Math.floor((secondsLeft ?? 0) / 60)).padStart(2, '0')}:${String(
    (secondsLeft ?? 0) % 60
  ).padStart(2, '0')}`;
  return (
    <div className="flex flex-col items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4 text-center">
      <h3 className="mb-1 text-sm font-bold text-[var(--text-primary)]">
        สแกนเพื่อชำระเงิน (QR PromptPay)
      </h3>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        เปิดแอปธนาคารของคุณแล้วสแกน QR ด้านล่าง
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={charge.qrUrl}
        alt="PromptPay QR"
        className="h-56 w-56 rounded-9e-md border border-[var(--surface-border)] bg-white p-2"
      />
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        ยอดชำระ:{' '}
        <span className="text-lg font-bold text-9e-action">
          {formatTHB(charge.amount ?? pricing?.total ?? 0)} บาท
        </span>
      </p>
      {!expired ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          QR หมดอายุใน <span className="font-semibold">{mmss}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-red-500">QR หมดอายุแล้ว กรุณาสร้าง QR ใหม่</p>
      )}
    </div>
  );
}

/**
 * UnifiedPaymentStep — one page: left preview, right sticky payment card
 * (summary → method → channel → channel UI → consent → confirm). No
 * separate navigation screens. The PromptPay charge is created only on an
 * explicit button press (never on mount) to avoid duplicate charges.
 */
function UnifiedPaymentStep({ data, pricing, onBack, onQuoteConfirm, onPaid, submitting, error }) {
  const [method, setMethod] = useState(null); // 'instant' | 'quote'
  const [channel, setChannel] = useState(null); // 'promptpay' | 'credit_card'
  const [consent, setConsent] = useState({
    dataChecked: false,
    noRefund: false,
    changePolicy: false,
    termsAccepted: false,
  });

  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvc: '' });
  const [omiseReady, setOmiseReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState(null);
  const [charge, setCharge] = useState(null); // QR result, once created
  const [pendingTarget, setPendingTarget] = useState(null);
  const [expired, setExpired] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(600);

  const consentOk =
    consent.dataChecked && consent.noRefund && consent.changePolicy && consent.termsAccepted;
  const toggleConsent = (k) => setConsent((c) => ({ ...c, [k]: !c[k] }));
  const qrLive = Boolean(charge?.qrUrl);

  // Card validity (gates the card pay button alongside omiseReady + consent).
  const cardBrand = detectCardBrand(card.number);
  const cardValid =
    cardNumberValid(card.number, cardBrand) &&
    expiryValid(card.expiry) &&
    card.cvc.length === cvcMax(cardBrand) &&
    card.name.trim().length > 0;

  // Load Omise.js when the card channel is selected.
  useEffect(() => {
    if (channel !== 'credit_card') return;
    const pk = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY;
    function configure() {
      try {
        if (window.Omise && pk) {
          window.Omise.setPublicKey(pk);
          setOmiseReady(true);
        }
      } catch {
        // leave omiseReady false — pay button stays disabled
      }
    }
    if (typeof window !== 'undefined' && window.Omise) {
      configure();
      return;
    }
    const existing = document.querySelector('script[data-omise]');
    if (existing) {
      existing.addEventListener('load', configure);
      return () => existing.removeEventListener('load', configure);
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.omise.co/omise.js';
    script.async = true;
    script.setAttribute('data-omise', 'true');
    script.addEventListener('load', configure);
    document.body.appendChild(script);
    return () => script.removeEventListener('load', configure);
  }, [channel]);

  // Poll for settlement (card async + PromptPay) every 3s; stop after ~10 min.
  useEffect(() => {
    if (!pendingTarget?.id) return;
    const start = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - start > 600000) {
        clearInterval(timer);
        setExpired(true);
        setBusy(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/registration/public/status?id=${encodeURIComponent(pendingTarget.id)}`,
          { cache: 'no-store' }
        );
        const body = await res.json().catch(() => ({}));
        if (body?.status === 'paid') {
          clearInterval(timer);
          onPaid({
            referenceNumber: pendingTarget.referenceNumber,
            amount: pendingTarget.amount,
            method: pendingTarget.method,
          });
        }
      } catch {
        // transient — keep polling
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [pendingTarget, onPaid]);

  // QR countdown — counts down from 600s while the QR is live; flips to
  // expired at 0. Reset to 600 whenever a fresh charge is created.
  useEffect(() => {
    if (!charge?.qrUrl || expired) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [charge, expired]);

  const regenerateQr = () => {
    setCharge(null);
    setPendingTarget(null);
    setExpired(false);
    setSecondsLeft(600);
    setPayError(null);
  };

  const payCard = () => {
    setPayError(null);
    if (!window.Omise || !omiseReady) {
      setPayError('ระบบชำระเงินยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่');
      return;
    }
    const [em, ey] = card.expiry.split('/');
    setBusy(true);
    window.Omise.createToken(
      'card',
      {
        name: card.name,
        number: card.number.replace(/\s+/g, ''),
        expiration_month: Number(em),
        expiration_year: 2000 + Number(ey),
        security_code: card.cvc,
      },
      async (statusCode, response) => {
        if (statusCode !== 200) {
          setBusy(false);
          setPayError(response?.message || 'ข้อมูลบัตรไม่ถูกต้อง กรุณาตรวจสอบ');
          return;
        }
        try {
          const res = await fetch('/api/registration/public/charge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...data,
              paymentMethod: 'credit_card',
              omiseToken: response.id,
              consent,
            }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) {
            setBusy(false);
            setPayError(body?.message || 'การชำระเงินไม่สำเร็จ กรุณาลองใหม่');
            return;
          }
          if (body.paid) {
            onPaid({ referenceNumber: body.referenceNumber, amount: body.amount, method: 'credit_card' });
            return;
          }
          // Rare for card — fall back to status polling.
          setPendingTarget({
            id: body.registrationId,
            referenceNumber: body.referenceNumber,
            amount: body.amount,
            method: 'credit_card',
          });
        } catch {
          setBusy(false);
          setPayError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
        }
      }
    );
  };

  const createQr = async () => {
    setPayError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/registration/public/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, paymentMethod: 'promptpay', consent }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setBusy(false);
        setPayError(body?.message || 'สร้าง QR ไม่สำเร็จ กรุณาลองใหม่');
        return;
      }
      setCharge(body);
      setSecondsLeft(600);
      setExpired(false);
      setPendingTarget({
        id: body.registrationId,
        referenceNumber: body.referenceNumber,
        amount: body.amount,
        method: 'promptpay',
      });
      setBusy(false);
    } catch {
      setBusy(false);
      setPayError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    }
  };

  const onConfirm = () => {
    if (method === 'quote') return onQuoteConfirm();
    if (method === 'instant' && channel === 'credit_card') return payCard();
    if (method === 'instant' && channel === 'promptpay') return createQr();
  };

  const canConfirm =
    method === 'quote'
      ? true
      : Boolean(
          method === 'instant' &&
          channel &&
          consentOk &&
          pricing &&
          (channel !== 'credit_card' || cardValid)
        );
  const cardNotReady = method === 'instant' && channel === 'credit_card' && !omiseReady;
  const confirmLabel =
    method === 'quote'
      ? 'ยืนยันการขอใบเสนอราคา'
      : channel === 'credit_card'
        ? 'ยืนยันการสมัครและชำระด้วยบัตร'
        : channel === 'promptpay'
          ? 'ยืนยันการสมัครและชำระด้วย PromptPay'
          : 'เลือกวิธีดำเนินการ';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(360px,420px)]">
      {/* LEFT — preview */}
      <div>
        <PreviewSections data={data} />
      </div>

      {/* RIGHT — sticky payment card */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-6 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6 shadow-9e-sm">
          {/* 1. สรุปยอด */}
          <div>
            <h2 className="mb-3 text-base font-bold text-[var(--text-primary)]">สรุปยอด</h2>
            {pricing ? (
              <div className="space-y-2 text-sm">
                <SummaryLine
                  label={`ราคาต่อท่าน × ${pricing.seats}`}
                  value={`${formatTHB(pricing.subtotal)} บาท`}
                />
                <SummaryLine label="ส่วนลด" value={`${formatTHB(0)} บาท`} />
                <SummaryLine label="VAT 7%" value={`${formatTHB(pricing.vatAmount)} บาท`} />
                <div className="mt-2 flex items-baseline justify-between border-t border-[var(--surface-border)] pt-2">
                  <span className="font-semibold text-[var(--text-primary)]">ยอดรวมสุทธิ</span>
                  <span className="text-xl font-bold text-9e-brand">
                    {formatTHB(pricing.total)} บาท
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-red-500">
                ไม่สามารถคำนวณราคาได้ กรุณาเลือกขอใบเสนอราคา หรือ ติดต่อทีมงาน
              </p>
            )}
          </div>

          {/* 2. เลือกวิธีดำเนินการ */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
              เลือกวิธีดำเนินการ
            </h3>
            <div className="space-y-2">
              <MethodRadio
                selected={method === 'instant'}
                disabled={!pricing}
                onClick={() => setMethod('instant')}
                title="ชำระทันที"
                subtitle="ชำระผ่าน PromptPay QR หรือบัตรเครดิต/เดบิต"
              />
              <MethodRadio
                selected={method === 'quote'}
                onClick={() => { setMethod('quote'); setChannel(null); }}
                title="ขอใบเสนอราคา"
                subtitle="เหมาะสำหรับบริษัทที่ต้องใช้เอกสารก่อนชำระเงิน"
              />
            </div>
            {!pricing && (
              <p className="mt-2 text-xs text-amber-700">
                * ราคายังไม่พร้อม สามารถเลือกขอใบเสนอราคาได้
              </p>
            )}
          </div>

          {/* 3 + 4 + 5 — instant path, before the QR is created */}
          {method === 'instant' && !qrLive && (
            <>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                  เลือกช่องทางชำระเงิน
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <ChannelCard
                    selected={channel === 'promptpay'}
                    onClick={() => setChannel('promptpay')}
                    Icon={QrCode}
                    label="PromptPay QR"
                  />
                  <ChannelCard
                    selected={channel === 'credit_card'}
                    onClick={() => setChannel('credit_card')}
                    Icon={CreditCard}
                    label="บัตรเครดิต/เดบิต"
                  />
                </div>
              </div>

              {/* 4. only the selected channel's UI */}
              {channel === 'credit_card' && <CardFields card={card} setCard={setCard} />}
              {channel === 'promptpay' && (
                <p className="rounded-9e-md bg-9e-brand/5 p-3 text-xs text-[var(--text-secondary)]">
                  กด “ยืนยันการสมัครและชำระด้วย PromptPay” เพื่อสร้าง QR สำหรับสแกนชำระเงิน
                </p>
              )}

              {/* 5. consent at the bottom */}
              {channel && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
                    เงื่อนไขการชำระเงิน
                  </h3>
                  <div className="space-y-3">
                    {CONSENT_ITEMS.map(({ key, label }) => (
                      <ConsentCheckbox
                        key={key}
                        checked={consent[key]}
                        onChange={() => toggleConsent(key)}
                        label={label}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* QR display once created */}
          {qrLive && (
            <QrDisplay
              charge={charge}
              pricing={pricing}
              expired={expired}
              secondsLeft={secondsLeft}
            />
          )}

          {/* Errors */}
          {payError && (
            <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
              {payError}
            </div>
          )}
          {error && method === 'quote' && (
            <div className="rounded-9e-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* 6. confirm button (hidden once the QR is live) */}
          {!qrLive && (
            <Button
              type="button"
              variant="cta"
              className="w-full"
              disabled={busy || submitting || !canConfirm || cardNotReady}
              onClick={onConfirm}
            >
              {busy || submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังดำเนินการ...
                </>
              ) : (
                <>
                  {method === 'instant' && <Lock className="h-4 w-4" />}
                  {confirmLabel}
                </>
              )}
            </Button>
          )}

          {/* 7. QR pending status line + dev shortcut */}
          {qrLive && !expired && (
            <>
              <p className="flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                สถานะ: รอตรวจสอบผลการชำระเงิน
              </p>
              {process.env.NEXT_PUBLIC_PAYMENT_TEST_MODE === 'true' && pendingTarget?.id && (
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/registration/public/dev-mark-paid', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: pendingTarget.id }),
                    });
                    // the existing 3s poll will see status:'paid' → onPaid → step 3
                  }}
                  className="mx-auto mt-2 block rounded-9e-md border border-dashed border-amber-500/60 px-3 py-1.5 text-xs text-amber-600"
                >
                  [DEV] จำลองว่าชำระเงินแล้ว
                </button>
              )}
            </>
          )}

          {/* Expired QR → let the user generate a fresh one (no auto-recreate). */}
          {qrLive && expired && (
            <Button type="button" variant="outline" className="w-full" onClick={regenerateQr}>
              สร้าง QR ใหม่
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={onBack}
            disabled={busy || submitting}
          >
            ย้อนกลับไปแก้ไขข้อมูล
          </Button>
        </div>
      </div>
    </div>
  );
}
