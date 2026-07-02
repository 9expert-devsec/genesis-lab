'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Act 5 — กลุ่มดาวสายอาชีพ. Each career path is a constellation: its
 * courses are stars connected by a line that draws in (stroke-dashoffset
 * transition) when the section enters the viewport, and redraws when the
 * selected path changes. IntersectionObserver + CSS only — no
 * ScrollTriggers in Phase 3. Reduced motion renders the line fully drawn.
 *
 * Star positions are deterministic: hashed from path title + star name,
 * spread left→right in curriculum order (the learning order) with y
 * jitter, so the same path always draws the same constellation.
 */

const VIEW_W = 800;
const VIEW_H = 420;

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function truncateName(name, max = 30) {
  const s = String(name ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function layoutStars(title, stars) {
  const n = stars.length;
  const padX = 80;
  return stars.map((name, i) => {
    const h = hashStr(`${title}:${i}:${name}`);
    const baseX = padX + ((VIEW_W - padX * 2) * i) / Math.max(n - 1, 1);
    const x = baseX + ((h % 45) - 22); // ±22 jitter
    // Deterministic zigzag: even stars ride an upper band (labels above),
    // odd stars a lower band (labels below). The two label rows can never
    // meet, so long adjacent course names cannot collide.
    const labelAbove = i % 2 === 0;
    const y = labelAbove ? 140 + ((h >> 4) % 60) : 240 + ((h >> 4) % 60);
    const r = 4 + (h % 3); // 4–6
    return { name, x, y, r, labelAbove };
  });
}

function ConstellationSvg({ constellation, draw, reduceMotion }) {
  const stars = useMemo(
    () => layoutStars(constellation.title, constellation.stars),
    [constellation]
  );
  const lineRef = useRef(null);

  // Line-draw: measure the polyline, then transition dashoffset len → 0.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len}`;
    if (reduceMotion) {
      line.style.transition = 'none';
      line.style.strokeDashoffset = '0'; // fully drawn, no animation
      return;
    }
    if (!draw) {
      line.style.transition = 'none';
      line.style.strokeDashoffset = `${len}`; // hidden until the section shows
      return;
    }
    line.style.transition = 'none';
    line.style.strokeDashoffset = `${len}`;
    line.getBoundingClientRect(); // flush so the transition actually runs
    line.style.transition = 'stroke-dashoffset 1.6s ease';
    line.style.strokeDashoffset = '0';
  }, [stars, draw, reduceMotion]);

  const points = stars.map((s) => `${s.x},${s.y}`).join(' ');
  const clampLabelX = (x) => Math.min(Math.max(x, 95), VIEW_W - 95);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`เส้นทาง ${constellation.title}: ${constellation.stars.join(', ')}`}
      className="w-full min-w-[640px] lg:min-w-0"
    >
      <polyline
        ref={lineRef}
        points={points}
        fill="none"
        stroke="#48B0FF"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {stars.map((star, i) => (
        <g key={`${star.name}-${i}`}>
          <circle cx={star.x} cy={star.y} r={star.r + 4} fill="none" stroke="#48B0FF" strokeWidth="1" opacity="0.45" />
          <circle cx={star.x} cy={star.y} r={star.r} fill="#F8FAFD" />
          <text
            x={clampLabelX(star.x)}
            y={star.labelAbove ? star.y - star.r - 14 : star.y + star.r + 22}
            textAnchor="middle"
            className="u9k-label"
          >
            {truncateName(star.name)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function CareerConstellation({ constellations }) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef(null);
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!constellations || constellations.length === 0) return null;

  const current = constellations[Math.min(active, constellations.length - 1)];

  return (
    <section ref={sectionRef} className="relative overflow-hidden py-24">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-widest text-9e-air">แผนที่ดวงดาว</p>
          <h2 className="mt-3 font-heading text-3xl font-bold text-9e-ice sm:text-4xl">
            กลุ่มดาวสายอาชีพ
          </h2>
          <p className="mx-auto mt-4 max-w-xl font-thai text-base text-[#8FA6BC]">
            เชื่อมดาวทีละดวง — เรียนคอร์สตามลำดับเส้นทาง แล้วเดินทางสู่สายอาชีพที่ใช่
          </p>
        </div>

        {/* ── path picker chips ── */}
        <div className="mt-10 flex gap-3 overflow-x-auto pb-2 lg:justify-center">
          {constellations.map((path, i) => (
            <button
              key={path.href}
              type="button"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 font-thai text-sm transition-colors duration-9e-micro ease-9e',
                i === active
                  ? 'bg-9e-lime font-semibold text-9e-navy'
                  : 'border border-white/15 text-[#8FA6BC] hover:border-9e-air/60 hover:text-9e-ice'
              )}
            >
              {path.title}
            </button>
          ))}
        </div>

        {/* ── the constellation ── */}
        <div className="mt-6 overflow-x-auto lg:overflow-visible">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.href}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.25 }}
            >
              <ConstellationSvg
                constellation={current}
                draw={inView}
                reduceMotion={reduceMotion}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 text-center">
          <Link
            href={current.href}
            className="inline-flex items-center gap-2 rounded-9e-xl border border-[#48B0FF] px-6 py-3 font-thai font-semibold text-[#48B0FF] transition-colors duration-9e-micro ease-9e hover:bg-[#48B0FF] hover:text-9e-navy"
          >
            ดูเส้นทาง {current.title}
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <style>{`
        .u9k-label {
          font-family: "LINE Seed Sans TH", var(--font-thai), sans-serif;
          font-size: 12.5px;
          fill: #8FA6BC;
        }
      `}</style>
    </section>
  );
}
