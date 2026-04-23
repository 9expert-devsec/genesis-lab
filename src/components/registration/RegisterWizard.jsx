'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import {
  publicRegistrationSchema,
  publicRegistrationDefaults,
} from '@/lib/schemas/register-public';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'registration-public-v1';

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

/**
 * Main wizard — owns step state, formData, sessionStorage sync.
 *
 * Three steps:
 *   1. Form input (react-hook-form + Zod)
 *   2. Preview (read-only) + submit
 *   3. Thank-you with reference number
 */
export function RegisterWizard({ course, classItem, allSchedules }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(null);

  // Restore draft on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only restore if same course — otherwise start fresh
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
          classItem={classItem}
          allSchedules={allSchedules}
          initialValues={formData ?? restoredFromStorage}
          onSubmit={handleFormSubmit}
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
          email={formData?.email}
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

function StepForm({ course, classItem, allSchedules, initialValues, onSubmit }) {
  const defaultClass = classItem ?? allSchedules?.[0] ?? null;
  const [selectedClassId, setSelectedClassId] = useState(
    initialValues?.classId || defaultClass?._id || ''
  );

  const classById = useMemo(() => {
    const map = new Map();
    (allSchedules ?? []).forEach((s) => map.set(s._id, s));
    if (classItem) map.set(classItem._id, classItem);
    return map;
  }, [allSchedules, classItem]);

  const activeClass = classById.get(selectedClassId) ?? defaultClass;
  const activeDateLabel = activeClass ? formatClassDates(activeClass.dates) : '';

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(publicRegistrationSchema),
    mode: 'onBlur',
    defaultValues: {
      ...publicRegistrationDefaults,
      courseId: course.course_id,
      courseCode: course.course_id,
      courseName: course.course_name,
      classId: selectedClassId || '',
      classDate: activeDateLabel,
      ...(initialValues ?? {}),
    },
  });

  const watched = watch();
  const requestInvoice = watch('requestInvoice');

  // Sync hidden class fields when the user picks a different class
  useEffect(() => {
    const cls = classById.get(selectedClassId);
    setValue('classId', cls?._id || '');
    setValue('classDate', cls ? formatClassDates(cls.dates) : '');
  }, [selectedClassId, classById, setValue]);

  // Persist draft to sessionStorage on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(watched));
    } catch {
      // storage full / disabled — ignore
    }
  }, [watched]);

  const showClassPicker = (allSchedules?.length ?? 0) > 1;

  return (
    <form
      className="space-y-8"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <Section title="ข้อมูลคอร์ส">
        <ReadOnlyRow label="หลักสูตร" value={course.course_name} />
        <ReadOnlyRow label="รหัสคอร์ส" value={course.course_id} />
        {showClassPicker ? (
          <div>
            <Label className="mb-2 block">เลือกรอบอบรม</Label>
            <div className="space-y-2">
              {allSchedules.map((s) => (
                <label
                  key={s._id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-9e-md border p-3',
                    selectedClassId === s._id
                      ? 'border-9e-brand bg-9e-brand/5'
                      : 'border-[var(--surface-border)] hover:border-9e-brand'
                  )}
                >
                  <input
                    type="radio"
                    name="class-picker"
                    value={s._id}
                    checked={selectedClassId === s._id}
                    onChange={() => setSelectedClassId(s._id)}
                    className="h-4 w-4 accent-9e-brand"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatClassDates(s.dates)}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {s.type === 'hybrid'
                        ? 'Hybrid (Classroom + MS Teams)'
                        : 'Classroom'}
                      {' · '}
                      {s.status === 'nearly_full' ? 'ใกล้เต็ม' : 'เปิดรับสมัคร'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {errors.classId && (
              <p className="mt-2 text-xs text-9e-accent">{errors.classId.message}</p>
            )}
          </div>
        ) : (
          <ReadOnlyRow label="รอบอบรม" value={activeDateLabel || '—'} />
        )}
      </Section>

      <Section title="ข้อมูลผู้เรียน">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ชื่อ" error={errors.firstName?.message} required>
            <Input {...register('firstName')} aria-invalid={!!errors.firstName} />
          </Field>
          <Field label="นามสกุล" error={errors.lastName?.message} required>
            <Input {...register('lastName')} aria-invalid={!!errors.lastName} />
          </Field>
          <Field label="อีเมล" error={errors.email?.message} required>
            <Input type="email" {...register('email')} aria-invalid={!!errors.email} />
          </Field>
          <Field label="เบอร์โทร" error={errors.phone?.message} required>
            <Input
              inputMode="tel"
              placeholder="0812345678"
              {...register('phone')}
              aria-invalid={!!errors.phone}
            />
          </Field>
          <Field label="LINE ID (ถ้ามี)" error={errors.lineId?.message}>
            <Input {...register('lineId')} />
          </Field>
        </div>
      </Section>

      <Section title="ข้อมูลใบกำกับภาษี (ถ้าต้องการ)">
        <label className="flex items-center gap-2">
          <Checkbox {...register('requestInvoice')} />
          <span className="text-sm text-[var(--text-primary)]">
            ต้องการใบกำกับภาษี
          </span>
        </label>
        {requestInvoice && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="ชื่อบริษัท"
              error={errors.companyName?.message}
              required
              className="sm:col-span-2"
            >
              <Input
                {...register('companyName')}
                aria-invalid={!!errors.companyName}
              />
            </Field>
            <Field
              label="เลขประจำตัวผู้เสียภาษี (13 หลัก)"
              error={errors.taxId?.message}
              required
            >
              <Input
                inputMode="numeric"
                maxLength={13}
                {...register('taxId')}
                aria-invalid={!!errors.taxId}
              />
            </Field>
            <Field
              label="ที่อยู่"
              error={errors.address?.message}
              required
              className="sm:col-span-2"
            >
              <Textarea
                rows={3}
                {...register('address')}
                aria-invalid={!!errors.address}
              />
            </Field>
          </div>
        )}
      </Section>

      <Section title="หมายเหตุเพิ่มเติม">
        <Field label="" error={errors.notes?.message}>
          <Textarea
            rows={3}
            placeholder="เช่น อาหาร/แพ้อาหาร คำถามเกี่ยวกับหลักสูตร ฯลฯ (ไม่เกิน 500 ตัวอักษร)"
            maxLength={500}
            {...register('notes')}
          />
        </Field>
      </Section>

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
    </form>
  );
}

// ── Step 2: Preview ──────────────────────────────────────────────

function StepPreview({ data, onBack, onConfirm, submitting, error }) {
  return (
    <div className="space-y-8">
      <Section title="ข้อมูลคอร์ส">
        <ReadOnlyRow label="หลักสูตร" value={data.courseName} />
        <ReadOnlyRow label="รหัสคอร์ส" value={data.courseCode || data.courseId} />
        <ReadOnlyRow label="รอบอบรม" value={data.classDate || '—'} />
      </Section>

      <Section title="ข้อมูลผู้เรียน">
        <ReadOnlyRow label="ชื่อ-นามสกุล" value={`${data.firstName} ${data.lastName}`} />
        <ReadOnlyRow label="อีเมล" value={data.email} />
        <ReadOnlyRow label="เบอร์โทร" value={data.phone} />
        {data.lineId && <ReadOnlyRow label="LINE ID" value={data.lineId} />}
      </Section>

      {data.requestInvoice && (
        <Section title="ใบกำกับภาษี">
          <ReadOnlyRow label="ชื่อบริษัท" value={data.companyName} />
          <ReadOnlyRow label="เลขประจำตัวผู้เสียภาษี" value={data.taxId} />
          <ReadOnlyRow label="ที่อยู่" value={data.address} />
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
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={submitting}
        >
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
      <CheckCircle2
        className="mx-auto h-16 w-16 text-9e-brand"
        strokeWidth={1.5}
      />
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

function Field({ label, error, required, children, className }) {
  return (
    <div className={className}>
      {label && (
        <Label className="mb-1.5 block">
          {label}
          {required && <span className="ml-0.5 text-9e-accent">*</span>}
        </Label>
      )}
      {children}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
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
