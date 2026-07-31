'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Horizontal arrow slider for card rows.
 *
 * Built on native `overflow-x` + CSS scroll-snap rather than a
 * `translateX(calc(...))` transform, for three reasons:
 *
 *   1. Responsiveness lives entirely in CSS (`basis-*` per breakpoint),
 *      so there is no `perPage` constant to keep in sync with the card
 *      width and no breakpoint state to hydrate.
 *   2. Arrow visibility is DERIVED from the real scroll position, not
 *      from an index counter — so it can only be wrong if the browser's
 *      own scroll metrics are wrong. A row that does not overflow shows
 *      no arrows because `scrollWidth === clientWidth`, not because some
 *      `total - perPage` arithmetic happened to come out ≤ 0.
 *   3. Touch/trackpad swipe and keyboard scrolling come for free.
 *
 * Paging advances by one *viewport* (`clientWidth`), not one card.
 *
 * Both arrows are real <button>s, so Tab / Enter / Space work natively.
 * They are UNMOUNTED at the bounds rather than disabled, matching the
 * behaviour of the slider this replaces.
 *
 * @param items        array of records to render
 * @param renderItem   (item, i) => node — the card itself
 * @param getKey       (item, i) => React key
 * @param arrows       'outside' (default) hangs the arrows past the
 *                     track edge — correct when the parent has its own
 *                     padding to hang into. 'inside' insets them over
 *                     the first/last card, for parents with no padding.
 */
export function ArrowSlider({
  items = [],
  renderItem,
  getKey = (_item, i) => i,
  arrows = 'outside',
}) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  // Both flags start false, so the server render and the first client
  // render agree (no arrows); the mount sync below turns `next` on when
  // the content actually overflows. Cheaper than guessing widths on the
  // server and getting a hydration mismatch.
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    // 1px tolerance absorbs sub-pixel rounding — without it a row that
    // fits exactly can report scrollWidth one pixel over clientWidth and
    // render a next arrow that scrolls nowhere.
    setCanPrev(el.scrollLeft > 1);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;

    sync();
    el.addEventListener('scroll', sync, { passive: true });

    // Track width drives every card's flex-basis, so observing the track
    // covers both viewport resize and breakpoint changes. Falls back to
    // a window listener where ResizeObserver is unavailable.
    let ro;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    } else {
      window.addEventListener('resize', sync);
    }

    return () => {
      el.removeEventListener('scroll', sync);
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', sync);
    };
  }, [sync, items.length]);

  const page = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: 'smooth' });
  };

  if (items.length === 0) return null;

  const arrowBase =
    'absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--surface-border)] bg-white shadow-sm hover:bg-9e-ice dark:bg-[#111d2c] dark:hover:bg-[#0D1B2A]';
  const prevPos = arrows === 'inside' ? 'left-2' : '-left-4';
  const nextPos = arrows === 'inside' ? 'right-2' : '-right-4';

  return (
    <div className="relative">
      {canPrev && (
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="ก่อนหน้า"
          className={`${arrowBase} ${prevPos}`}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}

      {/* `py-2 -my-2` is a no-op on outer layout but gives the cards'
          hover lift + shadow vertical room inside the scrollport, which
          `overflow-x-auto` would otherwise clip. */}
      <div
        ref={trackRef}
        className="scrollbar-hide -my-2 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth py-2"
      >
        {items.map((item, i) => (
          <div
            key={getKey(item, i)}
            className="shrink-0 basis-full snap-start sm:basis-[calc((100%-16px)/2)] lg:basis-[calc((100%-32px)/3)]"
          >
            {renderItem(item, i)}
          </div>
        ))}
      </div>

      {canNext && (
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="ถัดไป"
          className={`${arrowBase} ${nextPos}`}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      )}
    </div>
  );
}
