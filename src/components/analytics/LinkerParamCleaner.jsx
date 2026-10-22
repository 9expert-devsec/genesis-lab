'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { GA4_ID } from '@/lib/analytics/config';
import { stripLinkerParam } from '@/lib/analytics/linkerParam';

/**
 * Takes `_gl` back out of the address bar once gtag has read it.
 *
 * `url_passthrough` (consentMode.js) STAYS ON — it is what carries a
 * non-consented visitor's ids from one document to the next. This does not
 * stop gtag producing `_gl`; it only tidies the bar after the fact. See
 * src/lib/analytics/linkerParam.js for the parameter itself.
 *
 * ══ WHERE `_gl` ACTUALLY COMES FROM ════════════════════════════════════════
 * gtag decorates an anchor's DOM `href` on mousedown. A Next <Link> navigates
 * to its `href` PROP, so a soft navigation never carries it. A FULL document
 * load does — a plain <a>, a new tab, a click before hydration — and in the
 * denied state that load's first page_view must still have `_gl` in its `dl`:
 * the denied-state `cid` is fresh on every document, so the linker value in
 * the hit's URL IS the continuity. Measured, round GL-1.
 *
 * ── SO: NOT BEFORE GTAG HAS READ IT ───────────────────────────────────────
 * `gtag('get', …, cb)` is queued behind the consent defaults, both `config`
 * calls and the first page_view, and gtag.js answers it only once it has
 * worked through that queue. Its callback is the "the URL has been consumed"
 * signal. The timeout is for gtag.js never arriving at all (an ad blocker):
 * then nothing is reading the URL and the bar may as well be clean.
 *
 * The signal is awaited ONCE per document, module-level, so React's dev-mode
 * double effect cannot strip early. After it, every later run — a soft
 * navigation, where gtag never re-reads the URL — strips immediately.
 *
 * ── HISTORY ───────────────────────────────────────────────────────────────
 * `replaceState(history.state, …)`: the app router keeps its own entry in
 * `history.state`, and since Next 14.1 it observes native replaceState, so
 * usePathname/useSearchParams follow along without an RSC refetch.
 * `router.replace` would refetch. AnalyticsPageTracker is keyed on the
 * `_gl`-free path for exactly this reason — the replace is not a page view.
 *
 * usePathname only, never useSearchParams: this sits in the root layout and
 * must not bail static pages out to client rendering. It reads
 * `window.location` inside the effect instead. A navigation that changes ONLY
 * the query (same pathname) does not re-run it; the next pathname change does.
 */
const GTAG_READY_TIMEOUT_MS = 2000;

let gtagHasReadTheUrl = null;

function whenGtagHasReadTheUrl() {
  if (!gtagHasReadTheUrl) {
    gtagHasReadTheUrl = new Promise((resolve) => {
      const timer = setTimeout(resolve, GTAG_READY_TIMEOUT_MS);
      try {
        window.gtag('get', GA4_ID, 'client_id', () => {
          clearTimeout(timer);
          resolve();
        });
      } catch {
        // no gtag stub at all — the timeout still resolves
      }
    });
  }
  return gtagHasReadTheUrl;
}

function cleanAddressBar() {
  const { href } = window.location;
  const clean = stripLinkerParam(href);
  if (clean !== href) window.history.replaceState(window.history.state, '', clean);
}

export function LinkerParamCleaner() {
  const pathname = usePathname();

  useEffect(() => {
    if (stripLinkerParam(window.location.href) === window.location.href) return;
    whenGtagHasReadTheUrl().then(cleanAddressBar);
  }, [pathname]);

  return null;
}
