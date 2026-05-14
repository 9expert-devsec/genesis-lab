'use client';

import { useRef, useEffect } from 'react';

const ROW_A_NAMES = [
  'ajinomoto', 'betagro', 'charoen pokphand', 'cpf', 'sony', 'cargill', 'gpv',
  'metropolitan electricity', 'bank of thailand', 'mitsubishi', 'nippon steel',
  'pandora', 'ptt', 'siam cement', 'scg', 'thai beverage', 'thaibev',
  'siam commercial bank', 'scb', 'land and houses bank', 'lh bank',
  'abbott', 'kao',
];

function assignRows(logos) {
  const hasOrder = logos.some((l) => l.display_order > 10);

  if (hasOrder) {
    const sorted = [...logos].sort((a, b) => a.display_order - b.display_order);
    const mid    = Math.ceil(sorted.length / 2);
    return { rowA: sorted.slice(0, mid), rowB: sorted.slice(mid) };
  }

  const rowA = [], rowB = [];
  for (const logo of logos) {
    const name = logo.company_name.toLowerCase();
    const inA  = ROW_A_NAMES.some((k) => name.includes(k));
    (inA ? rowA : rowB).push(logo);
  }
  if (rowA.length === 0 || rowB.length === 0) {
    const half = Math.ceil(logos.length / 2);
    return { rowA: logos.slice(0, half), rowB: logos.slice(half) };
  }
  return { rowA, rowB };
}

export default function ClientLogosSection({ logos }) {
  if (!logos || logos.length === 0) return null;

  const { rowA, rowB } = assignRows(logos);

  return (
    <section className="overflow-hidden bg-[var(--page-bg-muted)] py-20 dark:bg-[var(--page-bg)]">
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="font-heading text-3xl font-bold text-9e-navy dark:text-white lg:text-4xl">
          องค์กรที่ให้ความไว้วางใจ
        </h2>
        <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          บริษัทและองค์กรชั้นนำกว่า 5000+ แห่งจากทุกอุตสาหกรรม
        </p>
      </div>

      <div className="mt-14 space-y-6">
        <MarqueeRow logos={rowA} direction="left" speed={40} />
        <MarqueeRow logos={rowB} direction="right" speed={35} />
      </div>
    </section>
  );
}

function MarqueeRow({ logos, direction, speed = 40 }) {
  const items = [...logos, ...logos, ...logos];

  const trackRef   = useRef(null);
  const animRef    = useRef(null);
  const posRef     = useRef(0);
  const pausedRef  = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const getSetWidth = () => track.scrollWidth / 3;

    let lastTime = null;

    const step = (ts) => {
      if (!lastTime) lastTime = ts;
      const delta = ts - lastTime;
      lastTime = ts;

      if (!pausedRef.current) {
        const setWidth = getSetWidth();
        const move     = (speed * delta) / 1000;

        if (direction === 'left') {
          posRef.current -= move;
          if (posRef.current <= -setWidth) posRef.current += setWidth;
        } else {
          posRef.current += move;
          if (posRef.current >= 0) posRef.current -= setWidth;
        }

        track.style.transform = `translateX(${posRef.current}px)`;
      }

      animRef.current = requestAnimationFrame(step);
    };

    if (direction === 'right') posRef.current = -getSetWidth();

    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [direction, speed]);

  const pause = () => { pausedRef.current = true; };
  const resume = () => { pausedRef.current = false; };

  return (
    <div
      className="relative overflow-hidden"
      onMouseEnter={pause}
      onMouseLeave={resume}
      style={{
        maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
      }}
    >
      <div
        ref={trackRef}
        className="flex items-center gap-12 will-change-transform"
        style={{ width: 'max-content' }}
      >
        {items.map((logo, i) => (
          <div
            key={`${logo._id}-${i}`}
            className="flex h-[72px] w-[140px] shrink-0 items-center justify-center"
          >
            <img
              src={logo.image_url}
              alt={logo.company_name}
              className="h-auto max-h-[52px] w-auto max-w-[130px] object-contain opacity-70 transition-opacity duration-300 hover:opacity-100 dark:opacity-40 dark:brightness-0 dark:invert"
              loading="lazy"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
