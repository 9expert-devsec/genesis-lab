'use client';

import { useEffect, useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

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
 * Keeps the `attendees` field array in sync with `attendeesCount` and
 * `coordinator.isAttending` — RHF's useFieldArray is the source of
 * truth for attendee ordering and ids.
 *
 * Props:
 * - control:      RHF control
 * - register:     RHF register
 * - watch:        RHF watch
 * - setValue:     RHF setValue (for the inverted skip-list checkbox)
 * - errors:       RHF errors
 */
export function AttendeesList({ control, register, watch, setValue, errors }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'attendees',
  });

  const count = watch('attendeesCount') ?? 1;
  const listProvided = watch('attendeesListProvided') ?? true;
  const coordinatorIsAttending = watch('coordinator.isAttending') ?? false;

  // Required attendee entries = count minus 1 if coordinator fills a slot.
  const required = Math.max(
    0,
    coordinatorIsAttending ? count - 1 : count
  );

  // Sync the field array length to `required` when count / isAttending /
  // listProvided change. When list is skipped we keep attendees at []
  // so nothing is persisted that the user didn't actually fill in.
  useEffect(() => {
    if (!listProvided) {
      // Drop all if user opts out
      for (let i = fields.length - 1; i >= 0; i--) remove(i);
      return;
    }
    if (fields.length < required) {
      const missing = required - fields.length;
      for (let i = 0; i < missing; i++) append(EMPTY_ATTENDEE);
    } else if (fields.length > required) {
      for (let i = fields.length - 1; i >= required; i--) remove(i);
    }
  }, [required, listProvided, fields.length, append, remove]);

  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-1 text-base font-bold text-[var(--text-primary)]">
        ข้อมูลผู้เข้าอบรม
      </h2>
      <p className="mb-4 text-xs text-[var(--text-secondary)]">
        ระบุจำนวนและข้อมูลของผู้เข้าอบรม หากยังไม่ทราบรายชื่อสามารถข้ามได้
      </p>

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
      </div>

      {!listProvided && (
        <p className="mt-4 rounded-9e-md border border-dashed border-[var(--surface-border)] p-3 text-sm text-[var(--text-secondary)]">
          จะแจ้งรายชื่อผู้เข้าอบรมภายหลัง — ทีมขายจะติดต่อเพื่อเก็บข้อมูลเพิ่มเติม
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
            />
          ))}
        </div>
      )}

      {errors?.attendees?.message && (
        <p className="mt-2 text-xs text-9e-accent">{errors.attendees.message}</p>
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
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-9e-brand">
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

function AttendeeBlock({ index, displayIndex, register, error }) {
  const [open, setOpen] = useState(true);
  const err = error ?? {};

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
          <FieldGroup label="อีเมล" error={err.email?.message} required>
            <Input
              type="email"
              {...register(`attendees.${index}.email`)}
              aria-invalid={!!err.email}
            />
          </FieldGroup>
          <FieldGroup label="เบอร์โทร" error={err.phone?.message} required>
            <Input
              inputMode="tel"
              placeholder="0812345678"
              {...register(`attendees.${index}.phone`)}
              aria-invalid={!!err.phone}
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
        {required && <span className="ml-0.5 text-9e-accent">*</span>}
      </Label>
      {children}
      {error && <p className="mt-1 text-xs text-9e-accent">{error}</p>}
    </div>
  );
}
