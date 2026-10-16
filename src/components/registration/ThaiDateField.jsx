'use client';

import { useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  THAI_WEEKDAYS_SHORT,
  dateToDayKey,
  dayKeyToDate,
  formatBuddhistDayKey,
  thaiDayLabel,
  thaiMonthCaption,
} from '@/lib/registration/thaiBuddhistDate';

/**
 * A single-day field that always reads `DD/MM/YYYY` in the Buddhist year,
 * whatever the browser's locale — the native `<input type="date">` follows the
 * OS and showed "06/09/2026" (month first) on an en-US browser.
 *
 * `value`, `min` and `max` are Gregorian `YYYY-MM-DD` keys, and `onChange`
 * hands one back: only the DISPLAY is Thai. The text box is read-only; the
 * box or the icon opens a react-day-picker month grid, days outside
 * `min`..`max` cannot be picked, and picking one closes it.
 *
 * Bottom sheet below `sm` (as TransferExplainer beside it), a popover under the
 * field from `sm` up. z-70 sits above the sticky header (z-60) and below the
 * mobile drawer (z-9998). Closes on a pick, Escape or a tap outside.
 *
 * The grid is LAZY: react-day-picker (+ date-fns) is ~20 kB gzip on the
 * register route's first load, for a form most visitors never open, so its
 * chunk is fetched the first time a calendar opens.
 */
const DayPicker = dynamic(() => import('react-day-picker').then((m) => m.DayPicker), {
  ssr: false,
  loading: () => <div className="h-[300px]" aria-busy="true" />,
});
export function ThaiDateField({ label, value, onChange, min, max, className }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const inputId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = dayKeyToDate(value);
  const minDate = dayKeyToDate(min);
  const maxDate = dayKeyToDate(max);
  const disabled = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <label htmlFor={inputId} className="text-[11px] text-9e-slate-dp-50">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          readOnly
          value={formatBuddhistDayKey(value)}
          placeholder="วว/ดด/ปปปป"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="w-full cursor-pointer rounded-9e-md border border-[var(--surface-border)] bg-white px-3 py-2 pr-10 text-sm text-9e-navy placeholder:text-9e-slate-dp-50 focus:outline-none focus:ring-2 focus:ring-9e-action/30 dark:bg-[#0D1B2A] dark:text-white"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`เลือก${label}`}
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-9e-action"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="fixed inset-x-4 bottom-4 z-70 rounded-9e-md border border-[var(--surface-border)] bg-white p-3 text-9e-navy shadow-lg dark:bg-[#0D1B2A] dark:text-white sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[300px]"
        >
          <DayPicker
            mode="single"
            required
            selected={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(dateToDayKey(d));
              setOpen(false);
              inputRef.current?.focus();
            }}
            defaultMonth={selected ?? maxDate}
            startMonth={minDate}
            endMonth={maxDate}
            disabled={disabled}
            weekStartsOn={0}
            autoFocus
            formatters={{
              formatCaption: (date) => thaiMonthCaption(date),
              formatWeekdayName: (date) => THAI_WEEKDAYS_SHORT[date.getDay()],
            }}
            labels={{
              labelNext: () => 'เดือนถัดไป',
              labelPrevious: () => 'เดือนก่อนหน้า',
              labelGrid: (date) => thaiMonthCaption(date),
              labelDayButton: (date, modifiers) =>
                `${thaiDayLabel(date)}${modifiers?.selected ? ' (เลือกแล้ว)' : ''}`,
            }}
            classNames={{
              root: 'w-full',
              months: 'relative',
              month: 'w-full',
              month_caption: 'flex h-9 items-center justify-center text-sm font-semibold',
              nav: 'absolute inset-x-0 top-0 flex h-9 items-center justify-between',
              button_previous:
                'flex h-8 w-8 items-center justify-center rounded-full text-9e-action hover:bg-9e-action/10 disabled:opacity-30',
              button_next:
                'flex h-8 w-8 items-center justify-center rounded-full text-9e-action hover:bg-9e-action/10 disabled:opacity-30',
              chevron: 'h-4 w-4 fill-current',
              month_grid: 'mt-2 w-full border-collapse',
              weekdays: '',
              weekday: 'h-8 text-center text-[11px] font-medium text-9e-slate-dp-50',
              week: '',
              day: 'p-0.5 text-center',
              day_button:
                'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm hover:bg-9e-action/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-9e-action/40 disabled:cursor-not-allowed disabled:hover:bg-transparent',
              selected: '[&>button]:bg-9e-action [&>button]:text-white [&>button]:hover:bg-9e-action',
              today: '[&>button]:font-bold',
              disabled: 'opacity-30',
              outside: 'invisible',
            }}
          />
        </div>
      )}
    </div>
  );
}
