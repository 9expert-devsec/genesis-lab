'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { gtagPageView } from '@/lib/analytics/gtag';

// Fires GA4 page_view on every SPA route change. The App Router doesn't reload
// on client-side navigation, and Analytics inits GA4 with send_page_view:false,
// so this is the single source of page_view events (including the first load).
//
// NOTE: useSearchParams() requires a Suspense boundary in the App Router, so the
// caller MUST render this inside <Suspense fallback={null}> (see layout.jsx).
export function AnalyticsPageTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    const fullPath = qs ? `${pathname}?${qs}` : pathname;
    gtagPageView(fullPath);
  }, [pathname, searchParams]);

  return null;
}
