import Image from 'next/image';
import Link from 'next/link';
import { Clock, BarChart2 } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';

/**
 * ROUND M-B — restyled to match Figma node 27:5 (expert-masterclass-landing,
 * "courses-section" / course-card-claude + course-card-marketing).
 *
 * Extracted out of MasterclassListingClient.jsx, which used to define this
 * inline and unexported. All data below is REAL — course + batch records
 * from MongoDB via getPublishedMasterclasses(), the same pricing/countdown/
 * capacity logic the previous card used. Only the presentation changed to
 * match the new design; no static Figma numbers (its mock 12,900 บาท, "ว่าง
 * 4 ที่นั่ง", 18-day countdown, etc.) were ported — those were placeholder
 * values in the design file, not data.
 */
const LEVEL_MAP = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Card 1 (Claude AI) is themed orange, everything else blue — matches the Figma. */
const VISUAL_THEME = {
  'mas-claude-ai-for-data-analyst': { bg: 'bg-[#f97316]', image: '/masterclass-element/13_course_claude_ai_card.png' },
};
const DEFAULT_THEME = { bg: 'bg-[#1d64f2]', image: '/masterclass-element/14_course_ai_digital_card.png' };

export function MasterclassCard({ course }) {
  const firstBatch = course.batches?.[0];
  const theme = VISUAL_THEME[course.slug] ?? DEFAULT_THEME;
  const scheduleNote = `*เรียนเฉพาะวัน${(course.schedule_days ?? []).join('/')} ${course.time_start ?? ''} - ${course.time_end ?? ''} น.`;

  return (
    <Link
      href={`/masterclass/${course.slug}`}
      className="group flex flex-1 flex-col overflow-hidden rounded-[20px] border border-[#e2e8f0] bg-white transition-shadow hover:shadow-lg"
    >
      {/* Top visual band */}
      <div className="relative flex h-[200px] w-full flex-col justify-between p-6">
        <div aria-hidden className="absolute inset-0">
          <Image src={theme.image} alt="" fill className="object-cover" sizes="(max-width:768px) 100vw, 50vw" />
          <div className="absolute inset-0 bg-[rgba(3,10,22,0.8)]" />
        </div>
        <div className="relative flex w-full items-center justify-between">
          <span className={`inline-flex items-start rounded-full ${theme.bg} px-3 py-1`}>
            <span className="text-xs font-semibold text-white">Masterclass</span>
          </span>
          <span className="text-sm font-bold text-white">9Expert</span>
        </div>
        <p className="relative w-full text-2xl font-bold text-white">{course.title_th}</p>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[13px] text-[#475569]">
            <Clock size={14} />
            {course.duration_days} วัน
          </span>
          {course.level && (
            <span className="flex items-center gap-1.5 text-[13px] text-[#475569]">
              <BarChart2 size={14} />
              {LEVEL_MAP[course.level] ?? course.level}
            </span>
          )}
        </div>

        {course.subtitle_th && (
          <p className="line-clamp-3 text-sm leading-[1.5] text-[#475569]">{course.subtitle_th}</p>
        )}

        {firstBatch ? (
          <>
            {/* Price */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <span className="text-[28px] font-bold text-[#1d64f2]">
                  {firstBatch.effective_price?.toLocaleString('th-TH')} บาท
                </span>
                {firstBatch.is_early_bird && (
                  <span className="text-base text-[#64748b] line-through">
                    {firstBatch.original_price?.toLocaleString('th-TH')} บาท
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748b]">
                {firstBatch.is_early_bird ? '*ราคาพิเศษลงทะเบียนล่วงหน้า Early Bird' : scheduleNote}
              </p>
            </div>

            {/* Countdown */}
            {firstBatch.is_early_bird && firstBatch.early_bird_deadline && (
              <div className="flex w-full flex-col gap-2 rounded-xl bg-[#f1f5f9] p-3">
                <p className="w-full text-center text-xs font-semibold text-[#475569]">
                  ระยะเวลาส่วนลด Early Bird สิ้นสุดใน:
                </p>
                <CountdownTimer deadline={firstBatch.early_bird_deadline} className="justify-center" />
              </div>
            )}

            {/* Capacity */}
            <div className="flex w-full flex-col gap-2">
              <div className="flex w-full items-start justify-between text-xs">
                <span className="text-[#475569]">รับจำกัด {firstBatch.capacity} ที่นั่ง</span>
                <span
                  className={
                    firstBatch.status === 'full'
                      ? 'font-semibold text-red-500'
                      : 'font-semibold text-[#10b981]'
                  }
                >
                  {firstBatch.status === 'full'
                    ? 'เต็มแล้ว'
                    : `ว่าง ${Math.max(0, firstBatch.capacity - firstBatch.registered_count)} ที่นั่ง`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#e2e8f0]">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    firstBatch.status === 'full' ? 'bg-red-500' : 'bg-[#10b981]'
                  }`}
                  style={{
                    width: `${Math.min(100, (firstBatch.registered_count / firstBatch.capacity) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* CTA */}
            {firstBatch.status === 'full' ? (
              <span className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-gray-200 py-3 text-sm font-semibold text-gray-400">
                เต็มแล้ว
              </span>
            ) : (
              <span className="flex w-full items-center justify-center rounded-xl bg-[#1d64f2] py-3 text-[15px] font-semibold text-white">
                เปิดรับสมัคร
              </span>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">ยังไม่เปิดรับสมัคร</p>
        )}
      </div>
    </Link>
  );
}
