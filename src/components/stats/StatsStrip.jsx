'use client';

import { useEffect, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatParts, ratingParts, statParts } from '@/lib/stats/formatStat';

/**
 * The site's headline-number strip, shared by Home (variant "divided") and
 * About (variant "panel"). Items come from buildStatItems(getSiteStats(), …)
 * via the server parent — this component never fetches.
 *
 * ── THE SERVER HTML CARRIES THE FINAL NUMBERS ───────────────────────────────
 * Every value renders formatted on the server and on the first client render,
 * so crawlers, no-JS visitors and full-page screenshots read "90K+", never an
 * empty span or a "0". The count-up is an enhancement layered on after
 * hydration, and only when ALL of these hold:
 *   · reduced motion is not requested,
 *   · the strip is below the fold at hydration (a strip already on screen is
 *     never yanked back to 0 in front of the reader),
 * then it runs once, when the strip scrolls into view.
 */

const DURATION_MS = 1350;

/** 'final' (show the real value) → 'armed' (0, waiting below the fold) → 'run'. */
function useCountUpPhase(ref) {
  const [phase, setPhase] = useState('final');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (el.getBoundingClientRect().top < window.innerHeight) return undefined;

    setPhase('armed');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase('run');
          io.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return phase;
}

function StatValue({ item, phase }) {
  const parts = item.kind === 'rating' ? ratingParts(item.value) : statParts(item.value);
  const [current, setCurrent] = useState(parts.target);

  useEffect(() => {
    if (phase === 'armed') {
      setCurrent(0);
      return undefined;
    }
    if (phase !== 'run') return undefined;
    let start = null;
    let raf = 0;
    const step = (ts) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / DURATION_MS, 1);
      // cubic ease-out; the last frame snaps to the exact target
      setCurrent(p < 1 ? (1 - Math.pow(1 - p, 3)) * parts.target : parts.target);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, parts.target]);

  return formatParts(phase === 'final' ? parts : { ...parts, target: current });
}

// Divider classes per position. Below lg the strip is 3 columns, so the 3rd
// item of each row (and the last item) carries no divider; at lg it is one row
// and only the last item has none. Complete literals, for Tailwind's scanner.
function dividerClass(i, count) {
  if (i === count - 1) return '';
  if (i % 3 === 2) return 'lg:border-r-4';
  return 'md:border-r-4';
}

const LG_COLS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

// Panel dividers: 3 columns below lg (a vertical rule left of columns 2–3, one
// horizontal rule above the second row), one row at lg (a vertical rule left of
// every item but the first). Complete literals, for Tailwind's scanner.
function panelDividerClass(i) {
  if (i === 0) return '';
  if (i % 3 === 0) return 'border-t lg:border-l lg:border-t-0';
  if (i > 3) return 'border-l border-t lg:border-t-0';
  return 'border-l';
}

/**
 * @param {{ items: { key: string, value: number, label: string,
 *   kind?: 'count'|'rating', star?: boolean, accent?: boolean }[],
 *   variant?: 'divided'|'panel', className?: string }} props
 */
export function StatsStrip({ items = [], variant = 'divided', className }) {
  const ref = useRef(null);
  const phase = useCountUpPhase(ref);
  if (!items.length) return null;

  // About's Proof section: one card, ruled cells. `accent` paints a number
  // brand blue. Opt-in — Home ('divided') never reaches this branch.
  if (variant === 'panel') {
    return (
      <div
        ref={ref}
        className={cn(
          'grid grid-cols-3 overflow-hidden rounded-3xl border border-[var(--surface-border)] bg-[var(--surface-raised)] text-center shadow-9e-lg',
          LG_COLS[items.length],
          className
        )}
      >
        {items.map((item, i) => (
          <div
            key={item.key}
            className={cn(
              // about-stat-* are hover hooks styled in globals.css (About only)
              'about-stat-cell flex min-w-0 flex-col items-center justify-center gap-1 border-[var(--surface-border)] px-2 py-5 lg:py-8',
              panelDividerClass(i)
            )}
          >
            <span
              className={cn(
                'about-stat-num whitespace-nowrap text-2xl font-extrabold leading-tight md:text-3xl lg:text-4xl',
                item.accent ? 'text-9e-action dark:text-9e-air' : 'text-[var(--text-primary)]'
              )}
            >
              <StatValue item={item} phase={phase} />
            </span>
            <span className="text-xs text-[var(--text-secondary)] md:text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={cn('grid grid-cols-3 gap-y-6 text-center', LG_COLS[items.length], className)}
    >
      {items.map((item, i) => (
        <div
          key={item.key}
          className={cn(
            'flex min-w-0 flex-col items-center gap-1 border-gray-300 dark:border-[#1e3a5f]',
            dividerClass(i, items.length)
          )}
        >
          <div className="flex items-center gap-1">
            {item.star && <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />}
            <span className="whitespace-nowrap text-2xl font-extrabold text-9e-navy dark:text-white">
              <StatValue item={item} phase={phase} />
            </span>
          </div>
          <span className="whitespace-nowrap text-sm text-9e-slate-dp-50 dark:text-[#94a3b8]">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
