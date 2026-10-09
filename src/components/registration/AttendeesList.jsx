'use client';

import { useEffect, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { phoneInputProps } from '@/lib/registration/phoneInputProps';
import { useRevealFieldError } from '@/lib/registration/useRevealFieldError';

// MAX_ATTENDEES controls the upper limit of the attendee count <select>.
// The matching schema constraint is in src/lib/schemas/register-public.js
// (publicRegistrationSchema → attendeesCount → .max(MAX_ATTENDEES)).
// Change both values together if the limit needs adjusting.
const MAX_ATTENDEES = 20;

const EMPTY_ATTENDEE = { firstName: '', lastName: '', email: '', phone: '' };

/**
 * Attendees section — count dropdown, skip-list checkbox, and the
 * dynamic list of attendee forms.
 *
 * When coordinator is attending, the first attendee slot is filled
 * server-side from the coordinator, so we hide index 0 and label the
 * visible forms starting at "ท่านที่ 2".
 *
 * ── ONE SOURCE OF TRUTH: THE COUNT. THE ARRAY FOLLOWS IT. ─────────────────
 *
 * `attendeesCount` (the select) and the `attendees` field array were TWO
 * sources of truth reconciled by a DELTA: the effect below computed how many
 * rows were missing and called `append` once per row, or `remove` once per
 * extra row, against a `fields.length` captured in the render that scheduled
 * it. That shape is wrong in a way that is invisible most of the time and
 * produces exactly one symptom when it is not:
 *
 *   TWO CARDS UNDER A SELECT THAT SAYS 1.
 *
 * Any second invocation of the effect that still sees the pre-append length —
 * and `next.config.mjs` sets `reactStrictMode: true`, so in development React
 * mounts, unmounts and mounts again, running every effect twice with the first
 * render's closure — applies the same delta twice. A delta applied twice is
 * 2n rows for a count of n. The effect did converge on a later pass, which is
 * why this was intermittent rather than constant, and why it survived: it is
 * a race, not a branch.
 *
 * It is now a RECONCILIATION and not a delta. One `replace` to exactly the
 * required length, built from the values the form currently holds, so running
 * it once, twice or ten times lands on the same array. `fields.length` can
 * never end up anywhere but `target`, whatever order the renders arrive in.
 *
 * `getValues` rather than the `fields` from `useFieldArray`: those entries
 * carry the values as of the last ARRAY MUTATION, not the live ones, so
 * rebuilding from them would wipe everything typed since — the shrink path
 * would silently clear rows 1 and 2 on the way from three attendees to two.
 *
 * useFieldArray remains the source of truth for attendee ORDERING and IDS.
 *
 * Props:
 * - control:      RHF control
 * - register:     RHF register
 * - watch:        RHF watch
 * - setValue:     RHF setValue (for the inverted skip-list checkbox)
 * - getValues:    RHF getValues — the LIVE attendee values, read only when the
 *                 array length has to change. Not `watch`: that would
 *                 re-render this whole section on every keystroke in every
 *                 attendee field, and the values are needed once per resize.
 * - errors:       RHF errors
 * - isSubmitted:  RHF formState.isSubmitted — see CoordinatorFields' note on
 *                 useRevealFieldError; threaded down to each AttendeeBlock's
 *                 phone field.
 */
export function AttendeesList({ control, register, watch, setValue, getValues, errors, isSubmitted }) {
  const { fields, replace } = useFieldArray({
    control,
    name: 'attendees',
  });

  const count = watch('attendeesCount') ?? 1;
  const storedListProvided = watch('attendeesListProvided') ?? true;
  const coordinatorIsAttending = watch('coordinator.isAttending') ?? false;

  /**
   * ONE attendee, and it is the coordinator → there is nothing left to opt out
   * of. The mirror card below IS the complete list, so offering
   * "ยังไม่ประสงค์แจ้งรายชื่อผู้เข้าอบรม" asks the user to decline naming
   * someone they have already named.
   */
  const soleAttendeeIsCoordinator = coordinatorIsAttending && count === 1;

  /**
   * THE TRANSITION THIS GUARDS. The checkbox is the ONLY control for
   * `attendeesListProvided`. Set the count to 2, tick the opt-out, then drop
   * back to 1: the checkbox disappears and the flag stays false. Step 2 then
   * tells a user whose sole attendee is fully identified that they
   * "ยังไม่ระบุรายชื่อผู้เข้าอบรม", and the confirmation email says the same.
   *
   * Read-side default AND a write, both: the derived value keeps this render
   * correct (effects do not run in a server render), and the effect below puts
   * the form state back so what is submitted matches what is on screen.
   */
  const listProvided = soleAttendeeIsCoordinator ? true : storedListProvided;

  useEffect(() => {
    if (soleAttendeeIsCoordinator && !storedListProvided) {
      setValue('attendeesListProvided', true, { shouldDirty: true });
    }
  }, [soleAttendeeIsCoordinator, storedListProvided, setValue]);

  // Required attendee entries = count minus 1 if coordinator fills a slot.
  const required = Math.max(
    0,
    coordinatorIsAttending ? count - 1 : count
  );

  /**
   * HOW MANY ROWS THIS FORM SHOULD HOLD — the single number the array follows.
   * Zero when the user opted out, so nothing is persisted that they never
   * filled in.
   */
  const target = listProvided ? required : 0;

  /**
   * ONE IDEMPOTENT WRITE. See the note at the top of this file for why this is
   * a `replace` to the target rather than a delta of appends and removes.
   *
   * ALSO WHAT KEEPS A RESTORED DRAFT HONEST. A draft can hold more attendee
   * rows than its own saved `attendeesCount` — set the count to 3, fill three,
   * drop it to 1, leave the step — and the rows beyond the count must not
   * survive into the payload. `replace` TRUNCATES to `target`, so a row nobody
   * can see on screen is a row nobody submits either; the old shrink path
   * reached the same place only if its effect got to run.
   */
  useEffect(() => {
    if (fields.length === target) return;
    const current = getValues?.('attendees');
    const live = Array.isArray(current) ? current : [];
    replace(
      Array.from({ length: target }, (_, i) => ({ ...EMPTY_ATTENDEE, ...(live[i] ?? {}) })),
    );
  }, [target, fields.length, replace, getValues]);

  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        ข้อมูลผู้เข้าอบรม
      </h2>
      {/* <p className="mb-4 text-xs text-[var(--text-secondary)]">
        ระบุจำนวนและข้อมูลของผู้เข้าอบรม หากยังไม่ทราบรายชื่อสามารถข้ามได้
      </p> */}

      <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-end">
        <div>
          <Label className="mb-1.5 block">จำนวนผู้สมัคร</Label>
          {/* Attendee count selector — upper bound is MAX_ATTENDEES (line above). */}
          <select
            {...register('attendeesCount', { valueAsNumber: true })}
            className={cn(
              'h-11 w-full rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
              'border-[var(--surface-border)]',
              'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
            )}
          >
            {Array.from({ length: MAX_ATTENDEES }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {!soleAttendeeIsCoordinator && (
          <label className="flex cursor-pointer items-center gap-2 pt-1">
            <Checkbox
              checked={!listProvided}
              onChange={(e) =>
                setValue('attendeesListProvided', !e.target.checked, {
                  shouldDirty: true,
                })
              }
            />
            <span className="text-sm text-[var(--text-primary)]">
              ยังไม่ประสงค์แจ้งรายชื่อผู้เข้าอบรม
            </span>
          </label>
        )}
      </div>

      {!listProvided && (
        <p className="mt-4 rounded-9e-md border border-dashed border-[var(--surface-border)] p-3 text-sm text-[var(--text-secondary)]">
          แจ้งรายชื่อผู้เข้าอบรมภายหลัง — ทีมงานจะติดต่อขอข้อมูลเพิ่มเติมทางอีเมลที่ท่านระบุไว้
        </p>
      )}

      {listProvided && coordinatorIsAttending && (
        <CoordinatorMirrorCard watch={watch} />
      )}

      {listProvided && fields.length > 0 && (
        <div className="mt-4 space-y-3">
          {fields.map((field, i) => (
            <AttendeeBlock
              key={field.id}
              index={i}
              displayIndex={coordinatorIsAttending ? i + 2 : i + 1}
              register={register}
              error={errors?.attendees?.[i]}
              isSubmitted={isSubmitted}
            />
          ))}
        </div>
      )}

      {errors?.attendees?.message && (
        <p className="mt-2 text-xs text-red-500">{errors.attendees.message}</p>
      )}
    </section>
  );
}

/**
 * Read-only card showing the coordinator's data as ท่านที่ 1.
 * Values are read live from the form via `watch` so changes to the
 * coordinator section are reflected here immediately.
 * This card is purely display — it has no Input or register calls.
 */
function CoordinatorMirrorCard({ watch }) {
  const firstName = watch('coordinator.firstName') || '';
  const lastName  = watch('coordinator.lastName')  || '';
  const email     = watch('coordinator.email')     || '';
  const phone     = watch('coordinator.phone')     || '';

  const fullName = `${firstName} ${lastName}`.trim() || '—';

  return (
    <div className="mt-4 rounded-9e-md border border-9e-brand/30 bg-9e-brand/5 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-9e-action">
        ผู้เข้าอบรมท่านที่ 1 (ผู้ประสานงาน)
      </p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{fullName}</p>
      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
        {email || '—'} · {phone || '—'}
      </p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        ข้อมูลนี้อ้างอิงจากผู้ประสานงานด้านบน ไม่สามารถแก้ไขได้ที่นี่
      </p>
    </div>
  );
}

function AttendeeBlock({ index, displayIndex, register, error, isSubmitted }) {
  const [open, setOpen] = useState(true);
  const err = error ?? {};
  const phoneProps = phoneInputProps(register(`attendees.${index}.phone`));
  const phoneReveal = useRevealFieldError(isSubmitted);

  return (
    <div className="rounded-9e-md border border-[var(--surface-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          ผู้เข้าอบรมท่านที่ {displayIndex}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
        )}
      </button>

      {open && (
        <div className="grid gap-4 border-t border-[var(--surface-border)] p-4 sm:grid-cols-2">
          <FieldGroup label="ชื่อ" error={err.firstName?.message} required>
            <Input
              {...register(`attendees.${index}.firstName`)}
              aria-invalid={!!err.firstName}
            />
          </FieldGroup>
          <FieldGroup label="นามสกุล" error={err.lastName?.message} required>
            <Input
              {...register(`attendees.${index}.lastName`)}
              aria-invalid={!!err.lastName}
            />
          </FieldGroup>
          {/* อีเมล/เบอร์โทร are OPTIONAL for an attendee — no `required` prop,
              unlike ชื่อ/นามสกุล above. Coordinator's equivalent fields in
              CoordinatorFields.jsx are untouched and stay required. */}
          <FieldGroup label="อีเมล" error={err.email?.message}>
            <Input
              type="email"
              {...register(`attendees.${index}.email`)}
              aria-invalid={!!err.email}
            />
          </FieldGroup>
          <FieldGroup label="เบอร์โทร" error={phoneReveal.shouldShow ? err.phone?.message : undefined}>
            <Input
              placeholder="0812345678"
              {...phoneProps}
              onBlur={(e) => { phoneProps.onBlur(e); phoneReveal.reveal(); }}
              aria-invalid={phoneReveal.shouldShow && !!err.phone}
            />
          </FieldGroup>
        </div>
      )}
    </div>
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
