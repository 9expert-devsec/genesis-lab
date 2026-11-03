'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAttribution } from '@/lib/attribution/attributionStore';

/**
 * Records where the visitor came from, for the registration they may submit
 * later. See src/lib/attribution/attribution.js for the rules and
 * attributionStore.js for the storage.
 *
 * NOT gated on consent, and NOT inside the Analytics components: it is not
 * analytics. Nothing leaves the browser until the visitor submits a form.
 *
 * usePathname only, never useSearchParams — the same rule LinkerParamCleaner
 * follows, and for the same reason: this sits in the root layout and must not
 * bail static pages out to client rendering. It reads `window.location` in the
 * effect, so the UTMs of the landing URL are seen on the first run. A soft
 * navigation that changes only the query is not re-read, which is correct: our
 * own links never carry UTMs.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    captureAttribution();
  }, [pathname]);

  return null;
}
