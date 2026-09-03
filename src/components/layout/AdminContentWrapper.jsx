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
  // The course editor…
  (path) => /^\/admin\/courses\/[^/]+\/edit\/?$/.test(path),
  /**
   * …and the course CREATE page, which now renders the same shell.
   *
   * This entry did not exist while `new` used a linear layout, and the test
   * for this file asserted the opposite — that `new` KEEPS its padding. That
   * assertion was correct then and is wrong now; it is flipped in the same
   * commit as this line rather than left to fail mysteriously later.
   *
   * `new` is matched literally and separately from `[_id]/edit` because the
   * two patterns describe different routes that happen to share a layout —
   * collapsing them into `/admin/courses/(new|[^/]+/edit)` would also match a
   * course whose _id is the string "new", which is not a thing worth being
   * clever about.
   */
  (path) => /^\/admin\/courses\/new\/?$/.test(path),
  /**
   * …and the Page Builder editor: `/admin/pages/builder/new` and
   * `/admin/pages/builder/[id]/edit`.
   *
   * A PREFIX IS SAFE HERE, for the same reason `/admin/articles/` is and
   * `/admin/courses/` is not: EVERY route under `/admin/pages/builder/` is the
   * editor. Both of them render `PageBuilderEditor → EditorProvider →
   * EditorShell` and nothing else — no list, no linear form, nothing above the
   * shell that would want padding. A third builder route added later is another
   * editor by construction, which is what makes this a rule rather than a
   * coincidence about today's two files.
   *
   * `/admin/pages` ITSELF IS STILL NOT MATCHED, and that is why this entry is
   * anchored on `/admin/pages/builder/` rather than `/admin/pages/`. The bare
   * route is the list of both page kinds and wants its `p-6` — the same
   * three-pages-broken-to-fix-one arithmetic as the courses note above.
   */
  (path) => path.startsWith('/admin/pages/builder/'),
  /**
   * …and the Advanced HTML editor: `/admin/pages/new` and
   * `/admin/pages/[id]/edit`, which render the older Tiptap `CustomPageForm`.
   *
   * ── THIS WAS MEASURED SEVERAL ROUNDS AGO AND DELIBERATELY LEFT ALONE ──────
   * The note that stood here said `CustomPageForm` declares
   * `flex h-[100dvh] flex-col`, so these two routes were already the
   * 100dvh-inside-p-6 shape this file exists to prevent — and then declined to
   * act, on the grounds that changing a different editor's layout inside a Page
   * Builder commit would be a change nobody had clicked. The test file said the
   * same thing and asked for "its own round, with a browser pass on the Tiptap
   * form".
   *
   * This is that round, and the browser pass was done. Chrome, at 1440×900, on
   * /admin/pages/<id>/edit, BEFORE: the wrapper is `p-6` at 24px on all four
   * sides and `main` reports scrollHeight 948 against clientHeight 900 — the
   * 48px overflow the arithmetic predicts, and the second scrollbar with it.
   * AFTER: no padding class, 0px on all four sides, 900 against 900, no second
   * scrollbar.
   *
   * TWO EXACT PATTERNS, NOT A `/admin/pages/` PREFIX. A prefix would take the
   * padding off the list at `/admin/pages` — see the anchor note above — and
   * would also swallow any future non-editor subroute the moment someone added
   * one. `new` is matched separately from `[id]/edit` for the reason the courses
   * pair is: collapsing them into one alternation would also match a page whose
   * id is literally the string "new".
   */
  (path) => /^\/admin\/pages\/new\/?$/.test(path),
  (path) => /^\/admin\/pages\/[^/]+\/edit\/?$/.test(path),
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