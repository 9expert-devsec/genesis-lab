'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EarlyBirdRibbon } from '@/components/ui/EarlyBirdRibbon';

/**
 * Horizontal scrollable list of schedule cards.
 * Cards use snap-x so the browser aligns them to the left edge on
 * scroll; the chevron buttons nudge by ~one card width.
 *
 * Disabled (status === 'closed') cards render muted and cannot be
 * selected.
 *
 * Props:
 * - schedules: Array<{ _id, dates: string[], status, type }>
 * - selectedId: string | null
 * - onSelect: (scheduleId: string) => void
 */
export function ScheduleCarousel({ schedules, selectedId, onSelect, earlyBirdScheduleId = null }) {
  const scrollerRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [schedules.length]);

  const scrollBy = (delta) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (!schedules?.length) {
    return (
      <p className="rounded-9e-md border border-dashed border-[var(--surface-border)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
        ยังไม่มีรอบอบรมเปิดรับสมัครในขณะนี้
      </p>
    );
  }

  return (
    <div className="relative">
      {canScrollLeft && (
        <button
          type="button"
          aria-label="เลื่อนไปซ้าย"
          onClick={() => scrollBy(-280)}
          className="absolute left-0 top-1/2 z-10 -translate-x-2 -translate-y-1/2 rounded-full bg-[var(--surface)] p-2 shadow-9e-md hover:bg-[var(--surface-muted)]"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="เลื่อนไปขวา"
          onClick={() => scrollBy(280)}
          className="absolute right-0 top-1/2 z-10 translate-x-2 -translate-y-1/2 rounded-full bg-[var(--surface)] p-2 shadow-9e-md hover:bg-[var(--surface-muted)]"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {schedules.map((s) => (
          <ScheduleCard
            key={s._id}
            schedule={s}
            selected={s._id === selectedId}
            onSelect={() => onSelect(s._id)}
            isEarlyBird={!!earlyBirdScheduleId && s._id === earlyBirdScheduleId}
          />
        ))}
      </div>
    </div>
  );
}

const MONTHS_EN = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const STATUS_LABEL = {
  open: 'ยืนยัน',
  nearly_full: 'ใกล้เต็ม',
  closed: 'เต็ม',
};

const STATUS_CLASS = {
  open: 'bg-9e-brand/10 text-9e-brand',
  nearly_full: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-100 text-slate-500',
};

function ScheduleCard({ schedule, selected, onSelect, isEarlyBird = false }) {
  const dates = [...(schedule.dates || [])].sort();
  const start = dates[0] ? new Date(dates[0]) : null;
  const end = dates.at(-1) ? new Date(dates.at(-1)) : null;

  let dateLabel = '—';
  if (start && end) {
    if (start.getDate() === end.getDate() && start.getMonth() === end.getMonth()) {
      dateLabel = `${start.getDate()} ${MONTHS_EN[start.getMonth()]}`;
    } else if (start.getMonth() === end.getMonth()) {
      dateLabel = `${start.getDate()}-${end.getDate()} ${MONTHS_EN[start.getMonth()]}`;
    } else {
      dateLabel = `${start.getDate()} ${MONTHS_EN[start.getMonth()]} - ${end.getDate()} ${MONTHS_EN[end.getMonth()]}`;
    }
  }

  const isClosed = schedule.status === 'closed';
  const statusLabel = STATUS_LABEL[schedule.status] ?? schedule.status;
  const statusClass = STATUS_CLASS[schedule.status] ?? 'bg-slate-100 text-slate-600';

  return (
    <button
      type="button"
      onClick={isClosed ? undefined : onSelect}
      disabled={isClosed}
      aria-pressed={selected}
      className={cn(
        'relative flex-none snap-start overflow-hidden rounded-9e-lg border px-6 py-4 text-center transition-all',
        'min-w-[140px]',
        selected && !isClosed
          ? 'border-9e-brand bg-9e-brand/5 shadow-9e-md'
          : 'border-[var(--surface-border)] bg-[var(--surface)]',
        isClosed ? 'cursor-not-allowed opacity-60' : 'hover:border-9e-brand/50'
      )}
    >
      {isEarlyBird && <EarlyBirdRibbon />}
      <div className="text-xl font-bold text-[var(--text-primary)]">
        {dateLabel}
      </div>
      <span
        className={cn(
          'mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-medium',
          statusClass
        )}
      >
        {statusLabel}
      </span>
    </button>
  );
}
