'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';
import { isEarlyBirdSchedule } from '@/lib/isEarlyBird';
import { SECTION_ANCHOR_CLASS } from '@/lib/courseSectionNav';
import { normalizeScheduleStatus } from '@/lib/scheduleStatus';
import { trainingTypeColor } from '@/lib/schedule/trainingTypeColor';

/**
 * Detail-page schedule block.
 *
 * Wraps the shared ScheduleCarousel (which is a controlled selection
 * component with {selectedId, onSelect}) and pairs it with a CTA button
 * that takes the selected date through to the registration wizard.
 *
 * If no schedules are open, shows an empty state — ScheduleCarousel
 * renders its own "ยังไม่มีรอบอบรม" message, so we just let it.
 */
const isFull = (schedule) =>
  normalizeScheduleStatus(schedule?.status) === 'full';

export function ScheduleSection({ course, schedules, earlyBird, currentYear }) {
  /**
   * The first SELECTABLE round, not merely the first one.
   *
   * `schedules?.[0]?._id` was safe only while upstream withheld full rounds
   * from this page's fetch. It no longer does — and the very next round to sell
   * out is, by definition, the earliest one, which is exactly the row this
   * index-0 default lands on. That would have opened the page with a sold-out
   * round pre-selected and the ลงทะเบียนรอบที่เลือก button pointing straight at
   * it, on a card ScheduleCarousel simultaneously renders disabled: the user
   * could not have chosen it, but it was chosen for them.
   *
   * Falls back to null rather than to the first round when EVERY round is full,
   * so the CTA disappears instead of linking into a booking that cannot happen.
   */
  const [selectedId, setSelectedId] = useState(
    schedules?.find((s) => !isFull(s))?._id ?? null
  );

  const selected = schedules?.find((s) => s._id === selectedId) ?? null;
  const hasSchedules = Boolean(schedules?.length);

  // Resolve once — passing the bare schedule_id down avoids re-checking
  // is_active / deadline for every card render.
  const earlyBirdScheduleId =
    earlyBird?.schedule_id &&
    isEarlyBirdSchedule(earlyBird.schedule_id, earlyBird)
      ? earlyBird.schedule_id
      : null;

  // Belt to the default's braces: the CTA is built from whatever is selected,
  // and a full round must never be what it points at — however the selection
  // got there. Null collapses the button entirely (see `hrefForSelected &&`
  // below) rather than rendering a greyed link that still navigates.
  const hrefForSelected =
    selected && !isFull(selected)
      ? `/registration/public?course=${String(course.course_id).toLowerCase()}&class=${selected._id}`
      : null;

  return (
    <section id="schedule" className={SECTION_ANCHOR_CLASS}>
      <TrainingTypeLegend />

      <div className="flex items-center gap-2 rounded-t-xl bg-9e-action px-5 py-3">
        <CalendarDays className="h-6 w-6 text-white" strokeWidth={1.75} />
        <h2 className="text-base font-bold text-white">
          ตารางอบรม Public Training
        </h2>
      </div>

      <div className="rounded-b-xl border border-9e-air/30 bg-[var(--surface-raised)] p-4">
        <ScheduleCarousel
          schedules={schedules ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          earlyBirdScheduleId={earlyBirdScheduleId}
          currentYear={currentYear}
        />

        {hasSchedules && hrefForSelected && (
          <div className="mt-4 flex justify-end">
            <Link
              href={hrefForSelected}
              className="rounded-xl bg-9e-action px-6 py-2.5 text-base font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand"
            >
              ลงทะเบียนรอบที่เลือก
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The two delivery modes this legend explains, as DATA.
 *
 * ── IT USED TO BE FOUR HARDCODED SWATCHES ───────────────────────────────────
 * `bg-9e-action` and `bg-purple-500`, written out twice each — once in the
 * legend row and once again inside the `?` tooltip. That was a FIFTH spelling of
 * the training-type palette, and the worst-placed one: this is the legend FOR
 * the cards below it, so it is the component whose whole job is to say what the
 * colours mean. It was saying something the cards did not use.
 *
 * The dot now takes `trainingTypeColor(key)` inline, for the same reason every
 * other surface does: Tailwind never evaluates a template literal, so
 * `bg-[${color}]` compiles to no class at all and fails silently as an
 * invisible dot.
 */
const TRAINING_TYPES = [
  {
    key: 'classroom',
    label: 'Classroom',
    description: 'อบรมแบบ Class Room ณ ห้องอบรม 9EXPERT',
  },
  {
    key: 'hybrid',
    label: 'Hybrid',
    description: 'เลือกอบรมแบบ Class Room หรือ Ms Teams',
  },
];

/** One legend swatch, so the row and the tooltip cannot draw different dots. */
function TypeDot({ type }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: trainingTypeColor(type) }}
    />
  );
}

/**
 * Training-type legend with a "?" hover tooltip that explains the two
 * delivery modes. Pure CSS via Tailwind's `group-hover` — no JS, no
 * portal needed because the tooltip only needs to float above local
 * siblings and the parent row is short enough that `z-50` keeps it on
 * top of neighbouring content.
 */
function TrainingTypeLegend() {
  return (
    <div className="mb-3 flex items-center justify-end gap-3 text-sm text-[var(--text-secondary)]">
      <span>รูปแบบการอบรม:</span>
      {TRAINING_TYPES.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1">
          <TypeDot type={key} />
          {label}
        </span>
      ))}

      <div className="group relative">
        <button
          type="button"
          aria-label="รูปแบบการอบรมคืออะไร"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 text-sm text-[var(--text-secondary)] transition-colors duration-9e-micro ease-9e hover:border-9e-action hover:text-9e-action focus:outline-none focus:ring-2 focus:ring-9e-action/20"
        >
          ?
        </button>

        <div className="pointer-events-none invisible absolute bottom-full right-0 z-50 mb-2 w-80 opacity-0 transition-all duration-9e-micro ease-9e group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <div className="absolute bottom-[-6px] right-3 h-3 w-3 rotate-45 border-b border-r border-[var(--surface-border)] bg-[var(--surface-raised)]" />
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-4 text-left shadow-9e-md">
            {/* Same list, same dots. The tooltip used to repeat both the
                swatches and the wording as literals, so it could describe a
                colour the row beside it no longer drew. */}
            <div className="space-y-3">
              {TRAINING_TYPES.map(({ key, label, description }, i) => (
                <div
                  key={key}
                  className={i > 0 ? 'border-t border-[var(--surface-border)] pt-3' : undefined}
                >
                  <p className="mb-0.5 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                    <TypeDot type={key} />
                    {label}
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
