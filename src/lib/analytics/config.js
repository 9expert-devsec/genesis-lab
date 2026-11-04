// Central analytics config — GA4 + Google Ads IDs/labels live in ONE place.
// These are public client-side IDs by nature (they ship in the browser), so
// they are safe to hardcode here. If a NEXT_PUBLIC_* convention is later adopted,
// read from process.env with these as fallback defaults.

// GA4: the www stream of property "9Expert Tag"; G-6043WVS74D was the inherited masterclass ID, replaced 2026-10-05.
export const GA4_ID = 'G-ZBWWCS7B6D';
export const ADS_ID = 'AW-1060453366';

/**
 * Meta (Facebook) Pixel.
 *
 * Public in the same sense as the two above — it ships in the browser and is
 * visible to anyone who opens devtools on the page. It is NOT, however, loaded
 * on the same terms: gtag.js loads for everyone under Consent Mode advanced,
 * while fbevents.js is not requested at all until marketing consent exists.
 * See src/lib/analytics/metaPixel.js for why the two differ.
 */
export const META_PIXEL_ID = '1256361497884237';

export const DEFAULT_CURRENCY = 'THB';

/**
 * Google Tag Manager — the switch between the two analytics modes.
 *
 *   unset  → gtag.js exactly as before. GA4 + Ads are configured in code.
 *   set    → GTM owns EVERY Google tag (GA4 + Ads). The code stops sending
 *            gtag events and pushes the dataLayer contract instead; there is no
 *            window in which both send. See src/lib/analytics/gtag.js.
 *
 * The Meta Pixel is NOT part of this switch (plan D6): it stays in code, with
 * its consent gate, in both modes.
 *
 * NEXT_PUBLIC_*, so it is inlined at BUILD time — changing it in Vercel needs a
 * redeploy, and removing it plus a redeploy is the whole rollback.
 *
 * Validated, not trusted: the id is interpolated into a script URL on every
 * page, so anything that is not the GTM-XXXX shape is treated as unset rather
 * than shipped.
 */
const RAW_GTM_ID = String(process.env.NEXT_PUBLIC_GTM_ID ?? '').trim();
export const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/.test(RAW_GTM_ID) ? RAW_GTM_ID : '';
export const GTM_ENABLED = GTM_ID !== '';

// Google Ads conversion labels (send_to = `${ADS_ID}/${label}`)
// Used in Batch 2 — defined here now so everything is in one config.
export const ADS_CONVERSION_LABELS = {
  masterclassCard:        'oNk9COrdksUcEPb31PkD',
  masterclassQr:          'GWXVCJrPqMUcEPb31PkD',
  masterclassFormSubmit:  'ZWAOCIPWqMUcEPb31PkD',
  masterclassDownload:    'bBK8CKStp8UcEPb31PkD',
  masterclassLanding:     'ToxDCI7YqMUcEPb31PkD',
};

// Helper to build a send_to string
export const adsSendTo = (label) => `${ADS_ID}/${label}`;
