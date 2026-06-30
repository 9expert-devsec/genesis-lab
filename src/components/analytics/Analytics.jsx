'use client';

import Script from 'next/script';
import { GA4_ID, ADS_ID } from '@/lib/analytics/config';

// Loads gtag.js and inits GA4 + Google Ads with Consent Mode v2.
// Renders the <Script> tags only — no UI.
export function Analytics() {
  return (
    <>
      <Script
        id="gtag-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
        async
      />
      <Script
        id="gtag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            // Consent Mode v2 — default GRANTED for now. To require opt-in later:
            // change these to 'denied' and call gtagConsentUpdate({...}) from a
            // consent banner on accept.
            gtag('consent', 'default', {
              ad_storage: 'granted',
              analytics_storage: 'granted',
              ad_user_data: 'granted',
              ad_personalization: 'granted',
              wait_for_update: 500
            });

            // send_page_view:false — page_view is fired manually on SPA route
            // change (AnalyticsPageTracker) to avoid double-counting the first load.
            gtag('config', '${GA4_ID}', { send_page_view: false });
            gtag('config', '${ADS_ID}');
          `,
        }}
      />
    </>
  );
}
