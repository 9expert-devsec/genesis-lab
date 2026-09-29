'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  isMetaPixelReady,
  metaPixelPageView,
  onMetaPixelReady,
} from '@/lib/analytics/metaPixel';

/**
 * The Meta Pixel's PageView, on every route change and on the first load.
 *
 * A sibling of AnalyticsPageTracker rather than a few lines inside it, for one
 * reason: the two disagree about what a page view IS.
 *
 * ── PATHNAME ONLY. NOT THE QUERY STRING. ───────────────────────────────────
 * AnalyticsPageTracker keys on `[pathname, searchParams]` and sends the full
 * path with its query, which is right for GA4 — `?skill=` on the course list
 * is a different report row, and a campaign's `?utm_*` is the whole point of
 * the arriving link.
 *
 * Meta's PageView carries no path of its own; it is counted against the URL the
 * browser is on. Re-firing it when only the query changed inflates the count
 * for exactly the traffic that matters most — a filter click, a UTM-tagged ad
 * landing that then strips its own parameters — and there is no dimension in
 * Ads Manager that would show why. So this keys on `pathname` alone, and
 * merging it into the existing tracker would mean one effect trying to hold
 * both rules.
 *
 * It does NOT call useSearchParams, so it does not need a Suspense boundary of
 * its own. It is mounted inside the existing one next to its sibling anyway,
 * which costs nothing and keeps the two page trackers in one place in the
 * layout.
 *
 * ── WHY IT WAITS FOR A READY SIGNAL ────────────────────────────────────────
 * metaPixelPageView() is a no-op when the pixel has not been initialised, which
 * is correct but not sufficient on its own. MetaPixel and this component are
 * siblings, and effect order between siblings is a property of where they sit
 * in the tree. If this effect ran first it would find no pixel, no-op, and —
 * keyed on pathname — not run again until the visitor navigated, silently
 * losing the first PageView of the session.
 *
 * Subscribing removes the question instead of answering it. Whichever effect
 * runs first, `ready` ends up true and the effect below fires exactly once for
 * the page the visitor is actually on. The same signal is what delivers a
 * PageView when consent is granted MID-session: the pixel initialises, this
 * wakes, and the current page is counted without a navigation.
 */
export function MetaPixelPageTracker() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Covers the case where MetaPixel's effect already ran: there will be no
    // further notification, because the event has already happened.
    if (isMetaPixelReady()) setReady(true);
    return onMetaPixelReady(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    // Still guarded inside metaPixelPageView: `ready` can be stale by a commit
    // if consent was withdrawn, and a revoked pixel must not be sent events.
    metaPixelPageView();
  }, [pathname, ready]);

  return null;
}
