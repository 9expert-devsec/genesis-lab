'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { ScheduleCarousel } from '@/components/registration/ScheduleCarousel';

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
export function ScheduleSection({ course, schedules }) {
  const [selectedId, setSelectedId] = useState(
    schedules?.[0]?._id ?? null
  );

  const selected = schedules?.find((s) => s._id === selectedId) ?? null;
  const hasSchedules = Boolean(schedules?.length);

  const hrefForSelected = selected
    ? `/registration/public?course=${String(course.course_id).toLowerCase()}&class=${selected._id}`
    : null;

  return (
    <section id="schedule" className="scroll-mt-24">
      <TrainingTypeLegend />

      <div className="flex items-center gap-2 rounded-t-xl bg-9e-action px-5 py-3">
        <CalendarDays className="h-4 w-4 text-white" strokeWidth={1.75} />
        <h2 className="text-sm font-bold text-white">
          ตารางอบรม Public Training
        </h2>
      </div>

      <div className="rounded-b-xl border border-9e-air/30 bg-white p-4">
        <ScheduleCarousel
          schedules={schedules ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {hasSchedules && hrefForSelected && (
          <div className="mt-4 flex justify-end">
            <Link
              href={hrefForSelected}
              className="rounded-xl bg-9e-action px-6 py-2.5 text-sm font-bold text-white transition-colors duration-9e-micro ease-9e hover:bg-9e-brand"
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
 * Training-type legend with a "?" hover tooltip that explains the two
 * delivery modes. Pure CSS via Tailwind's `group-hover` — no JS, no
 * portal needed because the tooltip only needs to float above local
 * siblings and the parent row is short enough that `z-50` keeps it on
 * top of neighbouring content.
 */
function TrainingTypeLegend() {
  return (
    <div className="mb-3 flex items-center justify-end gap-3 text-xs text-9e-slate-dp-50">
      <span>รูปแบบการอบรม:</span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-9e-action" />
        Classroom
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
        Hybrid
      </span>

      <div className="group relative">
        <button
          type="button"
          aria-label="รูปแบบการอบรมคืออะไร"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-9e-slate-lt-400 dark:border-9e-slate-dp-400 text-xs text-9e-slate-dp-50 transition-colors duration-9e-micro ease-9e hover:border-9e-action hover:text-9e-action focus:outline-none focus:ring-2 focus:ring-9e-action/20"
        >
          ?
        </button>

        <div className="pointer-events-none invisible absolute bottom-full right-0 z-50 mb-2 w-72 opacity-0 transition-all duration-9e-micro ease-9e group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <div className="absolute bottom-[-6px] right-3 h-3 w-3 rotate-45 border-b border-r border-gray-200 bg-white" />
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-9e-md">
            <div className="space-y-3">
              <div>
                <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-9e-navy">
                  <span className="inline-block h-2 w-2 rounded-full bg-9e-action" />
                  Classroom
                </p>
                <p className="text-xs leading-relaxed text-9e-slate-dp-50">
                  อบรมแบบ Class Room ณ ห้องอบรม 9EXPERT
                </p>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="mb-0.5 flex items-center gap-1.5 text-xs font-bold text-9e-navy">
                  <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                  Hybrid
                </p>
                <p className="text-xs leading-relaxed text-9e-slate-dp-50">
                  เลือกอบรมแบบ Class Room หรือ Ms Teams
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
