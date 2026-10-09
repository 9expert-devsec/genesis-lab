'use client';

import { usePathname } from 'next/navigation';

import { isFullHeightRoute } from '@/lib/admin/fullHeightRoutes';

/**
 * Wraps admin page content with the standard `p-6` padding, except on routes
 * that manage their own full-height layout.
 *
 * ── WHY THE OPT-OUT EXISTS, AND WHAT GOES WRONG WITHOUT IT ──────────────────
 * The layout above is `<main class="h-screen overflow-y-auto">` inside
 * `<div class="flex h-screen overflow-hidden">`. A page that declares its own
 * `h-[100dvh]` therefore fills `main` EXACTLY — but only if nothing between
 * them adds height. Put `p-6` in the middle and the content box becomes
 * 100dvh + 48px, so:
 *
 *   · `main` grows a SECOND scrollbar, inside the one the sidebar row already
 *     pins, and
 *   · the page's own sticky-by-construction header scrolls out of view, which
 *     is the precise thing a fixed-height flex column is built to prevent.
 *
 * It is not a spacing bug even though that is how it is reported. The padding
 * is fine; nesting a viewport-height box inside it is not.
 *
 * ── THE ROUTE LIST MOVED, AND THE REASON IS A SECOND READER ────────────────
 * `FULL_HEIGHT_ROUTES` used to live in this file, which was right while this
 * component was its only reader. `admin/layout.jsx` is now a second one — it
 * decides whether `main` is a scroll container at all on these routes — and a
 * server layout cannot read a list that exists only inside a `'use client'`
 * module. Two copies of the patterns would be two lists obliged to agree about
 * every route forever, so the list is in `@/lib/admin/fullHeightRoutes` and
 * both decisions are made from it. That module carries the per-route reasoning
 * and the measurement behind the layout's half.
 */
export function AdminContentWrapper({ children }) {
  const pathname = usePathname() ?? '';
  const isFullHeight = isFullHeightRoute(pathname);

  return (
    <div className={isFullHeight ? '' : 'p-6'}>
      {children}
    </div>
  );
}
