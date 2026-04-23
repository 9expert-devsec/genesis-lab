'use client';

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThaiAddressFields } from './ThaiAddressFields';

const EMPTY_ADDRESS = {
  addressLine: '',
  subDistrict: '',
  district: '',
  province: '',
  postalCode: '',
};

/**
 * Invoice section: type radio → conditional identity fields → tax ID
 * → structured Thai address. Revealed when the parent form's
 * `requestInvoice` is true.
 *
 * Props:
 * - register, watch, setValue: react-hook-form bindings
 * - errors: RHF error tree
 */
export function InvoiceFields({ register, watch, setValue, errors }) {
  const type = watch('invoice.type') || 'individual';
  const address = watch('invoice.address') || EMPTY_ADDRESS;

  // Backfill a default `type` on mount if the parent lazily initialized
  // invoice without one.
  useEffect(() => {
    if (!watch('invoice.type')) {
      setValue('invoice.type', 'individual', { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddressChange = (next) => {
    setValue('invoice.address', next, { shouldValidate: true });
  };

  const invErr = errors?.invoice ?? {};

  return (
    <section className="space-y-5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <header>
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          ใบกำกับภาษี / ใบเสร็จรับเงิน
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          เลือกประเภทและกรอกข้อมูลให้ครบเพื่อออกเอกสารทางการเงิน
        </p>
      </header>

      <div>
        <Label className="mb-2 block">
          ประเภท <span className="text-9e-accent">*</span>
        </Label>
        <div className="flex gap-6">
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="individual"
              {...register('invoice.type')}
              className="h-4 w-4 accent-9e-brand"
            />
            บุคคลทั่วไป
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="radio"
              value="corporate"
              {...register('invoice.type')}
              className="h-4 w-4 accent-9e-brand"
            />
            นิติบุคคล / บริษัท
          </label>
        </div>
      </div>

      {type === 'individual' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="invoice.firstName" className="mb-1.5 block">
              ชื่อ <span className="text-9e-accent">*</span>
            </Label>
            <Input
              id="invoice.firstName"
              {...register('invoice.firstName')}
              placeholder="ชื่อ"
              aria-invalid={!!invErr.firstName}
            />
            {invErr.firstName && (
              <p className="mt-1 text-xs text-9e-accent">{invErr.firstName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="invoice.lastName" className="mb-1.5 block">
              นามสกุล <span className="text-9e-accent">*</span>
            </Label>
            <Input
              id="invoice.lastName"
              {...register('invoice.lastName')}
              placeholder="นามสกุล"
              aria-invalid={!!invErr.lastName}
            />
            {invErr.lastName && (
              <p className="mt-1 text-xs text-9e-accent">{invErr.lastName.message}</p>
            )}
          </div>
        </div>
      )}

      {type === 'corporate' && (
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="invoice.companyName" className="mb-1.5 block">
              ชื่อบริษัท <span className="text-9e-accent">*</span>
            </Label>
            <Input
              id="invoice.companyName"
              {...register('invoice.companyName')}
              placeholder="ชื่อบริษัท"
              aria-invalid={!!invErr.companyName}
            />
            {invErr.companyName && (
              <p className="mt-1 text-xs text-9e-accent">{invErr.companyName.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="invoice.branch" className="mb-1.5 block">
              สาขา (ถ้ามี)
            </Label>
            <Input
              id="invoice.branch"
              {...register('invoice.branch')}
              placeholder="สำนักงานใหญ่"
            />
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="invoice.taxId" className="mb-1.5 block">
          เลขประจำตัวผู้เสียภาษี <span className="text-9e-accent">*</span>
        </Label>
        <Input
          id="invoice.taxId"
          {...register('invoice.taxId')}
          placeholder="0000000000000"
          inputMode="numeric"
          maxLength={13}
          aria-invalid={!!invErr.taxId}
        />
        {invErr.taxId && (
          <p className="mt-1 text-xs text-9e-accent">{invErr.taxId.message}</p>
        )}
      </div>

      <ThaiAddressFields
        value={address}
        onChange={handleAddressChange}
        errors={invErr}
        prefix="address"
      />
    </section>
  );
}
