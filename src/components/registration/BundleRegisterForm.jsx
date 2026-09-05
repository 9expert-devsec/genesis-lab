'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Loader2 } from 'lucide-react';

import { SuccessPulseIcon } from '@/components/ui/SuccessPulseIcon';
import {
  bundleRegistrationSchema,
  bundleRegistrationDefaults,
} from '@/lib/schemas/register-bundle';
import { CoordinatorFields } from '@/components/registration/CoordinatorFields';
import { AttendeesList } from '@/components/registration/AttendeesList';
import { InvoiceFields } from '@/components/registration/InvoiceFields';
import { consentFanOut } from '@/components/payment/consent';
import {
  BUNDLE_CLOSED_MESSAGE,
  BUNDLE_UNAVAILABLE_MESSAGE,
} from '@/lib/pageBuilder/bundleRegistration';
import { isSilentRefusal } from '@/lib/registration/bundleRequest';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * THE BUNDLE QUOTATION FORM.
 *
 * ══ IT ASKS WHAT THE ORDINARY PUBLIC FORM ASKS ═════════════════════════════
 *
 * `CoordinatorFields`, `AttendeesList` and `InvoiceFields` are the SAME
 * components the public wizard renders, imported rather than copied, and
 * `bundleRegistrationSchema` reuses that form's zod parts. A bundle customer
 * and a course customer are asked the same questions and held to the same
 * rules, which is the round's decision and also the only way the accumulated
 * rulings inside those schemas (the attendee/coordinator asymmetry, the
 * English-only branch, the branch-code handling) reach this form at all.
 *
 * ══ WHAT IS ABSENT ═════════════════════════════════════════════════════════
 *
 * NO ROUND PICKER, no ยืนยันรอบอบรม reveal, no `AttendanceModeSelector`, and
 * none of the wizard's three `?class=` notices. A bundle's rounds are chosen by
 * the author and there is no single round for the customer to pick — which is
 * why the whole carousel apparatus, and the sessionStorage rehydration that
 * exists to survive its step-prefixed routes, are not here either. One person
 * attends every course in the package, so there is no per-course attendee UI.
 *
 * NO PAYMENT. This is a quotation request: `bundleRegistrationSchema` carries
 * no `paymentMethod` and no `omiseToken`, so there is nothing to render and
 * nothing a client could send.
 *
 * ══ THE FORM IS ONE PAGE, NOT THREE ROUTES ═════════════════════════════════
 *
 * The public wizard is three step-prefixed ROUTES because it has to survive a
 * refresh mid-flow and a `?class=` deep link, and it pays for that with
 * sessionStorage rehydration and a remount guard on every step. This has one
 * entry point and one submission, so it is one page with a confirm state —
 * fewer moving parts, and nothing to rehydrate because nothing navigates.
 *
 * ══ THE CONSENT IS THE SHARED FAN-OUT ══════════════════════════════════════
 *
 * One checkbox on screen, four flags on the wire, through `consentFanOut` —
 * the same function both step-2 surfaces use, so a bundle's audit record is the
 * same shape as every other registration's.
 */
export function BundleRegisterForm({ pageId, sectionId, bundleName = '', courseCount = 0 }) {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  /**
   * A REFUSAL THAT ARRIVED AT SUBMIT TIME, which is a real and ordinary state:
   * the page resolved the bundle when it rendered, and a round can roll off, an
   * author can close the bundle, or the page can be unpublished while the form
   * sits open in a tab. The server re-resolves on the way in and says so, and
   * this is where that answer is shown.
   *
   * Kept apart from `error` because the two mean different things: `error` is
   * "the request failed, try again", and this is "the thing you were asking for
   * is not available any more", which retrying cannot fix.
   */
  const [refused, setRefused] = useState(null);
  const [consented, setConsented] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm({
    resolver: zodResolver(bundleRegistrationSchema),
    defaultValues: { ...bundleRegistrationDefaults, pageId, sectionId },
    mode: 'onSubmit',
  });

  async function onSubmit(values) {
    setSubmitting(true);
    setError(null);
    setRefused(null);
    try {
      const res = await fetch('/api/registration/bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          // The pair goes from the PROPS, not from the form state: they are the
          // page's own answer and nothing on screen may edit them.
          pageId,
          sectionId,
          consent: consentFanOut(consented),
        }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setResult(json);
        return;
      }
      if (json?.error === 'bundle_refused') {
        setRefused(json.reason ?? 'unresolved_items');
        return;
      }
      setError(json?.message ?? 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section
        data-testid="bundle-submitted"
        className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-8 text-center"
      >
        <SuccessPulseIcon />
        <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">
          ได้รับคำขอใบเสนอราคาแล้ว
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          เลขอ้างอิง{' '}
          <span data-testid="bundle-ref-no" className="font-en font-bold text-[var(--text-primary)]">
            {result.referenceNumber}
          </span>
        </p>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          ทีมขายจะติดต่อกลับพร้อมใบเสนอราคาสำหรับ
          {bundleName ? ` “${bundleName}” ` : ' แพ็กเกจนี้ '}
          ({courseCount} หลักสูตร)
        </p>
      </section>
    );
  }

  if (refused) {
    /**
     * The SAME two sentences the page renders, from the same module. A silent
     * reason cannot reach here — the form only exists because the page resolved
     * the bundle — but if one ever did, it must not render as a blank panel, so
     * it falls to the unavailable wording rather than to nothing.
     */
    const closed = refused === 'closed';
    return (
      <section
        data-testid="bundle-refused-late"
        data-reason={refused}
        className="rounded-9e-lg border border-dashed border-[var(--surface-border)] px-6 py-10 text-center"
      >
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          {closed && !isSilentRefusal(refused) ? BUNDLE_CLOSED_MESSAGE : BUNDLE_UNAVAILABLE_MESSAGE}
        </h2>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          แพ็กเกจนี้เปลี่ยนสถานะระหว่างที่คุณกรอกแบบฟอร์ม จึงยังไม่ได้บันทึกคำขอของคุณ
        </p>
        <Link
          href="/contact-us"
          className="mt-5 inline-block text-sm font-semibold text-9e-action underline underline-offset-2"
        >
          ติดต่อทีมขาย
        </Link>
      </section>
    );
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
      <CoordinatorFields register={register} errors={errors} isSubmitted={isSubmitted} />

      <AttendeesList
        control={control}
        register={register}
        watch={watch}
        setValue={setValue}
        errors={errors}
        isSubmitted={isSubmitted}
      />

      <InvoiceFields register={register} watch={watch} setValue={setValue} errors={errors} />

      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">หมายเหตุเพิ่มเติม</h2>
        <Label className="sr-only" htmlFor="bundle-notes">หมายเหตุ</Label>
        <Textarea
          id="bundle-notes"
          rows={3}
          placeholder="เช่น ต้องการใบเสนอราคาในนามบริษัท หรือวันที่ที่ต้องการให้ออกเอกสาร (ไม่เกิน 500 ตัวอักษร)"
          maxLength={500}
          {...register('notes')}
        />
        {errors.notes?.message && (
          <p className="mt-1 text-xs text-red-500">{errors.notes.message}</p>
        )}
      </section>

      <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <label className="flex items-start gap-3 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            data-testid="bundle-consent"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>
            ข้าพเจ้าได้ตรวจสอบข้อมูลแล้ว และยินยอมให้ 9Expert Training
            ใช้ข้อมูลนี้เพื่อจัดทำใบเสนอราคาและติดต่อกลับ
          </span>
        </label>
      </section>

      {error && (
        <div data-testid="bundle-error" className="rounded-9e-md border border-red-300 bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-4 pt-2">
        <Button type="submit" variant="cta" disabled={submitting || !consented}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          ส่งคำขอใบเสนอราคา
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
