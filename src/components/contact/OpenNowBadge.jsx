'use client';

import { useEffect, useState } from 'react';

function computeStatus() {
  const now = new Date();
  const hour = parseInt(
    new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    }).format(now),
    10,
  );
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'Asia/Bangkok',
  }).format(now);
  const isWeekday = !['Saturday', 'Sunday'].includes(day);
  return isWeekday && hour >= 8 && hour < 17;
}

export default function OpenNowBadge() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(computeStatus());
    setMounted(true);
    const interval = setInterval(() => setIsOpen(computeStatus()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return (
      <div className="inline-flex h-7 w-32 animate-pulse items-center gap-2 rounded-full border border-[#E2E8F0] bg-white/60 dark:border-[#1e3a5f] dark:bg-white/5" />
    );
  }

  return (
    <div
      className={
        isOpen
          ? 'inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400'
          : 'inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400'
      }
    >
      <span
        className={
          isOpen
            ? 'h-2 w-2 animate-pulse rounded-full bg-green-500'
            : 'h-2 w-2 rounded-full bg-red-500'
        }
      />
      {isOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
    </div>
  );
}
