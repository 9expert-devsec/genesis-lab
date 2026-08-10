'use client';

import { usePathname } from 'next/navigation';

/**
 * Wraps admin page content with the standard `p-6` padding, except on routes
 * that manage their own full-height layout.
 *
 * ── WHY THE OPT-OUT EXISTS, AND WHAT GOES WRONG WITHOUT IT ──────────────────
 * The layout above is `<main class="h-screen overflow-y-auto">` (layout.jsx:59)
 * inside `<div class="flex h-screen overflow-hidden">` (layout.jsx:49). A page
 * that declares its own `h-[100dvh]` therefore fills `main` EXACTLY — but only
 * if nothing between them adds height. Put `p-6` in the middle and the content
 * box becomes 100dvh + 48px, so:
 *
 *   · `main` grows a SECOND scrollbar, inside the one the sidebar row already
 *     pins, and
 *   · the page's own sticky-by-construction header scrolls out of view, which
 *     is the precise thing a fixed-height flex column is built to prevent.
 *
 * It is not a spacing bug even though that is how it is reported. The padding
 * is fine; nesting a viewport-height box inside it is not.
 *
 * ── WHY A LIST AND NOT A PREFIX ─────────────────────────────────────────────
 * `/admin/articles/` can be a prefix because EVERY route under it — `new` and
 * `[id]/edit` — is a full-height editor.
 *
 * `/admin/courses/` cannot. Four routes live there and only ONE is full-height:
 *
 *   /admin/courses                  list        needs p-6
 *   /admin/courses/new              create form needs p-6 (linear layout)
 *   /admin/courses/[courseId]       promos/FAQ  needs p-6
 *   /admin/courses/[_id]/edit       the shell   must NOT have p-6
 *
 * A prefix match would strip the padding off three pages to fix one, which is
 * how the next regression starts. Hence an exact pattern for that one route.
 */
const FULL_HEIGHT_ROUTES = [
  // Every /admin/articles/* route is a full-height editor.
  (path) => path.startsWith('/admin/articles/'),
  // ONLY the course editor — not the list, not new, not the promos page.
  (path) => /^\/admin\/courses\/[^/]+\/edit\/?$/.test(path),
];

export function AdminContentWrapper({ children }) {
  const pathname = usePathname() ?? '';
  const isFullHeight = FULL_HEIGHT_ROUTES.some((matches) => matches(pathname));

  return (
    <div className={isFullHeight ? '' : 'p-6'}>
      {children}
    </div>
  );
}