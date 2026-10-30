'use client';

import { usePathname } from 'next/navigation';

import { isFullHeightRoute } from '@/lib/admin/fullHeightRoutes';
import { AdminContentWrapper } from './AdminContentWrapper';

/**
 * The admin content area — `<main>` — with its scroll mode decided from the
 * CURRENT route on every render.
 *
 * ── WHY THIS IS A CLIENT COMPONENT (ADM-1b) ─────────────────────────────────
 * The decision used to live in src/app/admin/layout.jsx, read from the
 * middleware's `x-pathname` header. A layout is NOT re-rendered on client
 * navigation, so that header was the path the admin LANDED on, for the rest of
 * the session. Measured at 1440×900: a fresh article editor, then the sidebar
 * link to /admin/instructors → `main` still `overflow-y: clip`, scrollHeight
 * 1239 against 900 and nothing past the fold reachable; /admin/cache the same
 * at 5433. The reverse direction left the editor's `main` scrollable.
 * `usePathname()` changes with every navigation and is correct during SSR, so
 * the first paint and every later route agree.
 *
 * ── `main` IS NOT A SCROLL CONTAINER ON A FULL-HEIGHT ROUTE ─────────────────
 * On those routes the page inside is exactly `100dvh`, so there is nothing for
 * `main` to scroll — but while it remains a scroll container something OTHER
 * than the user can scroll it, and did.
 *
 * MEASURED in Chrome at 1920x945 on a builder edit page with a
 * promotion_bundle section selected: `main.scrollHeight` 1078 against
 * `clientHeight` 945, and focusing the first sr-only toggle checkbox in the
 * settings panel scrolled `main` to 133 — taking the editor's top toolbar
 * off-screen and leaving a 133px blank band below the columns.
 *
 * `overflow-y-clip`, NOT `hidden`. `hidden` still establishes a scroll
 * container — it only removes the scrollbar and user scrolling — and measured
 * 133 all the same. `clip` establishes none, and measured 0.
 *
 * Every OTHER admin route keeps `overflow-y-auto`: a list or a form page is
 * content-height and genuinely needs `main` to scroll.
 *
 * `relative` so absolute descendants with no positioned ancestor (an `sr-only`
 * span) anchor inside the scroll container instead of escaping it.
 */
export function AdminMain({ children }) {
  const pathname = usePathname() ?? '';
  return (
    <main
      className={`relative h-screen flex-1 bg-[var(--page-bg)] ${
        isFullHeightRoute(pathname) ? 'overflow-y-clip' : 'overflow-y-auto'
      }`}
    >
      <AdminContentWrapper>{children}</AdminContentWrapper>
    </main>
  );
}
