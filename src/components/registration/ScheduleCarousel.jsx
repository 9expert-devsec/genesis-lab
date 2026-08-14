'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EarlyBirdRibbon } from '@/components/ui/EarlyBirdRibbon';
import {
  NEUTRAL_STATUS,
  normalizeScheduleStatus,
  resolveScheduleBadge,
} from '@/lib/scheduleStatus';
import {
  trainingTypeColor,
  trainingTypeTint,
} from '@/lib/schedule/trainingTypeColor';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';

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
 * - currentYear: number — the Gregorian year in Asia/Bangkok, from the SERVER
 *   page via siteCurrentYear(). NO DEFAULT: the date label runs
 *   showYear:'auto', which throws without it rather than reading a clock this
 *   component cannot read consistently across SSR and hydration.
 */
export function ScheduleCarousel({
  schedules,
  selectedId,
  onSelect,
  earlyBirdScheduleId = null,
  currentYear,
}) {
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
            currentYear={currentYear}
          />
        ))}
      </div>
    </div>
  );
}

const TYPE_LABEL = {
  hybrid:    'Hybrid',
  online:    'Online',
  classroom: 'Classroom',
};

/**
 * The type tag: a solid dot, dark text, and a 12% tint of the type colour.
 *
 * ── WHAT THIS REPLACED, AND WHY NOT JUST RECOLOUR IT ────────────────────────
 * `TYPE_BADGE_CLASS` was `bg-sky-100 text-sky-700` / `bg-violet-100 …` /
 * `bg-emerald-100 …` — a FOURTH spelling of the training-type palette, in
 * Tailwind classes rather than hexes, so the badge here and the dot on
 * /schedule were different colours for the same delivery type. It also had NO
 * `dark:` variant at all, so on a dark background it rendered a pale blue chip
 * with mid-blue text on a dark card.
 *
 * ── THE TYPE COLOUR MUST NOT BECOME THE TEXT COLOUR ─────────────────────────
 * The obvious port — `color: trainingTypeColor(type)` — fails contrast: `#00CCFF`
 * on white is roughly 1.9:1, nowhere near the 4.5:1 WCAG AA needs for body text,
 * and this repo has already paid for contrast fixes once. So the colour is
 * carried by a DOT and a TINT, and the label stays in the existing dark text
 * token, which already has its dark-mode variant.
 *
 * That is also exactly how /schedule expresses a type (a dot, plus a border in
 * the same hue), so the two surfaces now say the same thing the same way.
 *
 * ── 12% IS NOT THE 10% IN ScheduleClient's HOVER ────────────────────────────
 * They are different numbers for different reasons and MUST NOT BE UNIFIED.
 * This pill is PERMANENT and sits on a white card, where 10% nearly vanishes;
 * the /schedule cell's 10% is a TRANSIENT hover and was specified at 10%
 * directly. If anyone ever makes them equal, that equality is a coincidence and
 * needs a comment saying so — the same trap as the four `4`s in
 * adminScheduleHorizon, where a cleanup that unified numbers equal by accident
 * broke a working surface.
 */
const TYPE_TINT_ALPHA = 0.12;

function ScheduleCard({ schedule, selected, onSelect, isEarlyBird = false, currentYear }) {
  /**
   * THE DATE LABEL, from the shared formatter.
   *
   * ── WHAT THE LOCAL ONE GOT WRONG ────────────────────────────────────────────
   * It was English (`17-18 SEP`) on two Thai screens, and it was
   * first-date-to-last-date: a round on 8, 10 and 12 ต.ค. — three separate days
   * — rendered `8-12 OCT`, advertising training on the 9th and the 11th on the
   * two screens where a visitor picks the round they are about to book.
   *
   * ── WHY `'auto'` AND NOT `true` OR `false` ──────────────────────────────────
   * The standing card rule. These rounds come from `listSchedulesByCourse` with
   * NO time horizon, so a low-frequency course viewed in Q4 lists next-year
   * rounds, and a bare `16-17 ก.พ.` on a card you can book from reads as a date
   * that has already passed. `'auto'` prints the Buddhist year exactly when the
   * round is not in `currentYear`.
   *
   * `currentYear` is a PROP, computed on the server. `formatRoundDays` throws on
   * `'auto'` without a numeric one, deliberately: this component renders during
   * SSR too, and on Vercel (UTC) the server's year and a Bangkok visitor's year
   * disagree for the seven hours before midnight every 31 December — a hydration
   * mismatch on the one night the year is the thing being asked about.
   */
  const dateLabel = formatRoundDays(schedule.dates, {
    showMonth: true,
    showYear: 'auto',
    currentYear,
  });

  /**
   * WAS `schedule.status === 'closed'`, WHICH MSDB NEVER SENDS.
   *
   * `closed` is the LOCAL ScheduleStatus override collection's spelling; MSDB
   * emits `full` for the same state (see the ALIASES table in lib/scheduleStatus).
   * The literal compare therefore only ever disabled an override-closed round,
   * and it went unnoticed for exactly one reason: upstream withheld `full` rounds
   * from every public feed, so one had never reached this component to be
   * mis-classified.
   *
   * Now that the public surfaces request all three statuses, a full round DOES
   * arrive here — and under the old compare it would have rendered its red เต็ม
   * badge on a card that was still selectable, still `aria-pressed`-able, and
   * still able to carry the user into a booking form. Routing through
   * `normalizeScheduleStatus` collapses both spellings onto the same canonical
   * `full`, so the badge and the disabling can no longer disagree.
   */
  const isClosed = normalizeScheduleStatus(schedule.status) === 'full';
  // Unrecognised statuses keep the previous neutral-grey treatment and echo the
  // raw value rather than being advertised as green — which since the
  // state/action split would mean inviting a booking with "ลงทะเบียน" on a
  // round we cannot classify.
  const statusStyle = resolveScheduleBadge(schedule.status);
  // `.action`, not `.state`: this card is selectable (onSelect drives the
  // registration step), so its badge is a call to action like every other
  // badge. See lib/scheduleStatus.js for why those are two fields now.
  const statusLabel = statusStyle?.action ?? schedule.status;
  const statusClass = statusStyle?.soft ?? NEUTRAL_STATUS.soft;

  return (
    <button
      type="button"
      onClick={isClosed ? undefined : onSelect}
      disabled={isClosed}
      // `disabled` already blocks the click; `aria-disabled` is what carries
      // the state into the accessibility tree alongside `aria-pressed`, so the
      // card is not announced as a plain unpressed toggle the user could pick.
      aria-disabled={isClosed || undefined}
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
      {/*
        EVERY round shows its type, classroom included.

        This was gated on `schedule.type !== 'classroom'`, so the most common
        delivery type was the one with no tag — and its absence had to be read
        as meaning something, which is only possible if you already know the
        rule. A visitor comparing two cards saw a labelled Hybrid beside an
        unlabelled card and had no way to tell whether that meant Classroom or
        "not recorded".

        `schedule.type &&` still guards, so a round with NO type renders no tag
        rather than a tag reading "classroom" that upstream never said. That is
        a different claim from the colour fallback, which does default to
        classroom — a missing colour still has to paint something, a missing
        label does not have to say anything.
      */}
      {schedule.type && (
        <span
          className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--text-primary)]"
          style={{ backgroundColor: trainingTypeTint(schedule.type, TYPE_TINT_ALPHA) }}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: trainingTypeColor(schedule.type) }}
          />
          {TYPE_LABEL[schedule.type] ?? schedule.type}
        </span>
      )}
    </button>
  );
}
