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
    <section
      aria-label="องค์กรที่ให้ความไว้วางใจ"
      /* py-20 in BOTH themes. The `dark:py-12` that used to be here existed
       * only to cancel the panel's `dark:py-8`; with the panel gone there is
       * nothing to compensate, and a theme-conditional padding would be the
       * very reflow-on-toggle it was added to prevent. */
      /* ROUND HS-B: bg-[var(--page-bg)] alone, no dark: override — --page-bg
         already differs FFFFFF (light) / 0D1B2A (dark) in globals.css, so the
         explicit dark:bg-[var(--page-bg)] this used to carry was redundant
         (it named the same var the base class now already resolves under
         .dark). Dropping bg-[var(--page-bg-muted)] also means the section no
         longer stands out as a distinct muted band from its neighbours. */
      className="overflow-hidden bg-[var(--page-bg)] py-20"
    >
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="font-heading text-[28px] font-bold text-9e-navy dark:text-white">
          องค์กรที่ให้ความไว้วางใจ
        </h2>
        <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          ได้รับความไว้วางใจจากบริษัทและองค์กรชั้นนำมากกว่า 5,000 แห่ง ครอบคลุมหลากหลายอุตสาหกรรม
        </p>
      </div>

      <p className="sr-only">
        บริษัทและองค์กรชั้นนำที่ใช้บริการ ได้แก่ {rowA.concat(rowB).map(l => l.company_name).join(', ')}
      </p>

      {/* No panel, no tiles. The rows sit directly on the section background,
        * so each row's `mask-image` fades its edges into the page colour —
        * which is what a mask does when nothing is layered behind it. The
        * light-panel version terminated the fade on the panel's own hard
        * edge, which read as clipping rather than fading. */}
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

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return; // stop animation entirely

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
      aria-hidden="true"
      role="presentation"
      className="relative overflow-hidden max-w-[1200px] mx-auto"
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
          /* Plain slot — no background, no rounding, in either mode. */
          <div
            key={`${logo._id}-${i}`}
            className="flex h-[72px] w-[140px] shrink-0 items-center justify-center"
          >
            {/* MONOCHROME WALL, dark mode only.
              *
              * `brightness-0 invert` maps every opaque pixel to the same
              * white, at FULL opacity — the `opacity-40` that used to sit
              * alongside it was the actual defect, turning the wall into
              * ghosts. Light mode is untouched: original colour, full opacity.
              *
              * The exception is data, not a name list: brightness(0) erases
              * every ENCLOSED counter-form, so a logo whose mark depends on
              * one (the gold tree inside SCB's purple square, the '9' inside
              * Praram 9's teal block) collapses to a featureless blob. Those
              * carry `keepColorOnDark` and render in original colour, which
              * is legible because their bright elements sit inside their own
              * coloured fields. See ClientLogo.keepColorOnDark. */}
            <img
              src={logo.image_url}
              alt={logo.company_name}
              className={
                'h-auto max-h-[52px] w-auto max-w-[130px] object-contain' +
                (logo.keepColorOnDark ? '' : ' dark:brightness-0 dark:invert')
              }
              loading="lazy"
              draggable={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
