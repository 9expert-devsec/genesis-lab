'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDataForZipCode } from 'thai-data';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Thai address input — zip-code-first autocomplete.
 *
 * UX flow:
 *   1. User enters รหัสไปรษณีย์ (5 digits)
 *   2. Valid zip → auto-fills เขต/อำเภอ and จังหวัด, populates
 *      แขวง/ตำบล dropdown
 *   3. User picks แขวง/ตำบล from the dropdown
 *   4. Each field remains manually editable after autofill
 *
 * Uses `thai-data` (zero runtime deps, 77 provinces, 978 zip codes)
 * instead of the Antd-based thai-address-autocomplete-react which is
 * incompatible with React 19.
 *
 * Props:
 * - value:    { addressLine, subDistrict, district, province, postalCode }
 * - onChange: (next) => void
 * - errors:   RHF errors object scoped to the parent
 * - prefix:   key under errors where address errors live (default: 'address')
 */
export function ThaiAddressFields({ value, onChange, errors, prefix = 'address' }) {
  // subDistrict options derived from the current postalCode
  const [subDistrictOptions, setSubDistrictOptions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const err = (k) => errors?.[prefix]?.[k]?.message;

  const update = useCallback(
    (key, val) => onChange({ ...value, [key]: val }),
    [value, onChange]
  );

  // When postalCode reaches 5 digits, look up district + province and
  // populate the subDistrict dropdown. Clear derived fields on invalid zip.
  useEffect(() => {
    const zip = (value.postalCode ?? '').trim();
    if (zip.length !== 5) {
      setSubDistrictOptions([]);
      return;
    }
    const entry = getDataForZipCode(zip);
    if (!entry) {
      setSubDistrictOptions([]);
      return;
    }

    const district = entry.districtList?.[0]?.districtName ?? '';
    const province = entry.provinceList?.[0]?.provinceName ?? '';
    const subs     = entry.subDistrictList?.map((s) => s.subDistrictName) ?? [];

    setSubDistrictOptions(subs);

    // Auto-fill เขต/อำเภอ and จังหวัด (preserve existing subDistrict if
    // it still appears in the new zip's list, otherwise clear it)
    const currentSub = value.subDistrict ?? '';
    onChange({
      ...value,
      postalCode:  zip,
      district,
      province,
      subDistrict: subs.includes(currentSub) ? currentSub : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.postalCode]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectSubDistrict = (name) => {
    update('subDistrict', name);
    setShowDropdown(false);
  };

  const inputCls = cn(
    'h-11 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );

  return (
    <div className="grid gap-4">
      {/* ── ที่อยู่ ──────────────────────────────────────── */}
      <FieldGroup label="ที่อยู่" error={err('addressLine')} required>
        <input
          type="text"
          value={value.addressLine ?? ''}
          onChange={(e) => update('addressLine', e.target.value)}
          className={inputCls}
          placeholder="บ้านเลขที่ หมู่ ถนน อาคาร"
        />
      </FieldGroup>

      {/* ── Zip → auto-fills district + province ─────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldGroup label="รหัสไปรษณีย์" error={err('postalCode')} required>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={value.postalCode ?? ''}
            onChange={(e) => update('postalCode', e.target.value.replace(/\D/g, ''))}
            className={inputCls}
            placeholder="เช่น 10400"
          />
        </FieldGroup>

        {/* ── แขวง / ตำบล with dropdown ────────────────── */}
        <FieldGroup label="แขวง / ตำบล" error={err('subDistrict')} required>
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              value={value.subDistrict ?? ''}
              onChange={(e) => {
                update('subDistrict', e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => subDistrictOptions.length > 0 && setShowDropdown(true)}
              className={inputCls}
              placeholder={subDistrictOptions.length > 0 ? 'เลือกหรือพิมพ์' : 'กรอกรหัสไปรษณีย์ก่อน'}
              readOnly={subDistrictOptions.length === 0}
              aria-haspopup="listbox"
              aria-expanded={showDropdown}
            />

            {showDropdown && subDistrictOptions.length > 0 && (
              <ul
                role="listbox"
                className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] shadow-9e-md"
              >
                {subDistrictOptions
                  .filter((s) =>
                    !value.subDistrict ||
                    s.includes(value.subDistrict)
                  )
                  .map((name) => (
                    <li
                      key={name}
                      role="option"
                      aria-selected={value.subDistrict === name}
                      onMouseDown={() => handleSelectSubDistrict(name)}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-sm',
                        value.subDistrict === name
                          ? 'bg-9e-brand/10 font-medium text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]'
                      )}
                    >
                      {name}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </FieldGroup>

        {/* ── เขต / อำเภอ — autofilled ──────────────────── */}
        <FieldGroup label="เขต / อำเภอ" error={err('district')} required>
          <input
            type="text"
            value={value.district ?? ''}
            onChange={(e) => update('district', e.target.value)}
            className={inputCls}
            placeholder="อัตโนมัติเมื่อกรอกรหัสไปรษณีย์"
          />
        </FieldGroup>

        {/* ── จังหวัด — autofilled ─────────────────────── */}
        <FieldGroup label="จังหวัด" error={err('province')} required>
          <input
            type="text"
            value={value.province ?? ''}
            onChange={(e) => update('province', e.target.value)}
            className={inputCls}
            placeholder="อัตโนมัติเมื่อกรอกรหัสไปรษณีย์"
          />
        </FieldGroup>
      </div>
    </div>
  );
}

// ── Shared atom ─────────────────────────────────────────────────

function FieldGroup({ label, error, required, children }) {
  return (
    <div>
      <Label className="mb-1.5 block">
        {label}
        {required && <span className="ml-0.5 text-9e-accent">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
  );
}