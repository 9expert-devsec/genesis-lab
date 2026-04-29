'use client';

import { useEffect, useRef } from 'react';

/**
 * iOS-safe swipe hook using `addEventListener` instead of JSX onTouch*.
 *
 * Why not JSX onTouch*?
 *   React attaches touch listeners as { passive: true } by default and
 *   they bubble through React's synthetic system. iOS Safari additionally
 *   cancels the gesture when it detects a scrollable parent — without
 *   `passive: false` on touchmove we cannot call preventDefault() to
 *   keep the page from scrolling vertically when the user swipes
 *   horizontally. The fix is to attach the native listener directly with
 *   `{ passive: false }` on touchmove.
 *
 * Direction lock: on the very first move, we measure |dx| vs |dy| once
 * and lock the gesture to that axis for the rest of the touch. That way
 * a near-vertical drag never blocks page scroll, and a near-horizontal
 * drag never gets eaten by scroll.
 */
export function useSwipe(
  elementRef,
  { onSwipeLeft, onSwipeRight } = {},
  threshold = 50
) {
  const handlersRef = useRef({ onSwipeLeft, onSwipeRight });
  handlersRef.current = { onSwipeLeft, onSwipeRight };

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return undefined;

    let startX = null;
    let startY = null;
    let isHorizontal = null;

    const onStart = (e) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      isHorizontal = null;
    };

    const onMove = (e) => {
      if (startX === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (isHorizontal === null) {
        // Wait for a meaningful displacement before locking direction —
        // jitter at touch-down should not commit to a direction.
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        isHorizontal = Math.abs(dx) > Math.abs(dy);
      }

      if (isHorizontal) {
        // Block native horizontal scroll / vertical bounce so the swipe
        // is ours alone. Requires { passive: false } when registering.
        e.preventDefault();
      }
    };

    const onEnd = (e) => {
      if (startX === null) return;
      const t = e.changedTouches[0];
      if (t && isHorizontal) {
        const dx = t.clientX - startX;
        if (Math.abs(dx) > threshold) {
          if (dx < 0) handlersRef.current.onSwipeLeft?.();
          else handlersRef.current.onSwipeRight?.();
        }
      }
      startX = null;
      startY = null;
      isHorizontal = null;
    };

    const onCancel = () => {
      startX = null;
      startY = null;
      isHorizontal = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [elementRef, threshold]);
}
