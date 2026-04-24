'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContentSection } from './ContentSection';

/**
 * Outline accordion.
 *
 * Upstream shape: `training_topics` (no `course_` prefix) is an array of
 * `{ title, bullets: string[] }` — each chapter has its own sub-bullets.
 *
 * Every topic defaults to open. The ซ่อน/แสดงทั้งหมด toggle lives in the
 * ContentSection action slot.
 */
export function CourseOutline({ course }) {
  const topics = Array.isArray(course?.training_topics)
    ? course.training_topics.filter(Boolean)
    : [];

  const [openMap, setOpenMap] = useState(() =>
    Object.fromEntries(topics.map((_, i) => [i, true]))
  );

  if (!topics.length) return null;

  const allOpen = topics.every((_, i) => openMap[i]);

  const toggleAll = () => {
    const next = !allOpen;
    setOpenMap(Object.fromEntries(topics.map((_, i) => [i, next])));
  };

  const toggle = (i) => setOpenMap((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <ContentSection
      id="outline"
      title="หัวข้อการฝึกอบรม"
      action={
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs font-medium text-9e-primary hover:underline"
        >
          {allOpen ? 'ซ่อนทั้งหมด' : 'แสดงทั้งหมด'}
        </button>
      }
    >
      <div className="space-y-2">
        {topics.map((topic, i) => {
          const open = Boolean(openMap[i]);
          const bullets = Array.isArray(topic?.bullets)
            ? topic.bullets.filter(Boolean)
            : [];
          const title = topic?.title ?? '';
          return (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-gray-200"
            >
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 bg-white px-5 py-3 text-left transition-colors duration-9e-micro ease-9e hover:bg-9e-ice"
              >
                <span className="text-sm font-semibold text-9e-navy">
                  {i + 1}. {title}
                </span>
                {open ? (
                  <ChevronUp
                    className="h-4 w-4 shrink-0 text-9e-slate"
                    strokeWidth={2}
                  />
                ) : (
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-9e-slate"
                    strokeWidth={2}
                  />
                )}
              </button>

              <div
                className={cn(
                  'overflow-hidden transition-[max-height] duration-9e-reveal ease-9e',
                  open ? 'max-h-[800px]' : 'max-h-0'
                )}
              >
                {bullets.length > 0 && (
                  <ul className="space-y-1.5 border-t border-gray-100 bg-9e-ice/40 px-5 py-3">
                    {bullets.map((bullet, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-sm text-9e-slate"
                      >
                        <span className="mt-1 shrink-0 text-9e-sky">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ContentSection>
  );
}
