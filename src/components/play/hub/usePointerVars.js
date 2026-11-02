'use client';

import { useEffect, useRef } from 'react';

const QUERY = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/**
 * Pointer position over an element as CSS variables `--px` / `--py` in −1…1,
 * written straight to the element's style — no React state, no re-render per
 * mousemove. Children read them in `calc()` for tilt and parallax.
 *
 * Off (the variables stay 0) on touch devices, coarse pointers and with
 * prefers-reduced-motion, re-checked when either preference changes.
 */
export function usePointerVars() {
  const ref = useRef(null);
  const enabled = useRef(false);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia(QUERY);
    } catch {
      return undefined;
    }
    const sync = () => {
      enabled.current = mq.matches;
      if (!mq.matches) reset();
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--px', '0');
    el.style.setProperty('--py', '0');
  }

  function onPointerMove(e) {
    const el = ref.current;
    if (!enabled.current || e.pointerType !== 'mouse' || !el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.style.setProperty('--px', Math.max(-1, Math.min(1, x)).toFixed(3));
    el.style.setProperty('--py', Math.max(-1, Math.min(1, y)).toFixed(3));
  }

  return { ref, onPointerMove, onPointerLeave: reset };
}

/** A transform that follows the pointer by up to `dx`/`dy` px (and `rot` deg). */
export function follow(dx, dy, rot = 0) {
  return {
    transform: `translate3d(calc(var(--px, 0) * ${dx}px), calc(var(--py, 0) * ${dy}px), 0)${
      rot ? ` rotate(calc(var(--px, 0) * ${rot}deg))` : ''
    }`,
    transition: 'transform 240ms cubic-bezier(0, 0, 0.2, 1)',
  };
}
