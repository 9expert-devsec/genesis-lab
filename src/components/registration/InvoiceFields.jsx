'use client';

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThaiAddressFields } from './ThaiAddressFields';
import { cn } from '@/lib/utils';

const EMPTY_THAI_ADDRESS = {
  addressLine: '',
  subDistrict: '',
  district: '',
  province: '',
  postalCode: '',
};

const EMPTY_INTL_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

/**
 * Invoice / quotation section.
 *
 * Renders a country selector that switches between:
 *   - 'TH'    → ThaiAddressFields (autocomplete) + 13-digit tax ID required
 *   - 'OTHER' → InternationalAddressFields (free-text) + tax ID optional
 *
 * Identity fields (name / company) adapt their labels to invoice.type.
 *
 * Props: register, watch, setValue, errors  (react-hook-form bindings)
 */
export function InvoiceFields({ register, watch, setValue, errors }) {
  const invoiceType    = watch('invoice.type')    || 'individual';
  const invoiceCountry = watch('invoice.country') || 'TH';
  const isThai         = invoiceCountry === 'TH';

  const thaiAddress  = watch('invoice.thaiAddress')          || EMPTY_THAI_ADDRESS;
  const intlAddress  = watch('invoice.internationalAddress') || EMPTY_INTL_ADDRESS;

  // Backfill defaults on mount if the invoice object was lazily initialised
  // without country or address sub-objects.
  useEffect(() => {
    if (!watch('invoice.type'))    setValue('invoice.type',    'individual', { shouldValidate: false });
    if (!watch('invoice.country')) setValue('invoice.country', 'TH',         { shouldValidate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When country changes, reset both address sub-objects to empty so stale
  // data from the previous country does not leak into the submission.
  const handleCountryChange = (next) => {
    setValue('invoice.country',              next,                { shouldValidate: false });
    setValue('invoice.thaiAddress',          EMPTY_THAI_ADDRESS,  { shouldValidate: false });
    setValue('invoice.internationalAddress', EMPTY_INTL_ADDRESS,  { shouldValidate: false });
  };

  const handleThaiAddressChange = (next) => {
    setValue('invoice.thaiAddress', next, { shouldValidate: true });
  };

  const handleIntlAddressChange = (key) => (e) => {
    setValue(`invoice.internationalAddress.${key}`, e.target.value, { shouldValidate: true });
  };

  const invErr = errors?.invoice ?? {};

  // Dynamic label text based on invoice type (individual vs corporate)
  const nameLabelTH    = invoiceType === 'corporate' ? 'ชื่อบริษัทสำหรับออกใบเสนอราคา' : 'ชื่อ-นามสกุลสำหรับออกใบเสนอราคา';
  const nameLabelOther = invoiceType === 'corporate' ? 'Company name' : 'Full name';

  return (
    <section className="space-y-5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <header>
        <h2 className="text-base font-bold text-[var(--text-primary)]">
          ข้อมูลสำหรับออกใบเสนอราคา
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          ใช้สำหรับออกใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี
        </p>
      </header>

      {/* ── Country + Type row ──────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="ประเภทลูกค้า" required>
          <select
            {...register('invoice.type')}
            className={selectCls()}
          >
            <option value="individual">บุคคลทั่วไป / Individual</option>
            <option value="corporate">บริษัท / องค์กร / Company</option>
          </select>
        </FieldGroup>

        <FieldGroup label="ประเทศ / Country" required>
          <select
            value={invoiceCountry}
            onChange={(e) => handleCountryChange(e.target.value)}
            className={selectCls()}
          >
            <option value="TH">Thailand</option>
            <option value="OTHER">Other country</option>
          </select>
        </FieldGroup>
      </div>

      {/* ── Identity fields ─────────────────────────────────── */}
      {invoiceType === 'individual' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldGroup
            label={isThai ? 'ชื่อ' : 'First name'}
            error={invErr.firstName?.message}
            required
          >
            <Input
              {...register('invoice.firstName')}
              placeholder={isThai ? 'ชื่อ' : 'First name'}
              aria-invalid={!!invErr.firstName}
            />
          </FieldGroup>
          <FieldGroup
            label={isThai ? 'นามสกุล' : 'Last name'}
            error={invErr.lastName?.message}
            required
          >
            <Input
              {...register('invoice.lastName')}
              placeholder={isThai ? 'นามสกุล' : 'Last name'}
              aria-invalid={!!invErr.lastName}
            />
          </FieldGroup>
        </div>
      )}

      {invoiceType === 'corporate' && (
        <div className="grid gap-4">
          <FieldGroup
            label={isThai ? nameLabelTH : nameLabelOther}
            error={invErr.companyName?.message}
            required
          >
            <Input
              {...register('invoice.companyName')}
              placeholder={isThai ? 'เช่น บริษัท ตัวอย่าง จำกัด' : 'Company Inc.'}
              aria-invalid={!!invErr.companyName}
            />
          </FieldGroup>
          <FieldGroup label={isThai ? 'สาขา (ถ้ามี)' : 'Branch / Division (optional)'}>
            <Input
              {...register('invoice.branch')}
              placeholder={isThai ? 'สำนักงานใหญ่' : 'Head office'}
            />
          </FieldGroup>
        </div>
      )}

      {/* ── Tax ID ──────────────────────────────────────────── */}
      <FieldGroup
        label={
          isThai
            ? 'เลขประจำตัวผู้เสียภาษี'
            : 'Tax ID / VAT ID / Business registration no.'
        }
        error={invErr.taxId?.message}
        required={isThai}
        hint={!isThai ? 'Optional for international customers' : undefined}
      >
        <Input
          {...register('invoice.taxId')}
          placeholder={isThai ? '0000000000000' : 'Optional'}
          inputMode={isThai ? 'numeric' : 'text'}
          maxLength={isThai ? 13 : undefined}
          aria-invalid={!!invErr.taxId}
        />
      </FieldGroup>

      {/* ── Address — conditional on country ───────────────── */}
      {isThai ? (
        <ThaiAddressFields
          value={thaiAddress}
          onChange={handleThaiAddressChange}
          errors={invErr}
          prefix="thaiAddress"
        />
      ) : (
        <InternationalAddressFields
          value={intlAddress}
          onChange={handleIntlAddressChange}
          errors={invErr.internationalAddress ?? {}}
        />
      )}
    </section>
  );
}

// ── International address fields ────────────────────────────────

function InternationalAddressFields({ value, onChange, errors }) {
  return (
    <div className="grid gap-4">
      <FieldGroup label="Address line 1" error={errors.line1?.message} required>
        <Input
          value={value.line1}
          onChange={onChange('line1')}
          placeholder="Street address"
          aria-invalid={!!errors.line1}
        />
      </FieldGroup>
      <FieldGroup label="Address line 2 (optional)" error={errors.line2?.message}>
        <Input
          value={value.line2}
          onChange={onChange('line2')}
          placeholder="Apartment, suite, building, floor, etc."
        />
      </FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="City" error={errors.city?.message} required>
          <Input
            value={value.city}
            onChange={onChange('city')}
            placeholder="City"
            aria-invalid={!!errors.city}
          />
        </FieldGroup>
        <FieldGroup label="State / Province / Region (optional)" error={errors.state?.message}>
          <Input
            value={value.state}
            onChange={onChange('state')}
            placeholder="State or region"
          />
        </FieldGroup>
        <FieldGroup label="Postal code (optional)" error={errors.postalCode?.message}>
          <Input
            value={value.postalCode}
            onChange={onChange('postalCode')}
            placeholder="Postal code"
          />
        </FieldGroup>
        <FieldGroup label="Country" error={errors.country?.message} required>
          <Input
            value={value.country}
            onChange={onChange('country')}
            placeholder="e.g. Singapore"
            aria-invalid={!!errors.country}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────

function selectCls() {
  return cn(
    'h-11 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );
}

function FieldGroup({ label, error, required, hint, children, className }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-0.5 text-9e-accent">*</span>}
      </Label>
      {children}
      {hint && <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
  );
}