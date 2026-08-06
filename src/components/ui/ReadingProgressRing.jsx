'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { computeReadingProgress, findOrWatchAnchor } from '@/lib/readingProgress';

/**
 * Reading progress, as a ring in the floating dock's top slot.
 *
 * ── IT GATES ITSELF, THE DOCK DOES NOT GATE IT ──────────────────────────────
 * Same ownership split as ChatLauncher: the root layout says "this exists", the
 * component says "not on this page", and FloatingActionDock only knows there is
 * a top position. The dock never learns that articles exist.
 *
 * TWO gates, and both are load-bearing for different reasons. The ROUTE gate
 * (isReadingProgressRoute) decides whether to look for the anchor at all — it
 * is what keeps a permanent MutationObserver off every non-article page. The
 * ANCHOR gate decides whether to render — it covers the article page whose body
 * has not hydrated yet.
 *
 * ── NOTHING, NEVER ZERO ─────────────────────────────────────────────────────
 * If the anchor is not in the DOM this renders `null`. It must never render a
 * ring stuck at 0%: an absent ring reads as "this page has no progress
 * indicator", which is true and unremarkable, while a ring frozen at zero reads
 * as a broken feature — and would do so on every non-article page on the site.
 *
 * ── THE ANCHOR CAN ARRIVE LATE, SO WE OBSERVE FOR IT ────────────────────────
 * The article body is injected with dangerouslySetInnerHTML and this component
 * mounts from the root layout, so on a cold navigation the ring can mount
 * first. A one-shot lookup would miss it permanently. A MutationObserver waits
 * for it and disconnects the moment it lands — chosen over polling because this
 * component mounts on EVERY page, and on the ones with no article the observer
 * is the cheaper thing to leave running (it fires only on real DOM changes; a
 * timer fires regardless). The lookup restarts on `pathname` so a client-side
 * navigation between articles re-binds.
 *
 * ── 44px, MATCHING THE OTHER TWO DOCK SLOTS ─────────────────────────────────
 * It shipped at 56px. Three diameters stacked in one column reads as unstudied,
 * and the SVG carries a viewBox so nothing about the geometry has to change:
 * the stroke lands at 3.14px and the arc at 118.5px of circumference, both
 * comfortably legible. The percentage label drops to 10px to fit the smaller
 * clear area.
 */
export function ReadingProgressRing() {
  const pathname = usePathname();
  const [anchor, setAnchor] = useState(null);
  const [{ pct, started }, setProgress] = useState({ pct: 0, started: false });
  const [hovering, setHovering] = useState(false);

  // Find the anchor — now, or whenever it appears, or NEVER on a route where it
  // cannot. The route gate lives inside findOrWatchAnchor so that "no observer
  // is constructed off-article" is a counted fact rather than a claim about
  // statement order; see the note there.
  useEffect(() => {
    setAnchor(null);
    setProgress({ pct: 0, started: false });
    return findOrWatchAnchor({
      pathname,
      doc: document,
      ObserverCtor: MutationObserver,
      onFound: setAnchor,
    });
  }, [pathname]);

  // Measure it. Hover is read off the SAME element rather than plumbed down
  // from the article, so the ring needs nothing from that component tree.
  useEffect(() => {
    if (!anchor) return undefined;

    const measure = () =>
      setProgress(
        computeReadingProgress({
          contentTop: anchor.offsetTop,
          contentHeight: anchor.offsetHeight,
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
        }),
      );
    // INHERITED BEHAVIOUR, DELIBERATELY UNCHANGED: the ring is only fully
    // opaque while the pointer is over the article body. That came from the
    // version that lived inside ArticleDetailClient and is kept as-is here.
    //
    // It means the ring is effectively invisible on TOUCH, where there is no
    // hover — untested there, and not a behaviour this move introduced or is
    // trying to fix. Changing it is a separate decision about whether the ring
    // should be permanent on small screens at all.
    const enter = () => setHovering(true);
    const leave = () => setHovering(false);

    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    anchor.addEventListener('mouseenter', enter);
    anchor.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      anchor.removeEventListener('mouseenter', enter);
      anchor.removeEventListener('mouseleave', leave);
    };
  }, [anchor]);

  // No subject → no ring. Never a ring at 0%.
  if (!anchor || !started) return null;

  const RADIUS = 24;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <div
      // THE DOCK MAKES EVERY DIRECT CHILD CLICKABLE. This one must not be: it is
      // decorative and aria-hidden, and clicks belong to whatever is behind it.
      // Without this attribute the ring becomes a 44px dead zone in the corner.
      // See the opt-out rule on FloatingActionDock's container.
      data-dock-passthrough=""
      data-reading-progress=""
      aria-hidden="true"
      className={`transition-opacity duration-9e-reveal ease-9e ${
        hovering ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="relative h-11 w-11 rounded-full bg-[var(--surface-raised)] shadow-9e-md ring-1 ring-[var(--surface-border)]">
        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="rgba(36,134,255,0.15)" strokeWidth="4" />
          <circle
            cx="28"
            cy="28"
            r={RADIUS}
            fill="none"
            stroke="#2486FF"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - pct / 100)}
            className="transition-all duration-150"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-9e-action dark:text-9e-air">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
