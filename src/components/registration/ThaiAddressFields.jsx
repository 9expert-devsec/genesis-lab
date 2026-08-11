'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getDataForZipCode } from 'thai-data';
import {
  subDistrictFieldState,
  SUB_DISTRICT_MANUAL,
} from '@/lib/address/subDistrictFieldState';
import { gtagEvent } from '@/lib/analytics/gtag';
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
 * ── AND WHEN THE ZIP IS NOT IN THE DATASET ──────────────────────────────────
 * Step 4 used to be false exactly where it mattered. แขวง/ตำบล was
 * `readOnly={subDistrictOptions.length === 0}` while the schemas require it, so
 * a postcode the dataset does not cover gave a field that could be neither
 * filled nor skipped — the form was unfinishable. A customer hit this on a
 * masterclass registration.
 *
 * The field now has three states, decided in lib/address/subDistrictFieldState:
 * `locked` below five digits (unchanged), `select` when options exist
 * (unchanged), and `manual` when five digits produce none — typeable, with a
 * hint. The requirement is untouched; the value became enterable.
 *
 * "No options" is the key, not "lookup returned null": 24 of the 978 records in
 * thai-data@3.0.2 exist with `subDistrictList: null`, so an unknown postcode
 * and one of those 24 reach the same dead end by different routes.
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

  /**
   * locked / select / manual — the whole point of the fix, decided in one pure
   * place (lib/address/subDistrictFieldState) so it can be tested without a
   * DOM. `manual` is what stops a postcode the dataset does not cover from
   * producing a field that is read-only AND required at the same time.
   */
  const subDistrictField = subDistrictFieldState({
    postalCode: value.postalCode,
    optionCount: subDistrictOptions.length,
  });
  const hintId = `${prefix}-subdistrict-hint`;

  /**
   * WHICH POSTCODE MISSED, and nothing else.
   *
   * The original complaint was "a customer could not enter their address" and
   * took a full investigation to turn into a postcode. This one number answers
   * it in seconds, and tells the two causes apart:
   *
   *   absent              the dataset has no such key
   *   present_but_empty   the key exists carrying nulls — 24 of the 978 records
   *                       in thai-data@3.0.2 are like this
   *
   * WHAT IS DELIBERATELY NOT SENT: nothing else from the form. No name, email,
   * phone, company, course, or order value. A postcode alone identifies an area
   * of thousands of people; joined to a name it would identify a person, and
   * this event fires on the ONE path where the customer is already having a bad
   * time. The two params below are the whole payload, and an fs guard pins that.
   *
   * Rides the existing `gtagEvent` — no new endpoint, route or dependency. It
   * no-ops when gtag is absent and never throws (see lib/analytics/gtag.js).
   *
   * ON READING THE DATA: a new GA4 event parameter is not queryable in standard
   * reports until it is registered as a custom dimension in the property. Until
   * someone does that it shows up in DebugView, Realtime and the BigQuery
   * export only. An empty standard report is EXPECTED and is not a bug here.
   */
  const reportedMissRef = useRef(null);
  useEffect(() => {
    if (subDistrictField.state !== SUB_DISTRICT_MANUAL) return;

    const zip = String(value.postalCode ?? '').replace(/\D/g, '');
    // Once per postcode: this effect re-runs on every keystroke in the other
    // address fields, and a miss is one event, not one per character.
    if (!zip || reportedMissRef.current === zip) return;
    reportedMissRef.current = zip;

    gtagEvent('postcode_lookup_miss', {
      postal_code: zip,
      miss_route: getDataForZipCode(zip) ? 'present_but_empty' : 'absent',
    });
  }, [subDistrictField.state, value.postalCode]);

  const update = useCallback(
    (key, val) => onChange({ ...value, [key]: val }),
    [value, onChange]
  );

  /**
   * Drop the three fields the postcode lookup owns.
   *
   * Only called from the postcode effect, which is keyed on `value.postalCode`
   * alone — so typing into แขวง/ตำบล in `manual` state cannot re-enter here and
   * erase what is being typed.
   */
  const clearDerived = useCallback(() => {
    if (!value.subDistrict && !value.district && !value.province) return;
    onChange({ ...value, subDistrict: '', district: '', province: '' });
  }, [value, onChange]);

  // When postalCode reaches 5 digits, look up district + province and
  // populate the subDistrict dropdown. Clear derived fields on invalid zip.
  useEffect(() => {
    const zip = (value.postalCode ?? '').trim();

    /**
     * A ZIP THAT ANSWERS NOTHING MUST ALSO CLEAR WHAT THE LAST ONE ANSWERED.
     *
     * Both of these paths used to `return` early WITHOUT touching
     * district/province/subDistrict, so the values filled in for a PREVIOUS
     * postcode survived underneath the new one and were submitted with it — a
     * แขวง/ตำบล belonging to a different province, and no way to see it because
     * the fields still looked correctly filled.
     *
     * The 24 present-but-empty records already cleared correctly by accident
     * (their districtList is null, so the assignment below writes ''); the
     * incomplete-zip and unknown-zip paths did not. Now all three agree.
     */
    if (zip.length !== 5) {
      setSubDistrictOptions([]);
      clearDerived();
      return;
    }
    const entry = getDataForZipCode(zip);
    if (!entry) {
      setSubDistrictOptions([]);
      clearDerived();
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
              placeholder={subDistrictField.placeholder}
              readOnly={subDistrictField.readOnly}
              aria-haspopup="listbox"
              aria-expanded={showDropdown}
              aria-describedby={subDistrictField.hint ? hintId : undefined}
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

        {/* Only rendered in `manual`. Says the postcode was not found and that
            the three fields below are now the admin's to fill — without it the
            field simply becomes typeable and nothing explains why. */}
        {subDistrictField.hint && (
          <p id={hintId} className="-mt-2 text-xs text-amber-700 sm:col-span-2">
            {subDistrictField.hint}
          </p>
        )}

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
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}