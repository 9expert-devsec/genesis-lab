'use client';

import { useEffect, useState } from 'react';

/**
 * Back-to-top button. Appears once the reader has scrolled past 400px,
 * smooth-scrolls to the top on click.
 *
 * ── IT DOES NOT POSITION ITSELF, AND THAT IS DELIBERATE ─────────────────────
 * No `fixed`, no `z-`, no `bottom-`, no `right-`, and no `usePathname`. All of
 * that moved to FloatingActionDock, which is the single fixed container for the
 * bottom-right stack. This button is now just a round button that knows when to
 * show itself; where it sits, what it sits above, and whether the stack lifts
 * clear of a page's mobile bottom bar are the dock's business.
 *
 * Re-adding a position utility here would reintroduce exactly the problem the
 * dock exists to prevent: two fixed elements whose offsets have to agree, with
 * nothing checking that they do. test/pure/floatingDockStack.test.mjs asserts
 * this file stays free of them.
 *
 * Returning null when hidden (rather than fading out in place) is what lets the
 * dock's bottom slot stay put — an absent flex item takes no space, and the
 * container is anchored at the bottom.
 *
 * ── 44px, NOT 40 ────────────────────────────────────────────────────────────
 * h-11/w-11. It shipped at h-10 (40px), four under the 44px minimum tap target,
 * and was raised when the chat launcher joined it in the dock: two circles of
 * different diameters stacked in one corner reads as a mistake, and matching
 * them DOWN would have meant shipping a new control that misses the target on
 * purpose. The visual weight change is small; the click-test list names it.
 */
export function ScrollToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="กลับขึ้นด้านบน"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-100/50 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-[#94a3b8] dark:hover:border-blue-500 dark:hover:text-blue-400"
    >
      <svg
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  );
}
