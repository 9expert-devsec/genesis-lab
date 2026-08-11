'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { lookupPostcode, unambiguousLocation } from '@/lib/address/postcodeIndex';
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
 * "No options" is the key, not "lookup returned null". Under thai-data those
 * were two different routes to the same dead end — 24 of its 978 records existed
 * as keys carrying nulls. This dataset has no hollow records, so `manual` is now
 * reachable only for a postcode genuinely absent from the file; keying on the
 * option count stays correct and stops the distinction ever mattering again.
 *
 * ── THE DISTRICT IS NO LONGER GUESSED ───────────────────────────────────────
 * This component used to fill `districtList[0]` / `provinceList[0]` and never
 * revise them. That is right only when a postcode has ONE district, and 168 of
 * the 966 do not (11 span two PROVINCES). On 10110 it filled เขตคลองเตย while
 * offering แขวงพระโขนงเหนือ, which is in เขตวัฒนา — an address that does not
 * exist, submitted looking perfectly filled.
 *
 * Now every option carries its OWN district and province (see
 * lib/address/postcodeIndex), and choosing one sets all three together. Before a
 * choice is made, an ambiguous postcode fills NOTHING: a wrong-but-confident
 * district is worse than a blank one, because a blank field asks to be
 * completed and a filled one does not. The 798 unambiguous postcodes auto-fill
 * on the fifth digit exactly as before.
 *
 * Props:
 * - value:    { addressLine, subDistrict, district, province, postalCode }
 * - onChange: (next) => void
 * - errors:   RHF errors object scoped to the parent
 * - prefix:   key under errors where address errors live (default: 'address')
 */
export function ThaiAddressFields({ value, onChange, errors, prefix = 'address' }) {
  // subDistrict options derived from the current postalCode
  // Options are OBJECTS — { subDistrict, district, province } — not names. The
  // district travels with the option so choosing one cannot pick up another's.
  const [subDistrictOptions, setSubDistrictOptions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  // B7: set when a choice overwrote a district/province the customer had typed.
  const [correctedByChoice, setCorrectedByChoice] = useState(false);
  const dropdownRef = useRef(null);

  // More than one district behind this postcode — 168 of the 966. Drives both
  // the blank-until-chosen behaviour and the district shown beside each option,
  // since two แขวง in one postcode can otherwise be indistinguishable.
  const spansSeveralDistricts =
    new Set(subDistrictOptions.map((o) => o.district)).size > 1;

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
   * it in seconds, and it is the number that feeds the dataset's maintenance:
   * a postcode reported here is one to add to thailand_postcode_2026.json.
   *
   * ── `miss_route` IS GONE, ON PURPOSE ────────────────────────────────────────
   * It distinguished `absent` from `present_but_empty`, and that distinction
   * existed only because thai-data had 24 records that were keys carrying nulls.
   * This dataset has none — every key holds at least one subdistrict, which a
   * test pins — so the parameter had exactly ONE reachable value. A parameter
   * whose other branch cannot fire carries no information and actively misleads:
   * the next reader sees two routes named and believes the distinction is still
   * live. Dropped rather than kept as a constant.
   *
   * Its GA4 custom dimension, if someone registered one, becomes dead but
   * harmless — no data flows to it, nothing errors, and it can be retired in the
   * property whenever convenient.
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
     * Under thai-data there were three routes here and only one cleared
     * correctly, by accident: its 24 present-but-empty records wrote '' because
     * their lists were null, while the incomplete-zip and unknown-zip paths
     * returned untouched. This dataset has no hollow records, so two routes
     * remain and BOTH clear explicitly — pinned by a test that counts the
     * clearDerived() calls, because "it happens to work out" is what the third
     * route taught us not to rely on.
     */
    if (zip.length !== 5) {
      setSubDistrictOptions([]);
      setCorrectedByChoice(false);
      clearDerived();
      return;
    }
    const options = lookupPostcode(zip);
    if (options.length === 0) {
      setSubDistrictOptions([]);
      setCorrectedByChoice(false);
      clearDerived();
      return;
    }

    setSubDistrictOptions(options);
    setCorrectedByChoice(false);

    // Keep the chosen แขวง/ตำบล only if this postcode still serves it — and take
    // its district/province from THAT option, not from the postcode, so a
    // surviving choice cannot keep a stale district.
    const currentSub = value.subDistrict ?? '';
    const surviving = options.find((o) => o.subDistrict === currentSub);

    // `null` when the postcode spans several districts. Nothing is filled in
    // that case: the choice fills it, below.
    const settled = unambiguousLocation(zip);

    onChange({
      ...value,
      postalCode:  zip,
      subDistrict: surviving ? currentSub : '',
      district:    surviving ? surviving.district : (settled?.district ?? ''),
      province:    surviving ? surviving.province : (settled?.province ?? ''),
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

  /**
   * ONE CHOICE, THREE FIELDS — and it OVERWRITES a hand-typed district.
   *
   * Choosing a แขวง/ตำบล IS choosing its district and province: the list entry
   * means "this tambon, in this district, in this province". Writing only
   * `subDistrict` and leaving a district the customer typed would submit a pair
   * the dataset says cannot coexist — the same invented address as the old
   * `districtList[0]` bug, reached from the other side. So the option wins.
   *
   * BUT NOT SILENTLY. The 168 ambiguous postcodes now leave เขต/อำเภอ blank,
   * which invites typing it by hand, and quietly replacing what someone
   * deliberately entered is its own harm. When the choice actually changes a
   * non-empty district or province, `correctedByChoice` renders a line saying
   * so. Overwriting is the correct data; telling them is what stops it being a
   * clobber.
   *
   * Nothing to say when the field was blank (the normal path) or when the typed
   * value already agreed — the note fires only on a real disagreement.
   */
  const handleSelectSubDistrict = (option) => {
    const changedSomethingTyped =
      (!!value.district && value.district !== option.district) ||
      (!!value.province && value.province !== option.province);

    onChange({
      ...value,
      subDistrict: option.subDistrict,
      district:    option.district,
      province:    option.province,
    });
    setCorrectedByChoice(changedSomethingTyped);
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
                  .filter((o) =>
                    !value.subDistrict ||
                    o.subDistrict.includes(value.subDistrict)
                  )
                  .map((o) => (
                    <li
                      // Keyed on both: one postcode can serve the same แขวง name
                      // in two districts, and a name-only key would collapse them.
                      key={`${o.subDistrict}|${o.district}`}
                      role="option"
                      aria-selected={value.subDistrict === o.subDistrict}
                      onMouseDown={() => handleSelectSubDistrict(o)}
                      className={cn(
                        'cursor-pointer px-3 py-2 text-sm',
                        value.subDistrict === o.subDistrict
                          ? 'bg-9e-brand/10 font-medium text-[var(--text-primary)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--surface-muted)]'
                      )}
                    >
                      {o.subDistrict}
                      {/* Only where it disambiguates. On the 798 single-district
                          postcodes it would be the same line under every option. */}
                      {spansSeveralDistricts && (
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          {o.district}
                        </span>
                      )}
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

        {/* B7: the choice replaced something the customer had typed. Says so
            rather than letting the value change under them — see
            handleSelectSubDistrict. Not an error: the new value is the correct
            one, and this explains where it came from. */}
        {correctedByChoice && (
          <p className="-mt-2 text-xs text-[var(--text-secondary)] sm:col-span-2">
            อัปเดต เขต/อำเภอ และ จังหวัด ให้ตรงกับแขวง/ตำบลที่เลือก
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