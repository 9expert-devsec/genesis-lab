'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Early Bird banner — horizontal amber card shown above the course
 * schedule. Reads its config (price, deadline, label, linked schedule)
 * from EarlyBirdConfig and pulls the thumbnail from the linked Promotion.
 *
 * Renders nothing once the countdown reaches zero — the visibility flips
 * client-side so the banner disappears immediately, without waiting for
 * a server revalidation.
 *
 * Props:
 *   earlyBird           — EarlyBirdConfig doc (caller checks for null)
 *   earlyBirdPromotion  — joined Promotion doc or null
 *   schedules           — full schedules array from page
 *   course              — course object (for course_id + name)
 */

const MONTHS_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatScheduleRange(schedule) {
  const dates = [...(schedule?.dates ?? [])].sort();
  if (!dates.length) return '';
  const start = new Date(dates[0]);
  const end = new Date(dates.at(-1));
  if (Number.isNaN(start.getTime())) return '';
  const startStr = `${start.getDate()} ${MONTHS_TH[start.getMonth()]} ${start.getFullYear() + 543}`;
  if (start.getTime() === end.getTime()) return startStr;
  const endStr = `${end.getDate()} ${MONTHS_TH[end.getMonth()]} ${end.getFullYear() + 543}`;
  return `${startStr} – ${endStr}`;
}

export function EarlyBirdBanner({
  earlyBird,
  earlyBirdPromotion,
  schedules,
  course,
}) {
  const [expired, setExpired] = useState(false);

  if (!earlyBird || expired) return null;

  const linkedSchedule = earlyBird.schedule_id
    ? schedules?.find((s) => s._id === earlyBird.schedule_id) ?? null
    : null;
  const scheduleLabel = linkedSchedule ? formatScheduleRange(linkedSchedule) : '';

  const hasPrice =
    earlyBird.special_price != null && Number(earlyBird.special_price) > 0;
  const registerHref = earlyBird.schedule_id
    ? `/registration/public?course=${String(course.course_id).toLowerCase()}&class=${earlyBird.schedule_id}`
    : null;

  const thumbnail = earlyBirdPromotion?.thumbnail_url ?? '';
  // Prefer the linked promotion's title (e.g. "Excel for AI - Early Bird")
  // and fall back to the course name when no promotion is linked.
  const courseName = course?.course_name_th || course?.course_name || '';
  const title = earlyBirdPromotion?.title || courseName;

  return (
    <section
      aria-label="Early Bird"
      className="rounded-9e-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-[#2a1f00]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {thumbnail && (
          <div className="relative h-[80px] w-[120px] shrink-0 overflow-hidden rounded-9e-md bg-9e-ice dark:bg-9e-card">
            <Image
              src={thumbnail}
              alt={earlyBirdPromotion?.image_alt || earlyBirdPromotion?.title || 'Early Bird'}
              fill
              sizes="120px"
              className="object-cover"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2 py-0.5 font-en text-xs font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            {earlyBird.label_th || 'Early Bird'}
          </span>
          {title && (
            <p className="truncate font-heading font-bold text-9e-navy dark:text-white">
              {title}
            </p>
          )}
          {scheduleLabel && (
            <p className="flex items-center gap-1.5 text-xs text-9e-slate-dp-50 dark:text-9e-slate-lt-300">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>รอบ: {scheduleLabel}</span>
            </p>
          )}
          {hasPrice && (
            <>
              <p className="text-2xl font-extrabold text-9e-action">
                {Number(earlyBird.special_price).toLocaleString('th-TH')} บาท
              </p>
              <p className="text-xs text-9e-slate-dp-50 dark:text-9e-slate-lt-300">
                *ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม
              </p>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:min-w-[200px] sm:items-end">
          {earlyBird.deadline && (
            <CountdownTimer
              deadline={earlyBird.deadline}
              onExpire={() => setExpired(true)}
            />
          )}
          {registerHref ? (
            <Link href={registerHref} className="btn-9e-cta text-sm">
              ลงทะเบียน
            </Link>
          ) : (
            <span
              aria-disabled
              className="btn-9e-cta pointer-events-none cursor-not-allowed text-sm opacity-50"
            >
              ลงทะเบียน
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Countdown — ticks every 1s. Once the diff hits zero it calls
 * `onExpire` so the parent can unmount the whole banner.
 */
function CountdownTimer({ deadline, onExpire }) {
  const target = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, target - Date.now())
  );

  useEffect(() => {
    if (Number.isNaN(target)) return undefined;
    setRemaining(Math.max(0, target - Date.now()));
    const id = setInterval(() => {
      const next = Math.max(0, target - Date.now());
      setRemaining(next);
      if (next === 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (Number.isNaN(target) || remaining <= 0) {
    return (
      <p className="text-xs font-semibold text-9e-slate-dp-50">หมดเวลา</p>
    );
  }

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  return (
    <div
      role="timer"
      aria-label="เวลาที่เหลือ"
      className="flex items-center justify-end gap-1.5"
    >
      <CountdownBox value={days} unit="วัน" />
      <CountdownBox value={hours} unit="ชม." padded />
      <CountdownBox value={minutes} unit="นาที" padded />
      <CountdownBox value={seconds} unit="วินาที" padded />
    </div>
  );
}

function CountdownBox({ value, unit, padded = false }) {
  const display = padded ? String(value).padStart(2, '0') : String(value);
  return (
    <div
      className={cn(
        'flex min-w-[40px] flex-col items-center rounded-9e-sm bg-9e-navy px-2 py-1 text-white',
        'dark:bg-black/40'
      )}
    >
      <span className="font-en text-base font-bold leading-tight">{display}</span>
      <span className="text-[10px] leading-tight opacity-80">{unit}</span>
    </div>
  );
}
