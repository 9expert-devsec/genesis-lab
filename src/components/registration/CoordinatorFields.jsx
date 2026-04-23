'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Coordinator section — the person filling out the form.
 *
 * Props:
 * - register: react-hook-form register fn
 * - errors:   react-hook-form errors object (nested under `coordinator`)
 */
export function CoordinatorFields({ register, errors }) {
  const err = errors?.coordinator ?? {};
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        ข้อมูลผู้ประสานงาน
      </h2>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        ผู้ติดต่อที่ 9Expert จะใช้ในการสื่อสารเรื่องการอบรมและใบแจ้งหนี้
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="ชื่อ" error={err.firstName?.message} required>
          <Input
            {...register('coordinator.firstName')}
            aria-invalid={!!err.firstName}
          />
        </FieldGroup>
        <FieldGroup label="นามสกุล" error={err.lastName?.message} required>
          <Input
            {...register('coordinator.lastName')}
            aria-invalid={!!err.lastName}
          />
        </FieldGroup>
        <FieldGroup label="อีเมล" error={err.email?.message} required>
          <Input
            type="email"
            {...register('coordinator.email')}
            aria-invalid={!!err.email}
          />
        </FieldGroup>
        <FieldGroup label="เบอร์โทร" error={err.phone?.message} required>
          <Input
            inputMode="tel"
            placeholder="0812345678"
            {...register('coordinator.phone')}
            aria-invalid={!!err.phone}
          />
        </FieldGroup>
        <FieldGroup
          label="LINE ID (ถ้ามี)"
          error={err.lineId?.message}
          className="sm:col-span-2"
        >
          <Input {...register('coordinator.lineId')} />
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
        {required && <span className="ml-0.5 text-9e-accent">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
  );
}
