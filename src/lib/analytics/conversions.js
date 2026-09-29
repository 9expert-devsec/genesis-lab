// Conversion helpers — centralize the gtag calls so every call site is a
// consistent one-liner. Plain functions ('use client' not needed); each
// delegates to gtagEvent, which is a no-op when gtag isn't loaded.
//
// ── META IS FANNED OUT FROM HERE, NOT FROM THE CALL SITES ───────────────────
// Each helper below now sends to Google AND to Meta. No call site changed, and
// none should: a payment page that has to remember two analytics vendors is a
// payment page that will remember one of them next time somebody edits it.
// This file is the one place that knows a conversion goes to more than one
// destination, which is also the only place the two mappings can be compared.
//
// Every Meta call is a no-op when the pixel is not loaded — the same contract
// gtagEvent has, and a busier one in practice: gtag.js loads for everyone under
// Consent Mode advanced, while fbevents.js is only there for a visitor who
// granted marketing consent. See src/lib/analytics/metaPixel.js.

import { gtagEvent } from '@/lib/analytics/gtag';
import {
  metaEventOptions,
  metaPixelTrack,
  metaPixelTrackCustom,
} from '@/lib/analytics/metaPixel';
import {
  ADS_CONVERSION_LABELS,
  adsSendTo,
  DEFAULT_CURRENCY,
} from '@/lib/analytics/config';

// GA4 purchase event + Google Ads purchase conversion, fired together.
// method: 'credit_card' | 'promptpay'
export function trackPurchase({ method, value, transactionId, items }) {
  const label =
    method === 'credit_card'
      ? ADS_CONVERSION_LABELS.masterclassCard
      : ADS_CONVERSION_LABELS.masterclassQr;

  // GA4 ecommerce purchase
  gtagEvent('purchase', {
    currency: DEFAULT_CURRENCY,
    value,
    transaction_id: transactionId,
    items: items ?? [],
  });
  // Google Ads conversion
  gtagEvent('conversion', {
    send_to: adsSendTo(label),
    value,
    currency: DEFAULT_CURRENCY,
    transaction_id: transactionId,
  });
  /*
   * Meta Purchase. `eventID` carries the SAME transaction id the Ads
   * conversion above uses, so if a Conversions API is ever added server-side
   * the two reports can be deduplicated against each other. There is no CAPI
   * today; the id is here because it cannot be added retroactively to events
   * already sent. See metaEventOptions.
   *
   * `method` is deliberately not forwarded. Meta's Purchase has no field for
   * it, and inventing a custom property would make the two platforms' purchase
   * counts differ by a dimension only one of them has.
   */
  metaPixelTrack(
    'Purchase',
    { value, currency: DEFAULT_CURRENCY },
    metaEventOptions(transactionId),
  );
}

// Form-submit lead — fired once when a registration is created (before payment).
export function trackFormSubmitLead({ value, transactionId } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassFormSubmit),
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
    ...(transactionId ? { transaction_id: transactionId } : {}),
  });
  // GA4 standard lead event (nice for funnels)
  gtagEvent('generate_lead', {
    ...(value != null ? { value, currency: DEFAULT_CURRENCY } : {}),
  });
  /*
   * Meta Lead. value/currency are OMITTED rather than sent as null when the
   * caller has no price yet — a Lead worth ฿0 and a Lead of unknown worth are
   * different facts, and Ads Manager averages the first into the campaign's
   * value while ignoring the second.
   */
  metaPixelTrack(
    'Lead',
    value != null ? { value, currency: DEFAULT_CURRENCY } : {},
    metaEventOptions(transactionId),
  );
}

// Course-outline download.
export function trackDownload({ fileName } = {}) {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassDownload),
  });
  gtagEvent('file_download', { file_name: fileName ?? 'course_outline' }); // GA4
  /*
   * trackCustom, not track: there is no standard Meta event for "downloaded a
   * document". A standard event bent to fit (Lead, ViewContent) would land in
   * the same bucket as a real one and quietly corrupt whichever campaign
   * optimises for it.
   *
   * No fileName. It would be the one property here carrying user-chosen
   * content to Meta, for a custom event nothing is optimising against.
   */
  metaPixelTrackCustom('OutlineDownload');
}

// Landing-page view conversion (scoped to a specific landing slug by the caller).
export function trackLandingView() {
  gtagEvent('conversion', {
    send_to: adsSendTo(ADS_CONVERSION_LABELS.masterclassLanding),
  });
  /*
   * ViewContent, with no parameters. Meta's ViewContent accepts
   * content_ids/content_type for catalogue matching; there is no Meta
   * catalogue behind this site, so sending ids would be sending keys into an
   * empty table. The caller scopes this to a specific landing slug, and that
   * scoping is what the event means — it is not a page view, it is "saw the
   * page we buy traffic for".
   */
  metaPixelTrack('ViewContent');
}
