'use client';

import { useEffect, useRef } from 'react';

/**
 * The hero mascot's cursor parallax — at most 8px toward the pointer.
 *
 * Desktop only: wired up only when the viewport is ≥1024px AND the primary
 * pointer is fine (a mouse), and never under prefers-reduced-motion. Touch
 * devices get no listener at all. Moves are batched to one write per animation
 * frame. The children (image, glow, stars) are server-rendered; this island
 * only owns the wrapper's transform.
 */
const MAX_PX = 8;

export default function MascotParallax({ children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia) return undefined;
    if (!window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let frame = 0;
    let x = 0;
    let y = 0;
    const onMove = (e) => {
      x = ((e.clientX / window.innerWidth) * 2 - 1) * MAX_PX;
      y = ((e.clientY / window.innerHeight) * 2 - 1) * MAX_PX;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (frame) cancelAnimationFrame(frame);
      el.style.transform = '';
    };
  }, []);

  return (
    <div ref={ref} className="about-mascot-parallax">
      {children}
    </div>
  );
}
