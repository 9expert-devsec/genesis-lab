'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { phoneInputProps } from '@/lib/registration/phoneInputProps';
import { useRevealFieldError } from '@/lib/registration/useRevealFieldError';

/**
 * Coordinator section — the person filling out the form.
 *
 * Props:
 * - register:     react-hook-form register fn
 * - errors:       react-hook-form errors object (nested under `coordinator`)
 * - isSubmitted:  react-hook-form formState.isSubmitted — reveals the phone
 *                 field's error immediately on a submit attempt, same as
 *                 every other field already does; see useRevealFieldError.
 */
export function CoordinatorFields({ register, errors, isSubmitted }) {
  const err = errors?.coordinator ?? {};
  const phoneProps = phoneInputProps(register('coordinator.phone'));
  const phoneReveal = useRevealFieldError(isSubmitted);
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        ข้อมูลผู้ประสานงาน
      </h2>
      {/* <p className="mb-4 text-xs text-[var(--text-secondary)]">
        ผู้ติดต่อที่ 9Expert จะใช้ในการสื่อสารเรื่องการอบรมและใบแจ้งหนี้
      </p> */}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="ชื่อ" error={err.firstName?.message} required>
          <Input
            placeholder="กรุณากรอกชื่อ"
            {...register('coordinator.firstName')}
            aria-invalid={!!err.firstName}
          />
        </FieldGroup>
        <FieldGroup label="นามสกุล" error={err.lastName?.message} required>
          <Input
            placeholder="กรุณากรอกนามสกุล"
            {...register('coordinator.lastName')}
            aria-invalid={!!err.lastName}
          />
        </FieldGroup>
        <FieldGroup label="อีเมล" error={err.email?.message} required>
          <Input
            type="email"
            placeholder="example@email.com"
            {...register('coordinator.email')}
            aria-invalid={!!err.email}
          />
        </FieldGroup>
        <FieldGroup label="เบอร์โทร" error={phoneReveal.shouldShow ? err.phone?.message : undefined} required>
          <Input
            placeholder="เช่น 0812345678 หรือ 02-219-4304 ต่อ 1234"
            {...phoneProps}
            onBlur={(e) => { phoneProps.onBlur(e); phoneReveal.reveal(); }}
            aria-invalid={phoneReveal.shouldShow && !!err.phone}
          />
        </FieldGroup>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2">
        <Checkbox {...register('coordinator.isAttending')} />
        <span className="text-sm text-[var(--text-primary)]">
          ผู้ประสานงานเป็นผู้เข้าอบรม
        </span>
      </label>
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
