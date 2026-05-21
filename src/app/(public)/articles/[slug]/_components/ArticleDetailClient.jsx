'use client';

import { useEffect, useState } from 'react';

/**
 * Reading-progress chrome for the article detail page.
 *
 * Wraps the server-rendered article body (passed as `children`) and
 * adds two pieces of client-only UI:
 *   1. A 3-px gradient progress bar pinned just under the site nav
 *      (top:80px, matching the h-20 header), driven by overall page
 *      scroll so the header/footer/related-articles sections count
 *      toward the visible progress.
 *   2. A circular "XX%" badge in the bottom-right that fades in when
 *      the cursor is over the article content area — readers who
 *      hover to read get the readout; everyone else gets a clean view.
 *
 * The global back-to-top button lives in the public layout
 * (<ScrollToTopButton />) so every public page gets it — we don't
 * render one here.
 *
 * Two distinct progress measurements are tracked:
 *   - `barProgress` — full document scroll percentage, drives the bar.
 *   - `progress`    — content-only scroll percentage (measured against
 *                     the #article-content element), drives the circle.
 * The content-only metric is the meaningful "have I finished reading
 * the body?" number, while the bar's full-page metric is what readers
 * intuitively expect a top-of-page progress indicator to show.
 */
export function ArticleDetailClient({ children }) {
  const [progress, setProgress]         = useState(0);
  const [barProgress, setBarProgress]   = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [hovering, setHovering]         = useState(false);

  useEffect(() => {
    const el = document.getElementById('article-content');

    function handleScroll() {
      // Full-document scroll → top progress bar.
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        setBarProgress(
          Math.min(100, Math.round((window.scrollY / docHeight) * 100))
        );
      } else {
        setBarProgress(0);
      }

      // Content-only scroll → hover badge.
      if (!el) {
        setShowProgress(false);
        setProgress(0);
        return;
      }
      const contentTop    = el.offsetTop;
      const contentHeight = el.offsetHeight;
      const scrolled      = window.scrollY - contentTop;
      const range         = contentHeight - window.innerHeight;
      const pct = range > 0
        ? Math.min(100, Math.max(0, Math.round((scrolled / range) * 100)))
        : 0;
      setProgress(pct);
      setShowProgress(window.scrollY > contentTop - 100);
    }

    function handleEnter() { setHovering(true); }
    function handleLeave() { setHovering(false); }

    if (el) {
      el.addEventListener('mouseenter', handleEnter);
      el.addEventListener('mouseleave', handleLeave);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (el) {
        el.removeEventListener('mouseenter', handleEnter);
        el.removeEventListener('mouseleave', handleLeave);
      }
    };
  }, []);

  // 24 = SVG circle radius. Pre-compute the dash math so the JSX
  // stays readable and we don't recompute on every render.
  const RADIUS = 24;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE * (1 - progress / 100);

  return (
    <>
      {/* Top progress bar — sits just below the h-20 site nav (80px),
          renders only once the reader has started scrolling so a
          stationary page stays uncluttered. */}
      {barProgress > 0 && (
        <div
          className="fixed left-0 right-0 z-40"
          style={{ top: '80px' }}
          aria-hidden="true"
        >
          <div className="h-[3px] w-full bg-gray-100/80 dark:bg-white/10" />
          <div
            className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-blue-400 to-[#48B0FF] shadow-[0_0_8px_rgba(36,134,255,0.5)] transition-[width] duration-150 ease-out"
            style={{ width: `${barProgress}%` }}
          />
        </div>
      )}

      {children}

      {showProgress && (
        <div
          className={
            // bottom-20 keeps clear of the global ScrollToTopButton at
            // bottom-8; both share the right-8 column.
            'fixed bottom-[85px] right-6 z-50 transition-all duration-300 ' +
            (hovering
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-2 opacity-0')
          }
          aria-hidden="true"
        >
          <div className="relative h-14 w-14 rounded-full bg-white shadow-lg">
            <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
              <circle
                cx="28" cy="28" r={RADIUS}
                fill="none"
                stroke="rgba(36,134,255,0.15)"
                strokeWidth="4"
              />
              <circle
                cx="28" cy="28" r={RADIUS}
                fill="none"
                stroke="#2486FF"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className="transition-all duration-150"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-blue-600">{progress}%</span>
            </div>
          </div>
        </div>
      )}

    </>
  );
}