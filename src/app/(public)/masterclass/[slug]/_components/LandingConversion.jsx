'use client';

import { useEffect, useRef } from 'react';
import { trackLandingView } from '@/lib/analytics/conversions';

// Slugs that count as a tracked landing-page view. Add more slugs here later
// as additional masterclass landings are promoted via Google Ads.
const LANDING_SLUGS = ['mas-claude-ai-for-data-analyst'];

// Fires the Google Ads landing conversion exactly once on mount, but only for
// the scoped landing slug(s). The ref guard makes it safe against React
// strict-mode's double effect invocation in dev. Renders nothing.
export function LandingConversion({ slug }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!LANDING_SLUGS.includes(slug)) return;
    fired.current = true;
    trackLandingView();
  }, [slug]);

  return null;
}
