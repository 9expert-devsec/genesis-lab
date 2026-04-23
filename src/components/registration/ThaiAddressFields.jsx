'use client';

import { useMemo } from 'react';
import { CreateInput } from 'thai-address-autocomplete-react';
import { Label } from '@/components/ui/label';

/**
 * Thai address input — 1 free-text line + 4 autocomplete dropdowns
 * (ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์). Selecting any suggestion
 * auto-fills the other three.
 *
 * The underlying package (`thai-address-autocomplete-react`) wraps
 * Antd's AutoComplete and exposes its own field names:
 *   district → ตำบล  (our schema: subDistrict)
 *   amphoe   → อำเภอ  (our schema: district)
 *   province → จังหวัด (our schema: province)
 *   zipcode  → รหัสไปรษณีย์ (our schema: postalCode)
 *
 * We adapt at the component boundary; downstream code sees our
 * canonical names.
 *
 * Props:
 * - value:    { addressLine, subDistrict, district, province, postalCode }
 * - onChange: (next) => void — fires on every edit
 * - errors:   RHF errors object scoped to the parent (e.g. errors.invoice)
 * - prefix:   key under `errors` where address errors live (default: 'address')
 */
export function ThaiAddressFields({ value, onChange, errors, prefix = 'address' }) {
  // One InputThaiAddress instance per component mount
  const Input = useMemo(() => CreateInput(), []);

  const update = (key) => (next) => {
    onChange({ ...value, [key]: next });
  };

  // When autocomplete selects a full address, fill the four fields
  // together. Our schema naming differs from the package's — map here.
  const handleSelect = (selected) => {
    onChange({
      ...value,
      subDistrict: selected.district ?? '',
      district:    selected.amphoe ?? '',
      province:    selected.province ?? '',
      postalCode:  selected.zipcode ?? '',
    });
  };

  const err = (k) => errors?.[prefix]?.[k]?.message;

  const autoCompleteClass =
    'mt-1 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)]';

  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="addressLine" className="mb-1.5 block">
          ที่อยู่ <span className="text-9e-accent">*</span>
        </Label>
        <input
          id="addressLine"
          type="text"
          value={value.addressLine}
          onChange={(e) => update('addressLine')(e.target.value)}
          className="h-11 w-full rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus-visible:border-9e-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-9e-brand"
          placeholder="บ้านเลขที่ หมู่ ถนน"
        />
        {err('addressLine') && (
          <p className="mt-1 text-xs text-9e-accent">{err('addressLine')}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label className="mb-1.5 block">
            แขวง / ตำบล <span className="text-9e-accent">*</span>
          </Label>
          <Input.District
            value={value.subDistrict}
            onChange={update('subDistrict')}
            onSelect={handleSelect}
            className={autoCompleteClass}
            autoCompleteProps={{ placeholder: 'แขวง / ตำบล' }}
          />
          {err('subDistrict') && (
            <p className="mt-1 text-xs text-9e-accent">{err('subDistrict')}</p>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block">
            เขต / อำเภอ <span className="text-9e-accent">*</span>
          </Label>
          <Input.Amphoe
            value={value.district}
            onChange={update('district')}
            onSelect={handleSelect}
            className={autoCompleteClass}
            autoCompleteProps={{ placeholder: 'เขต / อำเภอ' }}
          />
          {err('district') && (
            <p className="mt-1 text-xs text-9e-accent">{err('district')}</p>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block">
            จังหวัด <span className="text-9e-accent">*</span>
          </Label>
          <Input.Province
            value={value.province}
            onChange={update('province')}
            onSelect={handleSelect}
            className={autoCompleteClass}
            autoCompleteProps={{ placeholder: 'จังหวัด' }}
          />
          {err('province') && (
            <p className="mt-1 text-xs text-9e-accent">{err('province')}</p>
          )}
        </div>

        <div>
          <Label className="mb-1.5 block">
            รหัสไปรษณีย์ <span className="text-9e-accent">*</span>
          </Label>
          <Input.Zipcode
            value={value.postalCode}
            onChange={update('postalCode')}
            onSelect={handleSelect}
            className={autoCompleteClass}
            autoCompleteProps={{ placeholder: 'รหัสไปรษณีย์' }}
          />
          {err('postalCode') && (
            <p className="mt-1 text-xs text-9e-accent">{err('postalCode')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
