'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Stats grid with count-up animation triggered on viewport entry.
 *
 * `stats` is an array of `{ value, label }`. `value` may include a
 * non-numeric suffix (e.g. "30+", "5,000+") — we parse the leading
 * digits, animate from 0 to that target, and re-attach the suffix at
 * the end so the visual format matches exactly what the editor wrote.
 */

const DURATION_MS = 1500;

function parseValue(input) {
  const str = String(input ?? '');
  const match = str.match(/^([\d,]+)(.*)$/);
  if (!match) return { number: null, suffix: str };
  const number = Number(match[1].replace(/,/g, ''));
  if (Number.isNaN(number)) return { number: null, suffix: str };
  return { number, suffix: match[2] ?? '' };
}

function formatNumber(n, withCommas) {
  if (!withCommas) return String(n);
  return n.toLocaleString('en-US');
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function StatsCounter({ stats }) {
  const ref = useRef(null);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasStarted(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-6 md:grid-cols-5 md:gap-8"
    >
      {stats.map((stat) => (
        <StatItem
          key={stat.label}
          rawValue={stat.value}
          label={stat.label}
          start={hasStarted}
        />
      ))}
    </div>
  );
}

function StatItem({ rawValue, label, start }) {
  const { number, suffix } = parseValue(rawValue);
  const withCommas = String(rawValue ?? '').includes(',');
  const [display, setDisplay] = useState(number == null ? rawValue : '0');

  useEffect(() => {
    if (!start || number == null) return undefined;
    let raf;
    const startedAt = performance.now();

    const tick = (now) => {
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / DURATION_MS);
      const current = Math.round(number * easeOutCubic(t));
      setDisplay(formatNumber(current, withCommas) + suffix);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, number, suffix, withCommas]);

  return (
    <div className="text-center">
      <p className="text-4xl font-bold text-[#005CFF] dark:text-[#48B0FF] md:text-5xl">
        {display}
      </p>
      <p className="mt-2 text-sm text-[#465469] dark:text-[#C5CEDA] md:text-base">
        {label}
      </p>
    </div>
  );
}
