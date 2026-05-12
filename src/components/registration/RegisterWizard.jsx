'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import {
  publicRegistrationSchema,
  publicRegistrationDefaults,
} from '@/lib/schemas/register-public';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';
import { CoordinatorFields } from '@/components/registration/CoordinatorFields';
import { AttendeesList } from '@/components/registration/AttendeesList';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'registration-public-v2';

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

export function RegisterWizard({ course, schedules, initialClassId, earlyBirdScheduleId = null }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.courseId === course.course_id) {
          setRestoredFromStorage(parsed);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // ignore corrupted storage
    }
  }, [course.course_id]);

  const handleFormSubmit = (data) => {
    setFormData(data);
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setSubmitError(null);
    setCurrentStep(1);
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
      sessionStorage.removeItem(STORAGE_KEY);
      setResult(body);
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Stepper currentStep={currentStep} />

      {currentStep === 1 && (
        <StepForm
          course={course}
          schedules={schedules}
          initialClassId={initialClassId}
          initialValues={formData ?? restoredFromStorage}
          onSubmit={handleFormSubmit}
          earlyBirdScheduleId={earlyBirdScheduleId}
        />
      )}

      {currentStep === 2 && formData && (
        <StepPreview
          data={formData}
          onBack={handleBack}
          onConfirm={handleConfirm}
          submitting={submitting}
          error={submitError}
        />
      )}

      {currentStep === 3 && result && (
        <StepComplete
          referenceNumber={result.referenceNumber}
          email={formData?.coordinator?.email}
        />
      )}
    </div>
  );
}

function Stepper({ currentStep }) {
  const steps = [
    { n: 1, label: 'กรอกข้อมูล' },
    { n: 2, label: 'ตรวจสอบ' },
    { n: 3, label: 'สำเร็จ' },
  ];
  return (
    <ol className="mb-8 flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
              currentStep === s.n
                ? 'border-9e-brand bg-9e-brand text-9e-ice'
                : currentStep > s.n
                  ? 'border-9e-brand bg-9e-brand/10 text-9e-brand'
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
    mode: 'onBlur',
    defaultValues: {
      ...publicRegistrationDefaults,
      courseId: course.course_id,
      courseCode: course.course_id,
      courseName: course.course_name,
      classId: selectedScheduleId || '',
      classDate: activeDateLabel,
      ...(initialValues ?? {}),
    },
  });

  const watched = watch();
  const requestInvoice = watch('requestInvoice');

  // Sync hidden class fields when the user picks a different schedule
  useEffect(() => {
    const sch = scheduleById.get(selectedScheduleId);
    setValue('classId', sch?._id || '');
    setValue('classDate', sch ? formatClassDates(sch.dates) : '');
  }, [selectedScheduleId, scheduleById, setValue]);

  // Lazy-init the invoice skeleton when the checkbox is first ticked,
  // and clear it on untick so the schema's `.optional().nullable()`
  // accepts the "no invoice" state cleanly.
  useEffect(() => {
    if (requestInvoice && !watch('invoice')) {
      setValue('invoice', {
        type: 'individual',
        firstName: '',
        lastName: '',
        companyName: '',
        branch: '',
        taxId: '',
        address: {
          addressLine: '',
          subDistrict: '',
          district: '',
          province: '',
          postalCode: '',
        },
      });
    }
    if (!requestInvoice) {
      setValue('invoice', null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestInvoice]);

  // Persist draft to sessionStorage on every change
  useEffect(() => {
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
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
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
          <p className="mt-2 text-xs text-9e-accent">{errors.classId.message}</p>
        )}
      </section>

      {formRevealed && (
        <>
          <CoordinatorFields register={register} errors={errors} />

          <AttendeesList
            control={control}
            register={register}
            watch={watch}
            setValue={setValue}
            errors={errors}
          />

          <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
            <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">
              ใบกำกับภาษี
            </h2>
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox {...register('requestInvoice')} />
              <span className="text-sm text-[var(--text-primary)]">
                ต้องการใบกำกับภาษี
              </span>
            </label>
          </section>

          {requestInvoice && (
            <InvoiceFields
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
            />
          )}

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
              <p className="mt-1 text-xs text-9e-accent">{errors.notes.message}</p>
            )}
          </section>

          <div className="flex items-center justify-between gap-4 pt-2">
            <Link
              href="/training-course"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-9e-brand"
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

// ── Step 2: Preview ──────────────────────────────────────────────

function StepPreview({ data, onBack, onConfirm, submitting, error }) {
  const coord = data.coordinator ?? {};
  const attendees = data.attendees ?? [];
  return (
    <div className="space-y-8">
      <Section title="ข้อมูลคอร์ส">
        <ReadOnlyRow label="หลักสูตร" value={data.courseName} />
        <ReadOnlyRow label="รหัสคอร์ส" value={data.courseCode || data.courseId} />
        <ReadOnlyRow label="รอบอบรม" value={data.classDate || '—'} />
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

      <Section title="ข้อมูลผู้เข้าอบรม">
        <ReadOnlyRow label="จำนวน" value={`${data.attendeesCount} ท่าน`} />
        {!data.attendeesListProvided ? (
          <p className="text-sm text-[var(--text-secondary)]">
            ยังไม่ระบุรายชื่อผู้เข้าอบรม — ทีมขายจะติดต่อภายหลัง
          </p>
        ) : (
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
        )}
      </Section>

      {data.requestInvoice && data.invoice && (
        <Section title="ใบกำกับภาษี">
          <ReadOnlyRow
            label="ประเภท"
            value={data.invoice.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'}
          />
          {data.invoice.type === 'individual' ? (
            <ReadOnlyRow
              label="ชื่อ-นามสกุล"
              value={`${data.invoice.firstName ?? ''} ${data.invoice.lastName ?? ''}`.trim()}
            />
          ) : (
            <>
              <ReadOnlyRow label="ชื่อบริษัท" value={data.invoice.companyName} />
              {data.invoice.branch && (
                <ReadOnlyRow label="สาขา" value={data.invoice.branch} />
              )}
            </>
          )}
          <ReadOnlyRow label="เลขประจำตัวผู้เสียภาษี" value={data.invoice.taxId} />
          <ReadOnlyRow
            label="ที่อยู่"
            value={[
              data.invoice.address?.addressLine,
              data.invoice.address?.subDistrict,
              data.invoice.address?.district,
              data.invoice.address?.province,
              data.invoice.address?.postalCode,
            ]
              .filter(Boolean)
              .join(' ')}
          />
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
        <div className="rounded-9e-md border border-9e-accent/40 bg-9e-accent/10 p-4 text-sm text-9e-accent">
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
          onClick={onConfirm}
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
  );
}

// ── Step 3: Thank-you ────────────────────────────────────────────

function StepComplete({ referenceNumber, email }) {
  return (
    <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-10 text-center shadow-9e-md">
      <CheckCircle2 className="mx-auto h-16 w-16 text-9e-brand" strokeWidth={1.5} />
      <h2 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
        ขอบคุณสำหรับการลงทะเบียน
      </h2>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        เลขอ้างอิง:{' '}
        <span className="font-mono text-base font-bold text-9e-brand">
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
