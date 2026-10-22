'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { gtagPageView } from '@/lib/analytics/gtag';
import { stripLinkerParam } from '@/lib/analytics/linkerParam';

// Fires GA4 page_view on every SPA route change. The App Router doesn't reload
// on client-side navigation, and Analytics inits GA4 with send_page_view:false,
// so this is the single source of page_view events (including the first load).
//
// NOTE: useSearchParams() requires a Suspense boundary in the App Router, so the
// caller MUST render this inside <Suspense fallback={null}> (see layout.jsx).
//
// THE `_gl` STRIP IS NOT A PAGE VIEW. LinkerParamCleaner removes `_gl` with
// replaceState, which useSearchParams observes, so this effect re-runs. That
// one re-run — same path once `_gl` is taken off both sides — is skipped;
// every other run fires exactly as before. The payload is unchanged: the first
// hit still carries `_gl` in its page_location, which url_passthrough needs.
export function AnalyticsPageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef(null);

  useEffect(() => {
    const qs = searchParams.toString();
    const fullPath = qs ? `${pathname}?${qs}` : pathname;
    const prev = lastPath.current;
    lastPath.current = fullPath;
    if (prev !== null && prev !== fullPath && stripLinkerParam(prev) === stripLinkerParam(fullPath)) return;
    gtagPageView(fullPath);
  }, [pathname, searchParams]);

  return null;
}
