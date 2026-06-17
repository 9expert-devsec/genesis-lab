'use client';

import { useEffect, useState } from 'react';

function getTimeLeft(deadline) {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

export function CountdownTimer({ deadline, className = '' }) {
  const [hydrated, setHydrated] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    setHydrated(true);
    setTimeLeft(getTimeLeft(deadline));
    const id = setInterval(() => {
      const t = getTimeLeft(deadline);
      setTimeLeft(t);
      if (t.days === 0 && t.hours === 0 && t.minutes === 0 && t.seconds === 0) {
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!hydrated) return null;

  const units = [
    { value: timeLeft.days,    label: 'วัน' },
    { value: timeLeft.hours,   label: 'ชั่วโมง' },
    { value: timeLeft.minutes, label: 'นาที' },
    { value: timeLeft.seconds, label: 'วินาที' },
  ];

  return (
    <div className={`flex gap-2 ${className}`}>
      {units.map(({ value, label }) => (
        <div
          key={label}
          className="flex min-w-[48px] flex-col items-center rounded-lg bg-9e-navy px-3 py-1.5 dark:bg-white/10"
        >
          <span className="tabular-nums text-xl font-bold text-white">
            {String(value).padStart(2, '0')}
          </span>
          <span className="text-[10px] text-9e-air">{label}</span>
        </div>
      ))}
    </div>
  );
}
