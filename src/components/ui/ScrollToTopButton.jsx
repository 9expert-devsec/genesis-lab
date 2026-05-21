'use client';

import { useEffect, useState } from 'react';

/**
 * Floating back-to-top button — mounted from the public layout so it
 * covers every non-admin page. Appears once the reader has scrolled
 * past 400px, smooth-scrolls to the top on click.
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
      className="fixed bottom-8 right-8 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-100/50 dark:border-[#1e3a5f] dark:bg-[#111d2c] dark:text-[#94a3b8] dark:hover:border-blue-500 dark:hover:text-blue-400"
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