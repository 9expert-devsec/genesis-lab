'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { digitsOnly } from '@/lib/registration/digitsOnly';
import { cn } from '@/lib/utils';

/**
 * The two Thai-tax controls that the public invoice block and the in-house
 * quotation block must NOT be allowed to drift apart on:
 *
 *   · TaxIdField   — 13 digits, filtered at the keystroke
 *   · BranchFields — สำนักงานใหญ่ / สาขาย่อย, plus a 5-digit code for the latter
 *
 * ── ONE COMPONENT, TWO CALL SITES, ONE PROP OF DIFFERENCE ───────────────────
 * The only thing that differs between the two forms is the field-name prefix:
 * the public wizard nests everything under `invoice.`, the in-house form does
 * not. That is `namePrefix`, and it is the whole of the difference — the
 * labels, the placeholder, the digit rules and the reveal condition are
 * identical, which is exactly the argument for sharing rather than copying.
 *
 * ── BOTH FIELDS ARE THAI-TAX CONCEPTS ───────────────────────────────────────
 * Neither is rendered for 'Other country': a foreign customer has no
 * 13-digit Thai tax id and no Revenue-Department branch number, and offering a
 * dropdown of Thai options to one is how a foreign invoice ends up saying
 * สำนักงานใหญ่. The callers gate on country; this file assumes Thailand.
 *
 * `errors` is the object that DIRECTLY holds `branchType` / `branchCode` /
 * `taxId` — the caller scopes it (errors.invoice for the wizard, errors for
 * in-house), because the prefix is a form-path concern and the errors tree is
 * already shaped.
 */

export function TaxIdField({ register, errors = {}, namePrefix = '', required = true }) {
  const name = `${namePrefix}taxId`;
  return (
    <FieldGroup label="เลขประจำตัวผู้เสียภาษี" required={required} error={errors.taxId?.message}>
      <Input
        // 13 in TWO places on purpose: maxLength stops the 14th keystroke in
        // the browser, digitsOnly stops a paste that the attribute does not.
        {...digitsOnly(register(name), 13)}
        placeholder="0000000000000"
        inputMode="numeric"
        maxLength={13}
        aria-invalid={!!errors.taxId}
      />
    </FieldGroup>
  );
}

export function BranchFields({ register, watch, setValue, errors = {}, namePrefix = '' }) {
  const typeName = `${namePrefix}branchType`;
  const codeName = `${namePrefix}branchCode`;

  // Default rather than '' so a lazily-created invoice object that predates
  // these fields still shows สำนักงานใหญ่ instead of an empty select.
  const branchType = watch(typeName) || 'head_office';
  const isSubBranch = branchType === 'branch';

  const handleTypeChange = (next) => {
    setValue(typeName, next, { shouldValidate: true });
    // Clearing on the way back to head office is not cosmetic. The code input
    // is HIDDEN in that state, so a value left behind would be unreachable —
    // the user could neither see it nor clear it — and it would ride along to
    // Mongo under a branchType that says it does not exist.
    if (next !== 'branch') setValue(codeName, '', { shouldValidate: true });
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FieldGroup label="สาขา" required error={errors.branchType?.message}>
        <select
          // Controlled via watch/setValue rather than register (the change
          // handler has to clear branchCode too), so `name` is set explicitly —
          // without it the field has no identity in the rendered markup at all.
          name={typeName}
          value={branchType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className={selectCls()}
          aria-invalid={!!errors.branchType}
        >
          <option value="head_office">สำนักงานใหญ่</option>
          <option value="branch">สาขาย่อย</option>
        </select>
      </FieldGroup>

      {isSubBranch && (
        <FieldGroup label="เลขที่สาขา" required error={errors.branchCode?.message}>
          <Input
            {...digitsOnly(register(codeName), 5)}
            placeholder="00001"
            inputMode="numeric"
            maxLength={5}
            aria-invalid={!!errors.branchCode}
          />
        </FieldGroup>
      )}
    </div>
  );
}

// ── Shared atoms ────────────────────────────────────────────────────────────

function selectCls() {
  return cn(
    'h-11 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand',
    'aria-[invalid=true]:border-red-500'
  );
}

function FieldGroup({ label, error, required, children }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
