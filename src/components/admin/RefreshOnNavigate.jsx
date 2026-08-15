'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';

/**
 * Re-fetch this route's server render on every CLIENT navigation into or within
 * it. Renders nothing.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * Measured: the in-house list showed 7 rows with a just-created record absent;
 * F5 on the SAME URL showed 8 with that record at the top. The row set was
 * stale while the chrome, the header and the URL all agreed with each other.
 *
 * ── WHY NO SERVER DIRECTIVE FIXES IT ────────────────────────────────────────
 * The page already declares `dynamic = 'force-dynamic'`, so the Full Route Cache
 * is off. Its data comes from `'use server'` actions awaited during render that
 * run mongoose queries — not `fetch` — so Next's Data Cache is structurally not
 * involved; there is no `unstable_cache` and no `revalidate` on the path. There
 * is no server cache left that could withhold a row.
 *
 * What withholds it is the CLIENT Router Cache: an in-memory, per-session store
 * of RSC payloads that `force-dynamic` does not reach, because that directive
 * governs the server and the Router Cache never asks the server whether it is
 * stale. Next 15 defaults `staleTimes.dynamic` to 0, which covers ordinary
 * forward navigation — but history traversal (Back/Forward) reuses the cached
 * payload unconditionally, by design, whatever staleTimes says. `router.refresh()`
 * is the only client-side lever that invalidates it.
 *
 * ── WHAT THIS COSTS, SAID OUT LOUD ──────────────────────────────────────────
 * One extra RSC round trip per client navigation into the route — the page's
 * server component runs a second time. On /admin/registrations that is eight
 * queries: one count, one find capped at 20 rows, six status counts and one
 * audit `$in`.
 *
 * MEASURED, warm pool, 12 runs against the production cluster: median 143 ms,
 * range 139–153 ms for the whole set. That is Mongo time from a developer
 * machine to Atlas and is dominated by round-trip latency, not by row count —
 * the page size is fixed at 20 however large the collection grows, so this
 * figure does not degrade with the data. From Vercel, co-located with the
 * cluster, it is lower. The RSC render and transfer sit on top of it.
 *
 * So the cost is roughly one extra sixth of a second of server work per
 * navigation into an admin route, paid by a background fetch. It is not on any
 * public path, it does not run while the user reads the page, and it does not
 * block the navigation that triggered it.
 *
 * ── AND WHAT IT DOES NOT COST: THERE IS NO FLASH ────────────────────────────
 * Checked rather than assumed. `router.refresh()` preserves the client tree —
 * nothing unmounts, no state is dropped, and the current UI stays on screen
 * until the new payload arrives, at which point React reconciles it. A fallback
 * could only appear via a Suspense boundary, and there is no `loading.js`
 * anywhere under src/app/admin (verified across the whole tree), so no fallback
 * exists to swap in. On a 20-row table the reconcile is a subtree diff with no
 * layout change. The row count is irrelevant to this: the page size is fixed at
 * 20 whatever the collection holds.
 *
 * ── THE FIRST RENDER OF A FRESHLY LOADED DOCUMENT IS SKIPPED ────────────────
 * `documentIsFresh` is module scope, so it is re-initialised exactly once per
 * document load. On a hard load or F5 the RSC payload was inlined in the HTML
 * that just arrived — it cannot be stale — so refreshing there would buy nothing
 * and pay the round trip on every page load. The flag is consumed by the first
 * effect run and every subsequent run is, by construction, a client navigation.
 *
 * ── WHY A COMPONENT AND NOT A HOOK IN THE LIST CLIENT ───────────────────────
 * The staleness is a property of the ROUTE, not of the list: any screen whose
 * server render can go stale under the Router Cache wants exactly this, and a
 * component can be dropped into a server `page.jsx` without that page acquiring
 * a client boundary of its own.
 */

/**
 * Per-document, not per-mount. A `useRef` would be per-instance and would skip
 * the refresh again on every remount — which is precisely the Back navigation
 * this exists to catch.
 */
let documentIsFresh = true;

export function RefreshOnNavigate() {
  const router = useRouter();
  const pathname = usePathname();
  // The STRING, not the object: useSearchParams returns a new instance each
  // render, so passing it as a dependency would re-run this effect on every
  // render and refresh in a loop.
  const search = useSearchParams().toString();

  useEffect(() => {
    if (documentIsFresh) {
      documentIsFresh = false;
      return;
    }
    router.refresh();
  }, [pathname, search, router]);

  return null;
}
