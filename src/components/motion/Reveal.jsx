'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Scroll reveal that is VISIBLE BY DEFAULT.
 *
 * The server HTML and the first client render carry no opacity or transform at
 * all, so a crawler, a no-JS visitor, a print, or a full-page screenshot always
 * gets the content. Framer's `initial={{ opacity: 0 }}` + `whileInView` shipped
 * `opacity:0` in the server HTML and left whatever never scrolled into view —
 * or was captured mid-transition — invisible or half-faded.
 *
 * After hydration, and only if the element is BELOW THE FOLD and reduced motion
 * is not requested, it is hidden and then faded/slid in once when it enters the
 * viewport. Anything already on screen (or above it) is never touched.
 *
 * Plain CSS transitions, so the reduced-motion clamp in globals.css applies too.
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  y = 20,
  duration = 550,
  style,
  children,
  ...rest
}) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('shown'); // 'shown' | 'hidden' | 'revealing'

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (el.getBoundingClientRect().top < window.innerHeight) return undefined;

    setPhase('hidden');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPhase('revealing');
          io.disconnect();
        }
      },
      // rootMargin, not a ratio threshold, so an element taller than the
      // viewport still reveals.
      { rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  let motionStyle;
  if (phase === 'hidden') {
    motionStyle = { opacity: 0, transform: `translateY(${y}px)` };
  } else if (phase === 'revealing') {
    const t = `${duration}ms cubic-bezier(0, 0, 0.2, 1) ${delay}ms`;
    motionStyle = { opacity: 1, transform: 'none', transition: `opacity ${t}, transform ${t}` };
  }

  return (
    <Tag ref={ref} style={motionStyle ? { ...style, ...motionStyle } : style} {...rest}>
      {children}
    </Tag>
  );
}
