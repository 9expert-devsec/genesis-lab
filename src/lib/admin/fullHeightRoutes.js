/**
 * Which admin routes manage their own full-height layout.
 *
 * ── WHY THIS LEFT AdminContentWrapper ─────────────────────────────────────
 * The list used to live inside that client component, which was right while it
 * had ONE reader: strip the `p-6` so a page declaring `h-[100dvh]` fills `main`
 * exactly. It now has TWO, and they are in different runtimes — the wrapper
 * (client) still decides the padding, and `admin/layout.jsx` (server) decides
 * whether `main` is a scroll container at all. A server layout cannot read a
 * list that only exists inside a `'use client'` module without dragging it into
 * the server graph, and copying the patterns would be two lists that must agree
 * about every route forever.
 *
 * So the list moved here, to a plain module both can import, and the two
 * decisions are now made from one source. Nothing about WHICH routes match
 * changed in the move; the reasoning for each entry came with it.
 *
 * ── WHY THE LAYOUT CARES, MEASURED ────────────────────────────────────────
 * `main` is `relative h-screen flex-1 overflow-y-auto`. On a full-height route
 * the page inside it is exactly `100dvh`, so there is nothing for `main` to
 * scroll — but it is still a SCROLL CONTAINER, and a scroll container can be
 * scrolled by something other than the user.
 *
 * Measured in Chrome at 1920×945 on `/admin/pages/builder/<id>/edit`, after
 * selecting a `promotion_bundle` section: `main.scrollHeight` 1078 against
 * `clientHeight` 945 — 133px of scrollable overflow that nothing visibly
 * occupies. Focusing the first `sr-only` toggle checkbox in the settings panel
 * then scrolled `main` to 133, taking the editor's top toolbar off-screen and
 * leaving a 133px blank band under the columns. Exactly the reported symptom.
 *
 * The 133px itself could NOT be removed. `overflow: hidden` on the wrapper, on
 * `main`, on the grid and on the settings panel each left `scrollHeight` at
 * 1078 — it is how Chrome computes an ancestor's scrollable overflow for a grid
 * item that is itself a scroll container, not an element anyone can delete. So
 * the fix is to stop `main` being scrollABLE on these routes rather than to
 * chase the overflow.
 *
 * ── `clip`, NOT `hidden`, AND THAT DISTINCTION IS THE WHOLE FIX ───────────
 * `overflow: hidden` still establishes a scroll container: it removes the
 * scrollbar and user scrolling, and leaves the element perfectly scrollable by
 * `focus()`, `scrollIntoView` and `scrollTop =`. Measured: with
 * `overflow: hidden` on `main`, focusing that same checkbox still moved it 133.
 * `overflow-y: clip` does not create a scroll container at all, and measured 0.
 *
 * The INNER columns are untouched and must stay that way — the canvas, the
 * structure tree and the settings panel each own an `overflow-y-auto`, and the
 * settings panel still reported 2050/882 (scrolling) under every variant.
 */

/**
 * ── WHY A LIST AND NOT A PREFIX ─────────────────────────────────────────────
 * `/admin/articles/` can be a prefix because EVERY route under it — `new` and
 * `[id]/edit` — is a full-height editor.
 *
 * `/admin/courses/` cannot. Four routes live there and only ONE is full-height:
 *
 *   /admin/courses                  list        needs p-6
 *   /admin/courses/new              create form renders the same shell
 *   /admin/courses/[courseId]       promos/FAQ  needs p-6
 *   /admin/courses/[_id]/edit       the shell   must NOT have p-6
 *
 * A prefix match would strip the padding off two pages to fix two, which is how
 * the next regression starts. Hence exact patterns for those.
 */
const FULL_HEIGHT_ROUTES = [
  // Every /admin/articles/* route is a full-height editor.
  (path) => path.startsWith('/admin/articles/'),
  // The course editor…
  (path) => /^\/admin\/courses\/[^/]+\/edit\/?$/.test(path),
  /**
   * …and the course CREATE page, which renders the same shell.
   *
   * `new` is matched literally and separately from `[_id]/edit` because the two
   * patterns describe different routes that happen to share a layout —
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
   * editor. Both render `PageBuilderEditor → EditorProvider → EditorShell` and
   * nothing else. A third builder route added later is another editor by
   * construction, which is what makes this a rule rather than a coincidence
   * about today's two files.
   *
   * `/admin/pages` ITSELF IS NOT MATCHED, which is why this is anchored on
   * `/admin/pages/builder/` rather than `/admin/pages/`: the bare route is the
   * list of both page kinds and wants its `p-6`.
   */
  (path) => path.startsWith('/admin/pages/builder/'),
  /**
   * …and the Advanced HTML editor: `/admin/pages/new` and
   * `/admin/pages/[id]/edit`, which render the older Tiptap `CustomPageForm`.
   *
   * It declares `flex h-[100dvh] flex-col` exactly as the builder shell does,
   * so the `main`-is-not-a-scroller half applies to it for the same reason and
   * was measured on it too — see the layout.
   *
   * TWO EXACT PATTERNS, NOT A `/admin/pages/` PREFIX, for the anchor reason
   * above. `new` is separate from `[id]/edit` so a page whose id is literally
   * "new" cannot collapse the two.
   */
  (path) => /^\/admin\/pages\/new\/?$/.test(path),
  (path) => /^\/admin\/pages\/[^/]+\/edit\/?$/.test(path),
];

/** Does `pathname` manage its own full-height layout? */
export function isFullHeightRoute(pathname) {
  const path = typeof pathname === 'string' ? pathname : '';
  return FULL_HEIGHT_ROUTES.some((matches) => matches(path));
}
